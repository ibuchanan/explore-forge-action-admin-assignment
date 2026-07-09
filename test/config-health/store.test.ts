import { kvs } from "@forge/kvs";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/config/resolved-config";
import {
  getStoredResolvedConfig,
  storeResolvedConfig,
} from "../../src/config-health/store";

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

// kvs.get is overloaded in @forge/kvs's types; narrow it to the single-argument
// shape this module actually uses so the mock helpers type-check.
const kvsGetMock = kvs.get as unknown as Mock<
  (key: string) => Promise<ResolvedConfig | undefined>
>;

const resolvedConfig: ResolvedConfig = {
  sourceConfigFingerprint: "fingerprint-1",
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
  configHealth: { active: true, messages: [] },
};

describe("Config Health store", () => {
  beforeEach(() => {
    kvsGetMock.mockReset();
    vi.mocked(kvs.set).mockReset();
  });

  it("stores the Resolved Config under a stable KVS key", async () => {
    await storeResolvedConfig(resolvedConfig);

    expect(kvs.set).toHaveBeenCalledWith(
      "admin-assignment.resolved-config",
      resolvedConfig,
    );
  });

  it("returns the stored Resolved Config", async () => {
    kvsGetMock.mockResolvedValueOnce(resolvedConfig);

    const result = await getStoredResolvedConfig();

    expect(kvsGetMock).toHaveBeenCalledWith("admin-assignment.resolved-config");
    expect(result).toEqual(resolvedConfig);
  });
});
