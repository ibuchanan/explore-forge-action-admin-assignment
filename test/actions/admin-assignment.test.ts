import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import type { ResolvedConfig } from "../../src/config/resolved-config";
import { parseSourceConfig } from "../../src/config/source-config";
import type { SourceConfigRecord } from "../../src/config/source-config-store";
import { restoreAccess } from "../../src/actions/admin-assignment";
import { logger } from "../../src/logging";

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

const sourceConfig = parseSourceConfig(validSourceConfigJson)._unsafeUnwrap();

const sourceConfigFingerprint = computeSourceConfigFingerprint(sourceConfig);

const jiraAdminsGroup = {
  key: "jira-admins",
  label: "Jira admins",
  name: "jira-administrators",
  directoryGroupId: "group-1",
  modifiable: true,
};

const activeResolvedConfig: ResolvedConfig = {
  sourceConfigFingerprint,
  authorizedInitiatorAccountIds: ["initiator-1"],
  allowedGroups: [jiraAdminsGroup],
  configHealth: {
    active: true,
    messages: [],
    validatedAt: "2026-01-01T00:00:00.000Z",
  },
};

// Seeds both KVS keys read by ensureActiveResolvedConfig(): the configured
// Source Config record, and whatever Resolved Config (if any) is already stored.
function seedKvs(resolvedConfig?: ResolvedConfig) {
  const sourceConfigRecord: SourceConfigRecord = {
    state: "configured",
    sourceConfig,
  };
  vi.mocked(kvs.get).mockImplementation(async (key: string) => {
    if (key === SOURCE_CONFIG_KEY) return sourceConfigRecord;
    if (key === RESOLVED_CONFIG_KEY) return resolvedConfig;
    return undefined;
  });
}

function setValidEnv() {
  process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
}

