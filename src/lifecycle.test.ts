import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "./admin-api/test-helpers";
import { runLifecycleValidation } from "./lifecycle";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

const validSourceConfigJson = JSON.stringify({
  orgId: "org-1",
  directoryId: "dir-1",
  authorizedInitiatorEmails: ["alice@example.com"],
  allowedGroups: [
    { key: "jira-admins", label: "Jira admins", name: "jira-administrators" },
  ],
});

describe("runLifecycleValidation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.set).mockReset();
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = undefined;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("stores an active Resolved Config when Source Config and Service Credential are both valid", async () => {
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "acc-1", email: "alice@example.com" }],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ id: "group-1", name: "jira-administrators" }],
          links: {},
        }),
      );

    await runLifecycleValidation();

    expect(kvs.set).toHaveBeenCalledTimes(1);
    const [, storedValue] = vi.mocked(kvs.set).mock.calls[0] ?? [];
    expect(storedValue).toMatchObject({ configHealth: { active: true } });
  });

  it("stores inactive Config Health without calling the Admin API when the Service Credential is missing", async () => {
    process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON = validSourceConfigJson;

    await runLifecycleValidation();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(kvs.set).toHaveBeenCalledTimes(1);
    const [, storedValue] = vi.mocked(kvs.set).mock.calls[0] ?? [];
    expect(storedValue).toMatchObject({ configHealth: { active: false } });
  });

  it("stores inactive Config Health without throwing when Source Config is missing", async () => {
    process.env.ADMIN_ASSIGNMENT_API_TOKEN = "secret-token";

    await expect(runLifecycleValidation()).resolves.toBeUndefined();

    expect(api.fetch).not.toHaveBeenCalled();
    expect(kvs.set).toHaveBeenCalledTimes(1);
    const [, storedValue] = vi.mocked(kvs.set).mock.calls[0] ?? [];
    expect(storedValue).toMatchObject({ configHealth: { active: false } });
  });
});
