import api from "@forge/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAdminApiRequest } from "../../src/admin-api/client";
import { mockApiResponse as jsonResponse } from "./test-helpers";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

describe("sendAdminApiRequest", () => {
  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the Organizations API with the Service Credential and returns the response on success", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await sendAdminApiRequest("secret-token", {
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
    });

    expect(api.fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(api.fetch).mock.calls[0];
    if (!call) {
      throw new Error("expected api.fetch to have been called");
    }
    const [url, init] = call;
    expect(url).toBe(
      "https://api.atlassian.com/admin/v2/orgs/org-1/directories/dir-1/users/count",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers?.Authorization).toBe("Bearer secret-token");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe(200);
  });

  it("retries a Transient Admin Failure (503) and returns the eventual success", async () => {
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(jsonResponse(503, { message: "unavailable" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const promise = sendAdminApiRequest("secret-token", {
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(api.fetch).toHaveBeenCalledTimes(2);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe(200);
  });

  it("never retries a validation failure such as 404", async () => {
    vi.mocked(api.fetch).mockResolvedValueOnce(
      jsonResponse(404, { message: "not found" }),
    );

    const result = await sendAdminApiRequest("secret-token", {
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
    });

    expect(api.fetch).toHaveBeenCalledTimes(1);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe(404);
  });

  it("stops retrying a persistent Transient Admin Failure after the bounded retry count", async () => {
    vi.mocked(api.fetch).mockResolvedValue(
      jsonResponse(503, { message: "unavailable" }),
    );

    const promise = sendAdminApiRequest("secret-token", {
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
      maxRetries: 2,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    // initial request + 2 retries = 3 total attempts
    expect(api.fetch).toHaveBeenCalledTimes(3);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe(503);
  });
});
