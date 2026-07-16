import { findGroupByName } from "../admin-api/groups";
import { findUserByEmail } from "../admin-api/users";
import { logger } from "../logging";
import { computeSourceConfigFingerprint } from "./fingerprint";
import type { SourceConfig } from "./source-config";

export interface ConfigHealth {
  active: boolean;
  messages: string[];
  validatedAt: string;
}

export interface ResolvedAllowedGroup {
  key: string;
  label: string;
  name: string;
  directoryGroupId: string;
  modifiable: boolean;
}

export interface ResolvedConfig {
  sourceConfigFingerprint: string;
  authorizedInitiatorAccountIds: string[];
  allowedGroups: ResolvedAllowedGroup[];
  configHealth: ConfigHealth;
}

export async function resolveConfig(
  apiToken: string,
  sourceConfig: SourceConfig,
): Promise<ResolvedConfig> {
  const bounds = {
    maxPages: sourceConfig.lookup.configResolutionMaxPages,
    timeoutMs: sourceConfig.lookup.configResolutionTimeoutMs,
  };
  const messages: string[] = [];

  const authorizedInitiatorAccountIds: string[] = [];
  for (const email of sourceConfig.authorizedInitiatorEmails) {
    const result = await findUserByEmail(
      apiToken,
      sourceConfig.orgId,
      sourceConfig.directoryId,
      email,
      bounds,
    );

    if (result.isErr()) {
      logger.warn(
        {
          event: "resolve-config-lookup-failed",
          lookupKind: "authorizedInitiatorEmail",
          status: result.error.status,
          detail: result.error.detail,
        },
        "Authorized Initiator Email lookup failed",
      );
      messages.push(
        `Authorized Initiator Email did not resolve to exactly one account: ${result.error.detail}`,
      );
      continue;
    }

    authorizedInitiatorAccountIds.push(result.value.accountId);
  }

  const allowedGroups: ResolvedAllowedGroup[] = [];
  for (const group of sourceConfig.allowedGroups) {
    const result = await findGroupByName(
      apiToken,
      sourceConfig.orgId,
      sourceConfig.directoryId,
      group.name,
      bounds,
    );

    if (result.isErr()) {
      logger.warn(
        {
          event: "resolve-config-lookup-failed",
          lookupKind: "allowedGroupName",
          groupName: group.name,
          status: result.error.status,
          detail: result.error.detail,
        },
        "Allowed Group Name lookup failed",
      );
      messages.push(
        `Allowed Group Name "${group.name}" did not resolve to exactly one group: ${result.error.detail}`,
      );
      continue;
    }

    allowedGroups.push({
      key: group.name,
      label: group.name,
      name: group.name,
      directoryGroupId: result.value.id,
      modifiable: result.value.modifiable,
    });
  }

  return {
    sourceConfigFingerprint: computeSourceConfigFingerprint(sourceConfig),
    authorizedInitiatorAccountIds,
    allowedGroups,
    configHealth: {
      active: messages.length === 0,
      messages,
      validatedAt: new Date().toISOString(),
    },
  };
}
