import { describe, expect, it } from "vitest";
import {
  isForgeTargetKey,
  selectUploadableSecrets,
} from "../../scripts/forge-vars-from-secretspec.js";

function secret(value: string | null) {
  return { get: () => value };
}

describe("isForgeTargetKey", () => {
  it("matches keys that configure the Forge CLI target", () => {
    expect(isForgeTargetKey("FORGE_SITE")).toBe(true);
    expect(isForgeTargetKey("FORGE_ENVIRONMENT")).toBe(true);
  });

  it("does not match app-facing secrets", () => {
    expect(isForgeTargetKey("ORGANIZATION_API_KEY")).toBe(false);
  });
});

describe("selectUploadableSecrets", () => {
  it("excludes FORGE_* keys and keys with no resolved value", () => {
    const secrets = {
      FORGE_SITE: secret("example.atlassian.net"),
      FORGE_ENVIRONMENT: secret("development"),
      ORGANIZATION_API_KEY: secret("secret-value"),
      ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON: secret(null),
    };

    const result = selectUploadableSecrets(secrets);

    expect(result).toEqual([
      ["ORGANIZATION_API_KEY", secrets.ORGANIZATION_API_KEY],
    ]);
  });

  it("returns an empty list when every secret is a FORGE_* key or unset", () => {
    const secrets = {
      FORGE_SITE: secret("example.atlassian.net"),
      OPTIONAL_UNSET: secret(null),
    };

    expect(selectUploadableSecrets(secrets)).toEqual([]);
  });
});
