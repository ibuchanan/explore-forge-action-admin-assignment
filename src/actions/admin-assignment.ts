import { type ProblemDetails, StandardError } from "@forge-ahead/errors";
import { addUserToGroup } from "../admin-api/groups";
import { findUserByEmail, restoreTargetUserAccess } from "../admin-api/users";
import { computeSourceConfigFingerprint } from "../config/fingerprint";
import { type ResolvedConfig, resolveConfig } from "../config/resolved-config";
import { parseSourceConfig } from "../config/source-config";
import {
  getStoredResolvedConfig,
  storeResolvedConfig,
} from "../config-health/store";
import { logger } from "../logging";
import {
  parseSelectedGroupKeys,
  planAccessRestoration,
  resolveSelectedGroups,
} from "./execution-plan";

export interface AdminAssignmentActionPayload {
  initiatorAccountId?: string;
  targetUserEmail?: string;
  selectedGroupKeys?: string;
  batchId?: string;
}

export interface SuccessSummary {
  status: "succeeded";
  targetUserEmail: string;
  selectedGroupKeys: string[];
}

interface AuditStep {
  step: string;
  outcome: "success" | "failure" | "skipped";
  detail?: string;
  status?: number;
}

function problem(status: number, detail: string): ProblemDetails {
  return StandardError.getOrDefault(status).error(detail)._unsafeUnwrapErr();
}

export async function restoreAccess(
  payload: AdminAssignmentActionPayload,
): Promise<SuccessSummary> {
  const steps: AuditStep[] = [];
  const selectedGroupKeys = parseSelectedGroupKeys(payload.selectedGroupKeys);
  let resolvedTargetAccountId: string | undefined;
  let sourceConfigFingerprint: string | undefined;

  function fail(step: string, problemDetails: ProblemDetails): never {
    steps.push({
      step,
      outcome: "failure",
      detail: problemDetails.detail,
      status: problemDetails.status,
    });
    logger.error(
      {
        event: "admin-assignment-audit",
        ...(payload.batchId ? { batchId: payload.batchId } : {}),
        initiatorAccountId: payload.initiatorAccountId,
        targetUserEmail: payload.targetUserEmail,
        resolvedTargetAccountId,
        selectedGroupKeys,
        sourceConfigFingerprint,
        steps,
        status: "failed",
        failureCategory: step,
      },
      "Access Restoration failed",
    );
    throw new Error(
      `Access Restoration failed at step "${step}": ${problemDetails.detail}`,
    );
  }

  if (!payload.initiatorAccountId) {
    fail("validate-initiator", problem(400, "initiatorAccountId is missing"));
  }
  const initiatorAccountId = payload.initiatorAccountId;

  const rawSourceConfig = process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON;
  const apiToken = process.env.ADMIN_ASSIGNMENT_API_TOKEN;
  if (!rawSourceConfig || !apiToken) {
    fail(
      "load-source-config",
      problem(500, "Environment Configuration is missing"),
    );
  }

  const sourceConfigResult = parseSourceConfig(rawSourceConfig);
  if (sourceConfigResult.isErr()) {
    fail("load-source-config", sourceConfigResult.error);
  }
  const sourceConfig = sourceConfigResult.value;
  sourceConfigFingerprint = computeSourceConfigFingerprint(sourceConfig);
  steps.push({ step: "load-source-config", outcome: "success" });

  let resolvedConfig: ResolvedConfig | undefined =
    await getStoredResolvedConfig();
  if (
    !resolvedConfig?.configHealth.active ||
    resolvedConfig.sourceConfigFingerprint !== sourceConfigFingerprint
  ) {
    resolvedConfig = await resolveConfig(apiToken, sourceConfig);
    await storeResolvedConfig(resolvedConfig);
  }
  if (!resolvedConfig.configHealth.active) {
    fail(
      "refresh-resolved-config",
      problem(500, "Resolved Config is inactive after inline refresh"),
    );
  }
  steps.push({ step: "load-resolved-config", outcome: "success" });

  if (
    !resolvedConfig.authorizedInitiatorAccountIds.includes(initiatorAccountId)
  ) {
    fail(
      "validate-initiator",
      problem(403, "initiatorAccountId is not an Authorized Initiator"),
    );
  }
  steps.push({ step: "validate-initiator", outcome: "success" });

  const selectedGroupsResult = resolveSelectedGroups(
    selectedGroupKeys,
    resolvedConfig,
  );
  if (selectedGroupsResult.isErr()) {
    fail("validate-selected-groups", selectedGroupsResult.error);
  }
  const selectedGroups = selectedGroupsResult.value;
  steps.push({ step: "validate-selected-groups", outcome: "success" });

  const targetUserEmail = payload.targetUserEmail?.trim();
  if (!targetUserEmail) {
    fail("resolve-target-user", problem(400, "targetUserEmail is missing"));
  }

  const targetUserResult = await findUserByEmail(
    apiToken,
    sourceConfig.orgId,
    sourceConfig.directoryId,
    targetUserEmail,
    {
      maxPages: sourceConfig.lookup.targetUserMaxPages,
      timeoutMs: sourceConfig.lookup.targetUserTimeoutMs,
    },
  );
  if (targetUserResult.isErr()) {
    fail("resolve-target-user", targetUserResult.error);
  }
  const targetUser = targetUserResult.value;
  resolvedTargetAccountId = targetUser.accountId;
  steps.push({ step: "resolve-target-user", outcome: "success" });

  const planResult = planAccessRestoration(targetUser, selectedGroups);
  if (planResult.isErr()) {
    fail("preflight", planResult.error);
  }
  const plan = planResult.value;
  steps.push({ step: "preflight", outcome: "success" });

  if (plan.needsRestore) {
    const restoreResult = await restoreTargetUserAccess(
      apiToken,
      sourceConfig.orgId,
      sourceConfig.directoryId,
      targetUser.accountId,
    );
    if (restoreResult.isErr()) {
      fail("restore-access", restoreResult.error);
    }
    steps.push({ step: "restore-access", outcome: "success" });
  } else {
    steps.push({
      step: "restore-access",
      outcome: "skipped",
      detail: "access was already restored",
    });
  }

  for (const group of plan.groupsToAdd) {
    const membershipResult = await addUserToGroup(
      apiToken,
      sourceConfig.orgId,
      sourceConfig.directoryId,
      group.directoryGroupId,
      targetUser.accountId,
    );
    if (membershipResult.isErr()) {
      fail(`add-group-membership:${group.key}`, membershipResult.error);
    }
    steps.push({
      step: `add-group-membership:${group.key}`,
      outcome: "success",
    });
  }
  for (const group of plan.groupsAlreadyMember) {
    steps.push({
      step: `add-group-membership:${group.key}`,
      outcome: "skipped",
      detail: "group membership already existed",
    });
  }

  logger.info(
    {
      event: "admin-assignment-audit",
      ...(payload.batchId ? { batchId: payload.batchId } : {}),
      initiatorAccountId,
      targetUserEmail,
      resolvedTargetAccountId,
      selectedGroupKeys,
      sourceConfigFingerprint,
      steps,
      status: "succeeded",
    },
    "Access Restoration succeeded",
  );

  return {
    status: "succeeded",
    targetUserEmail,
    selectedGroupKeys,
  };
}
