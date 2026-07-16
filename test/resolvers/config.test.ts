import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import type { SourceConfig } from "../../src/config/source-config";
import type { SourceConfigRecord } from "../../src/config/source-config-store";
import { getConfig, resetConfig, saveConfig } from "../../src/resolvers/config";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

const SOURCE_CONFIG_KEY = "admin-assignment.source-config";
const RESOLVED_CONFIG_KEY = "admin-assignment.resolved-config";

const sourceConfig: SourceConfig = {
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [
    { key: "jira-admins", label: "Jira admins", name: "jira-administrators" },
  ],
  lookup: {
    targetUserTimeoutMs: 10_000,
    targetUserMaxPages: 5,
    configResolutionTimeoutMs: 30_000,
    configResolutionMaxPages: 20,
  },
};

const validSaveConfigPayload = {
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [
    { key: "jira-admins", label: "Jira admins", name: "jira-administrators" },
  ],
};

function stubStore(initialRecord: SourceConfigRecord | undefined) {
  let record = initialRecord;
  vi.mocked(kvs.get).mockImplementation(async (key: string) => {
    if (key === SOURCE_CONFIG_KEY) return record;
    return undefined;
  });
  vi.mocked(kvs.set).mockImplementation(async (key: string, value) => {
    if (key === SOURCE_CONFIG_KEY) {
      record = value as SourceConfigRecord;
    }
  });
}

function findSetCall(key: string) {
  return vi.mocked(kvs.set).mock.calls.filter((call) => call[0] === key);
}

describe("getConfig", () => {
  beforeEach(() => {
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
  });

  it("returns an unconfigured shape when no Source Config record exists", async () => {
    stubStore(undefined);

    const result = await getConfig();

    expect(result).toEqual({ state: "unconfigured" });
  });

  it("returns an unconfigured shape when the record is intentionally unconfigured", async () => {
    stubStore({ state: "unconfigured" });

    const result = await getConfig();

    expect(result).toEqual({ state: "unconfigured" });
  });

  it("returns the full non-secret Source Config when configured", async () => {
    stubStore({ state: "configured", sourceConfig });

    const result = await getConfig();

    expect(result).toEqual({ state: "configured", sourceConfig });
  });
});

describe("saveConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects a malformed payload without writing Source Config", async () => {
    stubStore(undefined);

    const result = await saveConfig({ directoryId: "dir-1" });

    expect(result.success).toBe(false);
    expect(findSetCall(SOURCE_CONFIG_KEY)).toHaveLength(0);
  });

  it("saves and reports saved-active when the Source Config resolves successfully", async () => {
    stubStore(undefined);
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

    const result = await saveConfig(validSaveConfigPayload);

    expect(result.success).toBe(true);
    expect(result.active).toBe(true);
    expect(findSetCall(SOURCE_CONFIG_KEY)).toHaveLength(1);
    expect(findSetCall(SOURCE_CONFIG_KEY)[0]?.[1]).toMatchObject({
      state: "configured",
    });
  });

  it("saves and reports saved-inactive, but still persists Source Config, when resolution fails", async () => {
    stubStore(undefined);
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
    vi.mocked(api.fetch).mockResolvedValue(
      mockApiResponse(200, { data: [], links: {} }),
    );

    const result = await saveConfig(validSaveConfigPayload);

    expect(result.success).toBe(true);
    expect(result.active).toBe(false);
    expect(result.messages?.length).toBeGreaterThan(0);
    expect(findSetCall(SOURCE_CONFIG_KEY)).toHaveLength(1);
  });

  it("saves and reports saved-inactive when the Service Credential is missing", async () => {
    stubStore(undefined);

    const result = await saveConfig(validSaveConfigPayload);

    expect(result.success).toBe(true);
    expect(result.active).toBe(false);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(findSetCall(SOURCE_CONFIG_KEY)).toHaveLength(1);
  });
});

describe("resetConfig", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
  });

  it("writes an intentionally unconfigured Source Config and inactive Config Health", async () => {
    stubStore({ state: "configured", sourceConfig });

    const result = await resetConfig();

    expect(result.success).toBe(true);
    expect(findSetCall(SOURCE_CONFIG_KEY)[0]?.[1]).toEqual({
      state: "unconfigured",
    });
    const resolvedConfigCalls = vi
      .mocked(kvs.set)
      .mock.calls.filter((call) => call[0] === RESOLVED_CONFIG_KEY);
    expect(resolvedConfigCalls[0]?.[1]).toMatchObject({
      configHealth: { active: false },
    });
    expect(api.fetch).not.toHaveBeenCalled();
  });
});