describe("restoreAccess", () => {
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

  it("fails closed without calling the Admin API when initiatorAccountId is missing", async () => {
    await expect(
      restoreAccess({
        targetUserEmail: "person@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("restores access and adds the Target User to every Selected Group, returning a Success Summary", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [
            {
              accountId: "target-1",
              email: "person@example.com",
              accountStatus: "inactive",
              groups: [],
            },
          ],
          links: {},
        }),
      )
      .mockResolvedValueOnce(mockApiResponse(204, {}))
      .mockResolvedValueOnce(mockApiResponse(204, {}));

    const result = await restoreAccess({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
    });

    expect(result).toEqual({
      status: "succeeded",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: ["jira-admins"],
    });

    const calls = vi.mocked(api.fetch).mock.calls;
    expect(calls[0]?.[0]).toBe(
      "https://api.atlassian.com/admin/v2/orgs/org-1/directories/dir-1/users/search",
    );
    expect(calls[1]?.[0]).toBe(
      "https://api.atlassian.com/admin/v2/orgs/org-1/directories/dir-1/users/target-1/restore",
    );
    expect(calls[2]?.[0]).toBe(
      "https://api.atlassian.com/admin/v2/orgs/org-1/directories/dir-1/groups/group-1/memberships",
    );
  });

  it("skips the restore and membership writes when the Target User already has both, and still succeeds", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);
    vi.mocked(api.fetch).mockResolvedValueOnce(
      mockApiResponse(200, {
        data: [
          {
            accountId: "target-1",
            email: "person@example.com",
            accountStatus: "active",
            groups: [{ id: "group-1" }],
          },
        ],
        links: {},
      }),
    );

    const result = await restoreAccess({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
    });

    expect(result.status).toBe("succeeded");
    // Only the lookup call; no restore or membership write calls were needed.
    expect(api.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when initiatorAccountId is not an Authorized Initiator", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);

    await expect(
      restoreAccess({
        initiatorAccountId: "someone-else",
        targetUserEmail: "person@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when selectedGroupKeys includes an unknown Group Key", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);

    await expect(
      restoreAccess({
        initiatorAccountId: "initiator-1",
        targetUserEmail: "person@example.com",
        selectedGroupKeys: "not-a-real-group",
      }),
    ).rejects.toThrow();

    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("refreshes an inline Resolved Config when the stored fingerprint is stale, then proceeds", async () => {
    setValidEnv();
    seedKvs({
      ...activeResolvedConfig,
      sourceConfigFingerprint: "stale-fingerprint",
    });
    vi.mocked(api.fetch)
      // Inline refresh: initiator email lookup, then group name lookup.
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "initiator-1", email: "alice@example.com" }],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ id: "group-1", name: "jira-administrators" }],
          links: {},
        }),
      )
      // Target user lookup, restore, membership.
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [
            {
              accountId: "target-1",
              email: "person@example.com",
              accountStatus: "inactive",
              groups: [],
            },
          ],
          links: {},
        }),
      )
      .mockResolvedValueOnce(mockApiResponse(204, {}))
      .mockResolvedValueOnce(mockApiResponse(204, {}));

    const result = await restoreAccess({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
    });

    expect(result.status).toBe("succeeded");
    expect(kvs.set).toHaveBeenCalledTimes(1);
  });

  it("fails closed before restoring access when a Selected Group cannot accept direct membership changes", async () => {
    setValidEnv();
    seedKvs({
      ...activeResolvedConfig,
      allowedGroups: [{ ...jiraAdminsGroup, modifiable: false }],
    });
    vi.mocked(api.fetch).mockResolvedValueOnce(
      mockApiResponse(200, {
        data: [
          {
            accountId: "target-1",
            email: "person@example.com",
            accountStatus: "inactive",
            groups: [],
          },
        ],
        links: {},
      }),
    );

    await expect(
      restoreAccess({
        initiatorAccountId: "initiator-1",
        targetUserEmail: "person@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    // Only the target user lookup happened; no restore or membership write.
    expect(api.fetch).toHaveBeenCalledTimes(1);
  });

  it("includes the Batch ID in the Audit Record when the payload carries one", async () => {
    const logSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    setValidEnv();
    seedKvs(activeResolvedConfig);
    vi.mocked(api.fetch).mockResolvedValueOnce(
      mockApiResponse(200, {
        data: [
          {
            accountId: "target-1",
            email: "person@example.com",
            accountStatus: "active",
            groups: [{ id: "group-1" }],
          },
        ],
        links: {},
      }),
    );

    await restoreAccess({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
      batchId: "batch-1",
    });

    const loggedRecord = logSpy.mock.calls
      .map((call) => call[0])
      .find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          "event" in entry &&
          entry.event === "admin-assignment-audit",
      ) as Record<string, unknown> | undefined;

    expect(loggedRecord?.batchId).toBe("batch-1");
    logSpy.mockRestore();
  });

  it("omits the batchId field entirely from the Audit Record for a single-user run without one", async () => {
    const logSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    setValidEnv();
    seedKvs(activeResolvedConfig);
    vi.mocked(api.fetch).mockResolvedValueOnce(
      mockApiResponse(200, {
        data: [
          {
            accountId: "target-1",
            email: "person@example.com",
            accountStatus: "active",
            groups: [{ id: "group-1" }],
          },
        ],
        links: {},
      }),
    );

    await restoreAccess({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
    });

    const loggedRecord = logSpy.mock.calls
      .map((call) => call[0])
      .find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          "event" in entry &&
          entry.event === "admin-assignment-audit",
      ) as Record<string, unknown> | undefined;

    expect(loggedRecord && "batchId" in loggedRecord).toBe(false);
    logSpy.mockRestore();
  });

  it("never logs the Service Credential in the Audit Record on success or failure", async () => {
    const logSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    setValidEnv();
    seedKvs(activeResolvedConfig);
    vi.mocked(api.fetch).mockResolvedValueOnce(
      mockApiResponse(200, { data: [], links: {} }),
    );

    await expect(
      restoreAccess({
        initiatorAccountId: "initiator-1",
        targetUserEmail: "nobody@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).not.toContain("secret-token");
    logSpy.mockRestore();
  });

  it("fails closed when Source Config is unconfigured", async () => {
    setValidEnv();
    vi.mocked(kvs.get).mockImplementation(async (key: string) =>
      key === SOURCE_CONFIG_KEY ? { state: "unconfigured" } : undefined,
    );

    await expect(
      restoreAccess({
        initiatorAccountId: "initiator-1",
        targetUserEmail: "person@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(api.fetch).not.toHaveBeenCalled();
  });
});
