import api from "@forge/api";
import { kvs } from "@forge/kvs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiResponse } from "../admin-api/test-helpers";
import { computeSourceConfigFingerprint } from "../../src/config/fingerprint";
import type { ResolvedConfig } from "../../src/config/resolved-config";
import type { SourceConfig } from "../../src/config/source-config";
import type { SourceConfigRecord } from "../../src/config/source-config-store";
import {
  ensureActiveResolvedConfig,
  runSourceConfigValidation,
} from "../../src/config-health/validate";

vi.mock("@forge/api", () => ({
  default: { fetch: vi.fn() },
}));

vi.mock("@forge/kvs", () => ({
  kvs: { get: vi.fn(), set: vi.fn() },
}));

const SOURCE_CONFIG_KEY = "admin-assignment.source-config";
const RESOLVED_CONFIG_KEY = "admin-assignment.resolved-config";

const sourceConfig: SourceConfig = {
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

const fingerprint = computeSourceConfigFingerprint(sourceConfig);

function seedKvs({
  sourceConfigRecord,
  resolvedConfig,
}: {
  sourceConfigRecord?: SourceConfigRecord;
  resolvedConfig?: ResolvedConfig;
}) {
  vi.mocked(kvs.get).mockImplementation(async (key: string) => {
    if (key === SOURCE_CONFIG_KEY) return sourceConfigRecord;
    if (key === RESOLVED_CONFIG_KEY) return resolvedConfig;
    return undefined;
  });
}

describe("runSourceConfigValidation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
    process.env.ORGANIZATION_API_KEY = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("stores inactive Config Health without calling the Admin API when Source Config is unconfigured", async () => {
    seedKvs({ sourceConfigRecord: { state: "unconfigured" } });

    const result = await runSourceConfigValidation();

    expect(result.configHealth.active).toBe(false);
    expect(result.configHealth.validatedAt).toEqual(expect.any(String));
    expect(api.fetch).not.toHaveBeenCalled();
    expect(kvs.set).toHaveBeenCalledWith(RESOLVED_CONFIG_KEY, result);
  });

  it("treats a missing (never-seeded) Source Config record the same as unconfigured", async () => {
    seedKvs({ sourceConfigRecord: undefined });

    const result = await runSourceConfigValidation();

    expect(result.configHealth.active).toBe(false);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("stores inactive Config Health when the Service Credential is missing, preserving the Source Config fingerprint", async () => {
    seedKvs({ sourceConfigRecord: { state: "configured", sourceConfig } });

    const result = await runSourceConfigValidation();

    expect(result.configHealth.active).toBe(false);
    expect(
      result.configHealth.messages.some((message) =>
        message.includes("ORGANIZATION_API_KEY"),
      ),
    ).toBe(true);
    expect(result.sourceConfigFingerprint).toBe(fingerprint);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("resolves and stores an active Resolved Config when the Service Credential and Source Config are both valid", async () => {
    process.env.ORGANIZATION_API_KEY = "secret-token";
    seedKvs({ sourceConfigRecord: { state: "configured", sourceConfig } });
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "initiator-1", email: "alice@example.com" }],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ id: "group-1", name: "jira-administrators" }],
          links: {},
        }),
      );

    const result = await runSourceConfigValidation();

    expect(result.configHealth.active).toBe(true);
    expect(result.sourceConfigFingerprint).toBe(fingerprint);
  });
});

describe("ensureActiveResolvedConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(api.fetch).mockReset();
    vi.mocked(kvs.get).mockReset();
    vi.mocked(kvs.set).mockReset();
    process.env.ORGANIZATION_API_KEY = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed when Source Config is unconfigured", async () => {
    seedKvs({ sourceConfigRecord: { state: "unconfigured" } });

    const result = await ensureActiveResolvedConfig();

    expect(result.isErr()).toBe(true);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when Source Config was never seeded", async () => {
    seedKvs({ sourceConfigRecord: undefined });

    const result = await ensureActiveResolvedConfig();

    expect(result.isErr()).toBe(true);
  });

  it("reuses an already-active Resolved Config matching the current fingerprint without re-validating", async () => {
    const activeResolvedConfig: ResolvedConfig = {
      sourceConfigFingerprint: fingerprint,
      authorizedInitiatorAccountIds: ["initiator-1"],
      allowedGroups: [],
      configHealth: {
        active: true,
        messages: [],
        validatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    seedKvs({
      sourceConfigRecord: { state: "configured", sourceConfig },
      resolvedConfig: activeResolvedConfig,
    });

    const result = await ensureActiveResolvedConfig();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().resolvedConfig).toEqual(activeResolvedConfig);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(kvs.set).not.toHaveBeenCalled();
  });

  it("refreshes through the shared validation path when the stored fingerprint is stale, then succeeds", async () => {
    process.env.ORGANIZATION_API_KEY = "secret-token";
    const staleResolvedConfig: ResolvedConfig = {
      sourceConfigFingerprint: "stale-fingerprint",
      authorizedInitiatorAccountIds: [],
      allowedGroups: [],
      configHealth: {
        active: true,
        messages: [],
        validatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    seedKvs({
      sourceConfigRecord: { state: "configured", sourceConfig },
      resolvedConfig: staleResolvedConfig,
    });
    vi.mocked(api.fetch)
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ accountId: "initiator-1", email: "alice@example.com" }],
          links: {},
        }),
      )
      .mockResolvedValueOnce(
        mockApiResponse(200, {
          data: [{ id: "group-1", name: "jira-administrators" }],
          links: {},
        }),
      );

    const result = await ensureActiveResolvedConfig();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().resolvedConfig.configHealth.active).toBe(
      true,
    );
  });

  it("fails closed when Resolved Config is still inactive after the inline refresh", async () => {
    seedKvs({ sourceConfigRecord: { state: "configured", sourceConfig } });

    const result = await ensureActiveResolvedConfig();

    expect(result.isErr()).toBe(true);
  });
});
