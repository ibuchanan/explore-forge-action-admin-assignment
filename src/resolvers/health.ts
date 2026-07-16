import type Resolver from "@forge/resolver";
import { computeSourceConfigFingerprint } from "../config/fingerprint";
import {
  getSourceConfigRecord,
  type SourceConfigRecord,
} from "../config/source-config-store";
import { getStoredResolvedConfig } from "../config-health/store";
import { runSourceConfigValidation } from "../config-health/validate";

export interface StatusResponse {
  state: "configured" | "unconfigured";
  active: boolean;
  messages: string[];
  allowedGroups: Array<{ name: string }>;
  sourceConfigFingerprint: string;
  validatedAt: string;
}

function currentFingerprint(record: SourceConfigRecord | undefined): string {
  return record?.state === "configured"
    ? computeSourceConfigFingerprint(record.sourceConfig)
    : "";
}

export async function getStatus(): Promise<StatusResponse> {
  const record = await getSourceConfigRecord();
  const state = record?.state === "configured" ? "configured" : "unconfigured";
  const fingerprint = currentFingerprint(record);

  let resolvedConfig = await getStoredResolvedConfig();
  if (
    !resolvedConfig ||
    resolvedConfig.sourceConfigFingerprint !== fingerprint
  ) {
    resolvedConfig = await runSourceConfigValidation();
  }

  return {
    state,
    active: resolvedConfig.configHealth.active,
    messages: resolvedConfig.configHealth.messages,
    allowedGroups: resolvedConfig.allowedGroups.map((group) => ({
      name: group.name,
    })),
    sourceConfigFingerprint: resolvedConfig.sourceConfigFingerprint,
    validatedAt: resolvedConfig.configHealth.validatedAt,
  };
}

export function registerHealthResolvers(
  resolver: InstanceType<typeof Resolver>,
): void {
  resolver.define("getStatus", () => getStatus());
}
