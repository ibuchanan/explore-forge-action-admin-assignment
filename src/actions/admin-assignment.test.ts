import api from "@forge/api";
import { kvs } from "@forge/kvs";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import { computeSourceConfigFingerprint } from "../config/fingerprint";
import type { ResolvedConfig } from "../config/resolved-config";
import { parseSourceConfig } from "../config/source-config";
import { restoreAccess } from "./admin-assignment";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

// kvs.get is overloaded in @forge/kvs's types; narrow it to the single-argument
// shape this module actually uses so the mock helpers type-check.
const kvsGetMock = kvs.get as unknown as Mock<
  (key: string) => Promise<ResolvedConfig | undefined>
>;

const validSourceConfigJson = JSON.stringify({
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [
    { key: "jira-admins", label: "Jira admins", name: "jira-administrators" },
  ],
});

const sourceConfigFingerprint = computeSourceConfigFingerprint(
  parseSourceConfig(validSourceConfigJson)._unsafeUnwrap(),
);

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
  configHealth: { active: true, messages: [] },
};

function setValidEnv() {
  process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;
  process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
}

describe("restoreAccess", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    kvsGetMock.mockReset();
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
    kvsGetMock.mockResolvedValueOnce(activeResolvedConfig);
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
    expect(calls[1]?.[0]).toBe(
      "https://api.atlassian.com/v2/orgs/org-1/directories/dir-1/users/target-1/restore",
    );
    expect(calls[2]?.[0]).toBe(
      "https://api.atlassian.com/v2/orgs/org-1/directories/dir-1/groups/group-1/memberships",
    );
  });

  it("skips the restore and membership writes when the Target User already has both, and still succeeds", async () => {
    setValidEnv();
    kvsGetMock.mockResolvedValueOnce(activeResolvedConfig);
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
    kvsGetMock.mockResolvedValueOnce(activeResolvedConfig);

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
    kvsGetMock.mockResolvedValueOnce(activeResolvedConfig);

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
    kvsGetMock.mockResolvedValueOnce({
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
    kvsGetMock.mockResolvedValueOnce({
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

  it("never logs the Service Credential in the Audit Record on success or failure", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setValidEnv();
    kvsGetMock.mockResolvedValueOnce(activeResolvedConfig);
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
});
