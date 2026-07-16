import type Resolver from "@forge/resolver";
import type { ValidationProblemDetails } from "@forge-ahead/errors";
import type { SourceConfig } from "../config/source-config";
import { validateSourceConfig } from "../config/source-config";
import {
  getSourceConfigRecord,
  storeSourceConfigRecord,
} from "../config/source-config-store";
import { runSourceConfigValidation } from "../config-health/validate";

export type GetConfigResponse =
  | { state: "unconfigured" }
  | { state: "configured"; sourceConfig: SourceConfig };

export interface SaveConfigResponse {
  success: boolean;
  active?: boolean;
  messages?: string[];
  errors?: ValidationProblemDetails["errors"];
  detail?: string;
}

export interface ResetConfigResponse {
  success: true;
}

export async function getConfig(): Promise<GetConfigResponse> {
  const record = await getSourceConfigRecord();
  if (!record || record.state === "unconfigured") {
    return { state: "unconfigured" };
  }
  return { state: "configured", sourceConfig: record.sourceConfig };
}

export async function saveConfig(
  payload: unknown,
): Promise<SaveConfigResponse> {
  const candidateResult = validateSourceConfig(payload);
  if (candidateResult.isErr()) {
    return {
      success: false,
      detail: candidateResult.error.detail,
      errors: candidateResult.error.errors,
    };
  }

  await storeSourceConfigRecord({
    state: "configured",
    sourceConfig: candidateResult.value,
  });
  const resolvedConfig = await runSourceConfigValidation();

  return {
    success: true,
    active: resolvedConfig.configHealth.active,
    messages: resolvedConfig.configHealth.messages,
  };
}

export async function resetConfig(): Promise<ResetConfigResponse> {
  await storeSourceConfigRecord({ state: "unconfigured" });
  await runSourceConfigValidation();
  return { success: true };
}

export function registerConfigResolvers(
  resolver: InstanceType<typeof Resolver>,
): void {
  resolver.define("getConfig", () => getConfig());
  resolver.define("saveConfig", (req: { payload: unknown }) =>
    saveConfig(req.payload),
  );
  resolver.define("resetConfig", () => resetConfig());
}
