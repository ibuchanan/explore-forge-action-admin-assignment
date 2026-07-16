#!/usr/bin/env node
// Uploads every secret declared in secretspec.toml to Forge as an encrypted
// environment variable, resolving values via the secretspec Node SDK instead
// of shelling out to `secretspec get` once per key.
//
// FORGE_* keys configure which site/environment the `forge` CLI targets
// (including this script's own `forge variables set` calls) -- they aren't
// app-facing Forge environment variables and are skipped.
//
// Unlike the Forge CLI, secretspec has no "needs vendor-side encryption" vs
// "plain config" distinction. Every declared secret is treated as sensitive
// and uploaded with `forge variables set --encrypt`.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SecretSpec } from "secretspec";

export function isForgeTargetKey(key) {
  return key.startsWith("FORGE_");
}

export function selectUploadableSecrets(secrets) {
  return Object.entries(secrets).filter(
    ([key, secret]) => !isForgeTargetKey(key) && secret.get() != null,
  );
}

function main() {
  const resolved = SecretSpec.builder()
    .withProvider("dotenv")
    .withReason("forge-vars-from-secretspec: upload declared secrets to Forge")
    .load();

  try {
    const environment = resolved.secrets.FORGE_ENVIRONMENT.get();

    for (const [key, secret] of selectUploadableSecrets(resolved.secrets)) {
      const value = secret.get();
      console.log(`Uploading ${key} (encrypted) to Forge [${environment}]...`);
      execFileSync(
        "forge",
        [
          "variables",
          "set",
          "--encrypt",
          "--environment",
          environment,
          key,
          value,
        ],
        { stdio: "inherit" },
      );
    }
  } finally {
    resolved.dispose();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
