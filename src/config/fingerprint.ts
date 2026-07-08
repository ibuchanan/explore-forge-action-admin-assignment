import { createHash } from "node:crypto";
import type { SourceConfig } from "./source-config";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
}

export function computeSourceConfigFingerprint(config: SourceConfig): string {
  const canonicalJson = JSON.stringify(canonicalize(config));
  return createHash("sha256").update(canonicalJson).digest("hex");
}
