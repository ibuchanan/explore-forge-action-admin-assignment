import api from "@forge/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import { resolveConfig } from "../../src/config/resolved-config";
import type { SourceConfig } from "../../src/config/source-config";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

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

describe("resolveConfig", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces an active Resolved Config when every initiator email and group name resolve uniquely", async () => {
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "initiator-acc-1", email: "alice@example.com" }],
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

    const resolved = await resolveConfig("token", sourceConfig);

    expect(resolved.configHealth.active).toBe(true);
    expect(resolved.sourceConfigFingerprint).toBe(
      computeSourceConfigFingerprint(sourceConfig),
    );
    expect(resolved.authorizedInitiatorAccountIds).toEqual(["initiator-acc-1"]);
    expect(resolved.allowedGroups).toEqual([
      {
        key: "jira-admins",
        label: "Jira admins",
        name: "jira-administrators",
        directoryGroupId: "group-1",
        modifiable: true,
      },
    ]);
    expect(resolved.configHealth.validatedAt).toEqual(expect.any(String));
  });

  it("produces an inactive Config Health with non-secret messages when an initiator email does not resolve", async () => {
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(mockApiResponse(200, { data: [], links: {} }))
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

    const resolved = await resolveConfig("token", sourceConfig);

    expect(resolved.configHealth.active).toBe(false);
    expect(resolved.configHealth.messages.length).toBeGreaterThan(0);
    expect(
      resolved.configHealth.messages.some((message) =>
        message.includes("token"),
      ),
    ).toBe(false);
    expect(resolved.configHealth.validatedAt).toEqual(expect.any(String));
  });
});
