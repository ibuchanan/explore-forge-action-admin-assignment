import api from "@forge/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAdminApiRequest } from "../../src/admin-api/client";
import { logger } from "../../src/logging";
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

  it("logs the request start before the network call settles, then logs completion with the response status", async () => {
    const debugSpy = vi
      .spyOn(logger, "debug")
      .mockImplementation(() => undefined);
    let resolveFetch:
      | ((response: Awaited<ReturnType<typeof api.fetch>>) => void)
      | undefined;
    const pending = new Promise<Awaited<ReturnType<typeof api.fetch>>>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    vi.mocked(api.fetch).mockReturnValueOnce(pending);

    const promise = sendAdminApiRequest("secret-token", {
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
    });

    // Let the microtask queue turn so the pre-fetch debug log runs, without
    // letting the still-unresolved fetch settle.
    await Promise.resolve();

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0]?.[0]).toMatchObject({
      event: "admin-api-request-start",
      method: "GET",
      path: "/v2/orgs/org-1/directories/dir-1/users/count",
    });

    resolveFetch?.(jsonResponse(200, { ok: true }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy.mock.calls[1]?.[0]).toMatchObject({
      event: "admin-api-request-complete",
      status: 200,
    });

    debugSpy.mockRestore();
  });

  it("logs a failure record when the outbound fetch itself rejects, then rethrows", async () => {
    const debugSpy = vi
      .spyOn(logger, "debug")
      .mockImplementation(() => undefined);
    vi.mocked(api.fetch).mockRejectedValueOnce(new Error("network down"));

    await expect(
      sendAdminApiRequest("secret-token", {
        method: "GET",
        path: "/v2/orgs/org-1/directories/dir-1/users/count",
      }),
    ).rejects.toThrow("network down");

    const failureLog = debugSpy.mock.calls
      .map((call) => call[0])
      .find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          "event" in entry &&
          entry.event === "admin-api-request-failed",
      );
    expect(failureLog).toMatchObject({
      event: "admin-api-request-failed",
      errorMessage: "network down",
    });

    debugSpy.mockRestore();
  });
});
