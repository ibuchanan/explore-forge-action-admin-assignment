import { toErrorMessage } from "@forge-ahead/errors";
import type { ResolvedConfig } from "./config/resolved-config";
import { parseSourceConfig } from "./config/source-config";
import {
  getSourceConfigRecord,
  storeSourceConfigRecord,
} from "./config/source-config-store";
import {
  buildInactiveResolvedConfig,
  runSourceConfigValidation,
} from "./config-health/validate";
import { storeResolvedConfig } from "./config-health/store";
import { logger } from "./logging";

function logConfigHealth(configHealth: ResolvedConfig["configHealth"]): void {
  const level = configHealth.active ? "info" : "warn";
  logger[level](
    { event: "lifecycle-validation", ...configHealth },
    "Lifecycle validation completed",
  );
}

async function seedSourceConfigFromLegacyEnvVarIfUnseeded(): Promise<void> {
  const existingRecord = await getSourceConfigRecord();
  if (existingRecord) {
    return;
  }

  const rawSourceConfig = process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON;
  const parsedSourceConfig = rawSourceConfig
    ? parseSourceConfig(rawSourceConfig)
    : undefined;

  if (parsedSourceConfig?.isOk()) {
    await storeSourceConfigRecord({
      state: "configured",
      sourceConfig: parsedSourceConfig.value,
    });
  } else {
    await storeSourceConfigRecord({ state: "unconfigured" });
  }
}

export async function runLifecycleValidation(): Promise<void> {
  try {
    await seedSourceConfigFromLegacyEnvVarIfUnseeded();
    const resolvedConfig = await runSourceConfigValidation();
    logConfigHealth(resolvedConfig.configHealth);
  } catch (error) {
    const record = buildInactiveResolvedConfig([toErrorMessage(error)]);
    await storeResolvedConfig(record);
    logConfigHealth(record.configHealth);
  }
}
