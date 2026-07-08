import api from "@forge/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse as jsonResponse } from "./test-helpers";
import { findGroupByName } from "./groups";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

const options = { maxPages: 5, timeoutMs: 10_000 };

describe("findGroupByName", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to exactly one Directory Group ID when the Allowed Group Name matches exactly one group", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            id: "group-1",
            name: "jira-administrators",
            managementAccess: { modifiable: true },
          },
          {
            id: "group-2",
            name: "jira-administrators-readonly",
            managementAccess: { modifiable: true },
          },
        ],
        links: {},
      }),
    );

    const result = await findGroupByName(
      "token",
      "org-1",
      "dir-1",
      "jira-administrators",
      options,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "group-1",
      name: "jira-administrators",
      modifiable: true,
    });
  });

  it("fails closed when zero groups match the Allowed Group Name exactly", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [{ id: "group-2", name: "jira-administrators-readonly" }],
        links: {},
      }),
    );

    const result = await findGroupByName(
      "token",
      "org-1",
      "dir-1",
      "jira-administrators",
      options,
    );

    expect(result.isErr()).toBe(true);
  });
});
