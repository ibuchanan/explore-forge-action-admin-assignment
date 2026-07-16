import { type ProblemDetails, StandardError } from "@forge-ahead/errors";
import { err, ok, type Result } from "@forge-ahead/errors";
import { computeSourceConfigFingerprint } from "../config/fingerprint";
import type { ResolvedConfig } from "../config/resolved-config";
import { resolveConfig } from "../config/resolved-config";
import type { SourceConfig } from "../config/source-config";
import {
  getSourceConfigRecord,
  type SourceConfigRecord,
} from "../config/source-config-store";
import { getStoredResolvedConfig, storeResolvedConfig } from "./store";

function problem(status: number, detail: string): ProblemDetails {
  return StandardError.getOrDefault(status).error(detail)._unsafeUnwrapErr();
}

export function buildInactiveResolvedConfig(
  messages: string[],
  fingerprint = "",
): ResolvedConfig {
  return {
    sourceConfigFingerprint: fingerprint,
    authorizedInitiatorAccountIds: [],
    allowedGroups: [],
    configHealth: {
      active: false,
      messages,
      validatedAt: new Date().toISOString(),
    },
  };
}

async function validateSourceConfigRecord(
  record: SourceConfigRecord,
): Promise<ResolvedConfig> {
  if (record.state === "unconfigured") {
    return buildInactiveResolvedConfig(["Source Config is not configured"]);
  }

  const fingerprint = computeSourceConfigFingerprint(record.sourceConfig);
  const apiToken = process.env.ADMIN_ASSIGNMENT_API_TOKEN;
  if (!apiToken) {
    return buildInactiveResolvedConfig(
      ["ADMIN_ASSIGNMENT_API_TOKEN is not set"],
      fingerprint,
    );
  }

  return resolveConfig(apiToken, record.sourceConfig);
}

export async function runSourceConfigValidation(): Promise<ResolvedConfig> {
  const record = (await getSourceConfigRecord()) ?? { state: "unconfigured" };
  const resolvedConfig = await validateSourceConfigRecord(record);
  await storeResolvedConfig(resolvedConfig);
  return resolvedConfig;
}

export async function ensureActiveResolvedConfig(): Promise<
  Result<
    { sourceConfig: SourceConfig; resolvedConfig: ResolvedConfig },
    ProblemDetails
  >
> {
  const record = await getSourceConfigRecord();
  if (!record || record.state === "unconfigured") {
    return err(problem(500, "Source Config is not configured"));
  }
  const sourceConfig = record.sourceConfig;
  const fingerprint = computeSourceConfigFingerprint(sourceConfig);

  let resolvedConfig = await getStoredResolvedConfig();
  if (
    !resolvedConfig?.configHealth.active ||
    resolvedConfig.sourceConfigFingerprint !== fingerprint
  ) {
    resolvedConfig = await runSourceConfigValidation();
  }

  if (!resolvedConfig.configHealth.active) {
    return err(
      problem(500, "Resolved Config is inactive after inline refresh"),
    );
  }

  return ok({ sourceConfig, resolvedConfig });
}
