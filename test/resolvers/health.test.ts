import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import type { ResolvedConfig } from "../../src/config/resolved-config";
import type { SourceConfig } from "../../src/config/source-config";
import type { SourceConfigRecord } from "../../src/config/source-config-store";
import { getStatus } from "../../src/resolvers/health";

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

const fingerprint = computeSourceConfigFingerprint(sourceConfig);

function seedKvs({
  sourceConfigRecord,
  resolvedConfig,
}: {
  sourceConfigRecord?: SourceConfigRecord;
  resolvedConfig?: ResolvedConfig;
}) {
  vi.mocked(kvs.get).mockImplementation(async (key: string) => {
    if (key === SOURCE_CONFIG_KEY) return sourceConfigRecord;
    if (key === RESOLVED_CONFIG_KEY) return resolvedConfig;
    return undefined;
  });
}

describe("getStatus", () => {
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

  it("returns an unconfigured status without calling the Admin API", async () => {
    seedKvs({ sourceConfigRecord: { state: "unconfigured" } });

    const result = await getStatus();

    expect(result.state).toBe("unconfigured");
    expect(result.active).toBe(false);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("refreshes through the shared validation path when Config Health is missing", async () => {
    seedKvs({
      sourceConfigRecord: { state: "configured", sourceConfig },
      resolvedConfig: undefined,
    });
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
          data: [
            {
              id: "group-1",
              name: "jira-administrators",
              managementAccess: { modifiable: true },
            },
          ],
          links: {},
        }),
      );

    const result = await getStatus();

    expect(result.state).toBe("configured");
    expect(result.active).toBe(true);
    expect(result.allowedGroups).toEqual([
      { key: "jira-admins", label: "Jira admins" },
    ]);
    expect(result.sourceConfigFingerprint).toBe(fingerprint);
    expect(result.validatedAt).toEqual(expect.any(String));
  });

  it("refreshes through the shared validation path when the stored fingerprint is stale", async () => {
    seedKvs({
      sourceConfigRecord: { state: "configured", sourceConfig },
      resolvedConfig: {
        sourceConfigFingerprint: "stale-fingerprint",
        authorizedInitiatorAccountIds: [],
        allowedGroups: [],
        configHealth: {
          active: true,
          messages: [],
          validatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    const result = await getStatus();

    // Missing Service Credential in this environment surfaces as inactive,
    // proving the shared validation path actually re-ran instead of trusting
    // the stale-but-active stored result.
    expect(result.active).toBe(false);
  });

  it("does not re-validate when the stored Resolved Config already matches the current fingerprint", async () => {
    const activeResolvedConfig: ResolvedConfig = {
      sourceConfigFingerprint: fingerprint,
      authorizedInitiatorAccountIds: ["acc-1"],
      allowedGroups: [
        {
          key: "jira-admins",
          label: "Jira admins",
          name: "jira-administrators",
          directoryGroupId: "group-1",
          modifiable: true,
        },
      ],
      configHealth: {
        active: true,
        messages: [],
        validatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    seedKvs({
      sourceConfigRecord: { state: "configured", sourceConfig },
      resolvedConfig: activeResolvedConfig,
    });

    const result = await getStatus();

    expect(result).toEqual({
      state: "configured",
      active: true,
      messages: [],
      allowedGroups: [{ key: "jira-admins", label: "Jira admins" }],
      sourceConfigFingerprint: fingerprint,
      validatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(api.fetch).not.toHaveBeenCalled();
    expect(kvs.set).not.toHaveBeenCalled();
  });
});
