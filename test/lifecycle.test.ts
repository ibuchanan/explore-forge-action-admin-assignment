import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "./admin-api/test-helpers";
import type { SourceConfigRecord } from "../src/config/source-config-store";
import { runLifecycleValidation } from "../src/lifecycle";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

const SOURCE_CONFIG_KEY = "admin-assignment.source-config";
const RESOLVED_CONFIG_KEY = "admin-assignment.resolved-config";

const validSourceConfigJson = JSON.stringify({
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [
    { key: "jira-admins", label: "Jira admins", name: "jira-administrators" },
  ],
});

function seedExistingRecord(initialRecord: SourceConfigRecord | undefined) {
  let record = initialRecord;
  vi.mocked(kvs.get).mockImplementation(async (key: string) =>
    key === SOURCE_CONFIG_KEY ? record : undefined,
  );
  vi.mocked(kvs.set).mockImplementation(async (key: string, value) => {
    if (key === SOURCE_CONFIG_KEY) {
      record = value as SourceConfigRecord;
    }
  });
}

function findSetCall(key: string) {
  return vi.mocked(kvs.set).mock.calls.find((call) => call[0] === key);
}

describe("runLifecycleValidation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = undefined;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("seeds a configured Source Config from a valid legacy env var when no KVS record exists, then validates active", async () => {
    seedExistingRecord(undefined);
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "acc-1", email: "alice@example.com" }],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ id: "group-1", name: "jira-administrators" }],
          links: {},
        }),
      );

    await runLifecycleValidation();

    const seededRecord = findSetCall(SOURCE_CONFIG_KEY)?.[1];
    expect(seededRecord).toMatchObject({ state: "configured" });
    const storedHealth = findSetCall(RESOLVED_CONFIG_KEY)?.[1];
    expect(storedHealth).toMatchObject({ configHealth: { active: true } });
  });

  it("seeds a configured Source Config but stores inactive Config Health without calling the Admin API when the Service Credential is missing", async () => {
    seedExistingRecord(undefined);
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;

    await runLifecycleValidation();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(findSetCall(SOURCE_CONFIG_KEY)?.[1]).toMatchObject({
      state: "configured",
    });
    expect(findSetCall(RESOLVED_CONFIG_KEY)?.[1]).toMatchObject({
      configHealth: { active: false },
    });
  });

  it("stores an intentionally unconfigured Source Config and inactive Config Health when no KVS record exists and the legacy env var is absent", async () => {
    seedExistingRecord(undefined);
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";

    await expect(runLifecycleValidation()).resolves.toBeUndefined();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(findSetCall(SOURCE_CONFIG_KEY)?.[1]).toEqual({
      state: "unconfigured",
    });
    expect(findSetCall(RESOLVED_CONFIG_KEY)?.[1]).toMatchObject({
      configHealth: { active: false },
    });
  });

  it("stores an intentionally unconfigured Source Config when no KVS record exists and the legacy env var is malformed", async () => {
    seedExistingRecord(undefined);
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = "not json";

    await runLifecycleValidation();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(findSetCall(SOURCE_CONFIG_KEY)?.[1]).toEqual({
      state: "unconfigured",
    });
    expect(findSetCall(RESOLVED_CONFIG_KEY)?.[1]).toMatchObject({
      configHealth: { active: false },
    });
  });

  it("does not reseed from the legacy env var when a configured Source Config record already exists", async () => {
    seedExistingRecord({
      state: "configured",
      sourceConfig: {
        orgId: "existing-org",
        directoryId: "existing-dir",
        authorizedInitiatorEmails: ["bob@example.com"],
        allowedGroups: [
          { key: "existing", label: "Existing", name: "existing-group" },
        ],
        lookup: {
          targetUserTimeoutMs: 10_000,
          targetUserMaxPages: 5,
          configResolutionTimeoutMs: 30_000,
          configResolutionMaxPages: 20,
        },
      },
    });
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(mockApiResponse(200, { data: [], links: {} }))
      .mockResolvedValueOnce(mockApiResponse(200, { data: [], links: {} }));

    await runLifecycleValidation();

    expect(findSetCall(SOURCE_CONFIG_KEY)).toBeUndefined();
    const calls = vi.mocked(api.fetch).mock.calls;
    expect(calls[0]?.[0]).toContain("existing-org");
  });

  it("does not reseed from the legacy env var when an intentionally unconfigured Source Config record already exists", async () => {
    seedExistingRecord({ state: "unconfigured" });
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";

    await runLifecycleValidation();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(findSetCall(SOURCE_CONFIG_KEY)).toBeUndefined();
    expect(findSetCall(RESOLVED_CONFIG_KEY)?.[1]).toMatchObject({
      configHealth: { active: false },
    });
  });
});
