import api from "@forge/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse as jsonResponse } from "./test-helpers";
import { findUserByEmail, restoreTargetUserAccess } from "./users";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

const options = { maxPages: 5, timeoutMs: 10_000 };

describe("findUserByEmail", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves to exactly one Target User, including active status and current group membership from the same search call", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            accountId: "acc-1",
            email: "Person@Example.com",
            accountStatus: "active",
            groups: [{ id: "group-1", name: "jira-administrators" }],
          },
        ],
        links: {},
      }),
    );

    const result = await findUserByEmail(
      "token",
      "org-1",
      "dir-1",
      "  person@example.com  ",
      options,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      accountId: "acc-1",
      email: "Person@Example.com",
      active: true,
      groupIds: ["group-1"],
    });

    const call = vi.mocked(api.fetch).mock.calls[0];
    if (!call) {
      throw new Error("expected api.fetch to have been called");
    }
    const [, init] = call;
    expect(JSON.parse(init?.body as string)).toEqual({
      emails: ["person@example.com"],
    });
  });

  it("fails closed when zero users match", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(200, { data: [], links: {} }),
    );

    const result = await findUserByEmail(
      "token",
      "org-1",
      "dir-1",
      "nobody@example.com",
      options,
    );

    expect(result.isErr()).toBe(true);
  });

  it("fails closed when more than one user matches after normalization", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          { accountId: "acc-1", email: "person@example.com" },
          { accountId: "acc-2", email: "PERSON@EXAMPLE.COM" },
        ],
        links: {},
      }),
    );

    const result = await findUserByEmail(
      "token",
      "org-1",
      "dir-1",
      "person@example.com",
      options,
    );

    expect(result.isErr()).toBe(true);
  });
});

describe("restoreTargetUserAccess", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores the Target User's directory access", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(jsonResponse(204, {}));

    const result = await restoreTargetUserAccess(
      "token",
      "org-1",
      "dir-1",
      "acc-1",
    );

    expect(result.isOk()).toBe(true);
    const call = vi.mocked(api.fetch).mock.calls[0];
    if (!call) {
      throw new Error("expected api.fetch to have been called");
    }
    expect(call[0]).toBe(
      "https://api.atlassian.com/v2/orgs/org-1/directories/dir-1/users/acc-1/restore",
    );
  });

  it("fails closed when restoring access fails", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(jsonResponse(403, {}));

    const result = await restoreTargetUserAccess(
      "token",
      "org-1",
      "dir-1",
      "acc-1",
    );

    expect(result.isErr()).toBe(true);
  });
});
