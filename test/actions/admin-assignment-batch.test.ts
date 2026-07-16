import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartialSuccessError } from "@forge/events";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import type { ResolvedConfig } from "../../src/config/resolved-config";
import { parseSourceConfig } from "../../src/config/source-config";
import type { SourceConfigRecord } from "../../src/config/source-config-store";
import { enqueueAccessRestorationBatch } from "../../src/actions/admin-assignment-batch";
import { logger } from "../../src/logging";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

const pushMock = vi.fn();
vi.mock("@forge/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forge/events")>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(function QueueMock() {
      return { push: pushMock };
    }),
  };
});

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

describe("enqueueAccessRestorationBatch", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
    pushMock.mockReset();
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = undefined;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed without pushing any queue events when initiatorAccountId is missing", async () => {
    await expect(
      enqueueAccessRestorationBatch({
        targetUserEmails: "alice@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("fails closed without pushing any queue events when initiatorAccountId is not an Authorized Initiator", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);

    await expect(
      enqueueAccessRestorationBatch({
        initiatorAccountId: "someone-else",
        targetUserEmails: "alice@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("pushes one queue event per Target User Email, all sharing the same Batch ID, and returns an acknowledgment", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);
    pushMock.mockResolvedValueOnce({ jobId: "job-1" });

    const result = await enqueueAccessRestorationBatch({
      initiatorAccountId: "initiator-1",
      targetUserEmails: "alice@example.com, bob@example.com",
      selectedGroupKeys: "jira-admins",
    });

    expect(pushMock).toHaveBeenCalledTimes(1);
    const pushedEvents = pushMock.mock.calls[0]?.[0];
    expect(pushedEvents).toHaveLength(2);
    expect(pushedEvents[0].body).toEqual({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "alice@example.com",
      selectedGroupKeys: "jira-admins",
      batchId: result.batchId,
    });
    expect(pushedEvents[1].body).toEqual({
      initiatorAccountId: "initiator-1",
      targetUserEmail: "bob@example.com",
      selectedGroupKeys: "jira-admins",
      batchId: result.batchId,
    });

    expect(result).toEqual({
      status: "accepted",
      batchId: result.batchId,
      acceptedCount: 2,
      enqueuedCount: 2,
    });
  });

  it("fails closed without pushing any queue events when targetUserEmails is missing or empty", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);

    await expect(
      enqueueAccessRestorationBatch({
        initiatorAccountId: "initiator-1",
        targetUserEmails: "",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("chunks pushes into groups of at most 50 events when the list exceeds 50 emails", async () => {
    setValidEnv();
    seedKvs(activeResolvedConfig);
    pushMock.mockResolvedValue({ jobId: "job-1" });

    const emails = Array.from(
      { length: 60 },
      (_, index) => `user${index}@example.com`,
    );

    const result = await enqueueAccessRestorationBatch({
      initiatorAccountId: "initiator-1",
      targetUserEmails: emails.join(","),
      selectedGroupKeys: "jira-admins",
    });

    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock.mock.calls[0]?.[0]).toHaveLength(50);
    expect(pushMock.mock.calls[1]?.[0]).toHaveLength(10);
    expect(result.acceptedCount).toBe(60);
    expect(result.enqueuedCount).toBe(60);
  });

  it("reports an accurate enqueuedCount and logs each un-enqueued email when a push partially fails", async () => {
    const logSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    setValidEnv();
    seedKvs(activeResolvedConfig);

    const failedEvent = {
      errorMessage: "rate limited",
      event: {
        body: {
          initiatorAccountId: "initiator-1",
          targetUserEmail: "bob@example.com",
          selectedGroupKeys: "jira-admins",
          batchId: "whatever",
        },
      },
    };
    pushMock.mockRejectedValueOnce(
      new PartialSuccessError("partial failure", { jobId: "job-1" }, [
        failedEvent,
      ]),
    );

    const result = await enqueueAccessRestorationBatch({
      initiatorAccountId: "initiator-1",
      targetUserEmails: "alice@example.com, bob@example.com",
      selectedGroupKeys: "jira-admins",
    });

    expect(result.acceptedCount).toBe(2);
    expect(result.enqueuedCount).toBe(1);

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).toContain("bob@example.com");
    logSpy.mockRestore();
  });

  it("fails closed when Source Config is unconfigured", async () => {
    setValidEnv();
    vi.mocked(kvs.get).mockImplementation(async (key: string) =>
      key === SOURCE_CONFIG_KEY ? { state: "unconfigured" } : undefined,
    );

    await expect(
      enqueueAccessRestorationBatch({
        initiatorAccountId: "initiator-1",
        targetUserEmails: "alice@example.com",
        selectedGroupKeys: "jira-admins",
      }),
    ).rejects.toThrow();

    expect(pushMock).not.toHaveBeenCalled();
  });
});
