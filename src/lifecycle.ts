import { toErrorMessage } from "@forge-ahead/errors";
import type { ResolvedConfig } from "./config/resolved-config";
import { resolveConfig } from "./config/resolved-config";
import { parseSourceConfig } from "./config/source-config";
import { storeResolvedConfig } from "./config-health/store";

function inactiveConfigHealth(messages: string[]): ResolvedConfig {
  return {
    sourceConfigFingerprint: "",
    authorizedInitiatorAccountIds: [],
    allowedGroups: [],
    configHealth: { active: false, messages },
  };
}

export async function runLifecycleValidation(): Promise<void> {
  try {
    const rawSourceConfig = process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON;
    if (!rawSourceConfig) {
      const record = inactiveConfigHealth([
        "ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON is not set",
      ]);
      await storeResolvedConfig(record);
      console.log({ event: "lifecycle-validation", ...record.configHealth });
      return;
    }

    const parsedSourceConfig = parseSourceConfig(rawSourceConfig);
    if (parsedSourceConfig.isErr()) {
      const record = inactiveConfigHealth([parsedSourceConfig.error.detail]);
      await storeResolvedConfig(record);
      console.log({ event: "lifecycle-validation", ...record.configHealth });
      return;
    }

    const apiToken = process.env.ADMIN_ASSIGNMENT_API_TOKEN;
    if (!apiToken) {
      const record = inactiveConfigHealth([
        "ADMIN_ASSIGNMENT_API_TOKEN is not set",
      ]);
      await storeResolvedConfig(record);
      console.log({ event: "lifecycle-validation", ...record.configHealth });
      return;
    }

    const resolvedConfig = await resolveConfig(
      apiToken,
      parsedSourceConfig.value,
    );
    await storeResolvedConfig(resolvedConfig);
    console.log({
      event: "lifecycle-validation",
      ...resolvedConfig.configHealth,
    });
  } catch (error) {
    const record = inactiveConfigHealth([toErrorMessage(error)]);
    await storeResolvedConfig(record);
    console.log({ event: "lifecycle-validation", ...record.configHealth });
  }
}
