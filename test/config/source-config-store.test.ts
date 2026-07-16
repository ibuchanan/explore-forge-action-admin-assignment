import { kvs } from "@forge/kvs";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceConfig } from "../../src/config/source-config";
import {
  getSourceConfigRecord,
  storeSourceConfigRecord,
  type SourceConfigRecord,
} from "../../src/config/source-config-store";

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

// kvs.get is overloaded in @forge/kvs's types; narrow it to the single-argument
// shape this module actually uses so the mock helpers type-check.
const kvsGetMock = kvs.get as unknown as Mock<
  (key: string) => Promise<SourceConfigRecord | undefined>
>;

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

describe("Source Config store", () => {
  beforeEach(() => {
    kvsGetMock.mockReset();
    vi.mocked(kvs.set).mockReset();
  });

  it("stores a configured Source Config record under a stable KVS key", async () => {
    const record: SourceConfigRecord = { state: "configured", sourceConfig };

    await storeSourceConfigRecord(record);

    expect(kvs.set).toHaveBeenCalledWith(
      "admin-assignment.source-config",
      record,
    );
  });

  it("stores an intentionally unconfigured Source Config record", async () => {
    const record: SourceConfigRecord = { state: "unconfigured" };

    await storeSourceConfigRecord(record);

    expect(kvs.set).toHaveBeenCalledWith(
      "admin-assignment.source-config",
      record,
    );
  });

  it("returns a stored configured Source Config record", async () => {
    const record: SourceConfigRecord = { state: "configured", sourceConfig };
    kvsGetMock.mockResolvedValueOnce(record);

    const result = await getSourceConfigRecord();

    expect(kvsGetMock).toHaveBeenCalledWith("admin-assignment.source-config");
    expect(result).toEqual(record);
  });

  it("returns a stored intentionally unconfigured Source Config record", async () => {
    const record: SourceConfigRecord = { state: "unconfigured" };
    kvsGetMock.mockResolvedValueOnce(record);

    const result = await getSourceConfigRecord();

    expect(result).toEqual(record);
  });

  it("distinguishes a missing (never-seeded) record from an unconfigured one", async () => {
    kvsGetMock.mockResolvedValueOnce(undefined);

    const result = await getSourceConfigRecord();

    expect(result).toBeUndefined();
  });
});
