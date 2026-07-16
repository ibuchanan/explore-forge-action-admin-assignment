import { describe, expect, it } from "vitest";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import type { SourceConfig } from "../../src/config/source-config";

const baseConfig: SourceConfig = {
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [{ name: "jira-administrators" }],
  lookup: {
    targetUserTimeoutMs: 10_000,
    targetUserMaxPages: 5,
    configResolutionTimeoutMs: 30_000,
    configResolutionMaxPages: 20,
  },
};

describe("computeSourceConfigFingerprint", () => {
  it("is identical for the same normalized Source Config regardless of key order", () => {
    const reordered: SourceConfig = {
      lookup: { ...baseConfig.lookup },
      allowedGroups: baseConfig.allowedGroups.map((group) => ({
        name: group.name,
      })),
      authorizedInitiatorEmails: [...baseConfig.authorizedInitiatorEmails],
      directoryId: baseConfig.directoryId,
      orgId: baseConfig.orgId,
    };

    expect(computeSourceConfigFingerprint(baseConfig)).toEqual(
      computeSourceConfigFingerprint(reordered),
    );
  });

  it("changes when Source Config content changes", () => {
    const changed: SourceConfig = {
      ...baseConfig,
      authorizedInitiatorEmails: ["bob@example.com"],
    };

    expect(computeSourceConfigFingerprint(baseConfig)).not.toEqual(
      computeSourceConfigFingerprint(changed),
    );
  });
});
