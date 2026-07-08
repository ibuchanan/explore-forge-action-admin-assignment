import { StandardError, ok, type Result } from "@forge-ahead/errors";
import type { ProblemDetails } from "@forge-ahead/errors";
import type { DirectoryUser } from "../admin-api/users";
import type {
  ResolvedAllowedGroup,
  ResolvedConfig,
} from "../config/resolved-config";

export interface ExecutionPlan {
  needsRestore: boolean;
  groupsToAdd: ResolvedAllowedGroup[];
  groupsAlreadyMember: ResolvedAllowedGroup[];
}

export function parseSelectedGroupKeys(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function resolveSelectedGroups(
  selectedGroupKeys: string[],
  resolvedConfig: ResolvedConfig,
): Result<ResolvedAllowedGroup[], ProblemDetails> {
  if (selectedGroupKeys.length === 0) {
    return StandardError.getOrDefault(400).error(
      "selectedGroupKeys is missing or empty",
    );
  }

  const byKey = new Map(
    resolvedConfig.allowedGroups.map((group) => [group.key, group]),
  );

  const resolved: ResolvedAllowedGroup[] = [];
  for (const key of selectedGroupKeys) {
    const group = byKey.get(key);
    if (!group) {
      return StandardError.getOrDefault(400).error(
        `selectedGroupKeys included an unknown Group Key: ${key}`,
      );
    }
    resolved.push(group);
  }

  return ok(resolved);
}

export function planAccessRestoration(
  targetUser: DirectoryUser,
  selectedGroups: ResolvedAllowedGroup[],
): Result<ExecutionPlan, ProblemDetails> {
  const nonModifiable = selectedGroups.find((group) => !group.modifiable);
  if (nonModifiable) {
    return StandardError.getOrDefault(409).error(
      `Selected Group "${nonModifiable.key}" does not accept direct membership changes`,
    );
  }

  const groupsAlreadyMember = selectedGroups.filter((group) =>
    targetUser.groupIds.includes(group.directoryGroupId),
  );
  const groupsToAdd = selectedGroups.filter(
    (group) => !targetUser.groupIds.includes(group.directoryGroupId),
  );

  return ok({
    needsRestore: !targetUser.active,
    groupsToAdd,
    groupsAlreadyMember,
  });
}
