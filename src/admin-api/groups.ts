import { type Result, StandardError, err, ok } from "@forge-ahead/errors";
import type { ProblemDetails } from "@forge-ahead/errors";
import { sendAdminApiRequest } from "./client";
import type { LookupBounds } from "./users";

export interface DirectoryGroup {
  id: string;
  name: string;
  modifiable: boolean;
}

interface GroupSearchPage {
  data?: Array<{
    id: string;
    name: string;
    managementAccess?: { modifiable?: boolean };
  }>;
  links?: { next?: string };
}

export async function findGroupByName(
  apiToken: string,
  orgId: string,
  directoryId: string,
  allowedGroupName: string,
  bounds: LookupBounds,
): Promise<Result<DirectoryGroup, ProblemDetails>> {
  const deadline = Date.now() + bounds.timeoutMs;
  const matches: DirectoryGroup[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < bounds.maxPages; page += 1) {
    if (Date.now() > deadline) {
      return StandardError.getOrDefault(504).error(
        "Allowed Group Name resolution exceeded the Lookup Budget timeout",
      );
    }

    const response = await sendAdminApiRequest(apiToken, {
      method: "POST",
      path: `/v2/orgs/${orgId}/directories/${directoryId}/groups/search`,
      body: {
        searchTerm: allowedGroupName,
        ...(cursor ? { cursor } : {}),
      },
    });

    if (response.isErr()) {
      return err(response.error);
    }

    const apiResponse = response.value;
    if (!apiResponse.ok) {
      return StandardError.getOrDefault(apiResponse.status).error(
        "Allowed Group Name resolution failed",
      );
    }

    const body = (await apiResponse.json()) as GroupSearchPage;
    for (const candidate of body.data ?? []) {
      if (candidate.name === allowedGroupName) {
        matches.push({
          id: candidate.id,
          name: candidate.name,
          modifiable: candidate.managementAccess?.modifiable ?? true,
        });
      }
    }

    cursor = body.links?.next;
    if (!cursor) {
      break;
    }
  }

  const [match, ...rest] = matches;

  if (!match) {
    return StandardError.getOrDefault(404).error(
      "Allowed Group Name did not resolve to any group",
    );
  }

  if (rest.length > 0) {
    return StandardError.getOrDefault(409).error(
      "Allowed Group Name resolved to more than one group",
    );
  }

  return ok(match);
}

export async function addUserToGroup(
  apiToken: string,
  orgId: string,
  directoryId: string,
  directoryGroupId: string,
  accountId: string,
): Promise<Result<void, ProblemDetails>> {
  const response = await sendAdminApiRequest(apiToken, {
    method: "POST",
    path: `/v2/orgs/${orgId}/directories/${directoryId}/groups/${directoryGroupId}/memberships`,
    body: { accountId },
  });

  if (response.isErr()) {
    return err(response.error);
  }

  if (!response.value.ok) {
    return StandardError.getOrDefault(response.value.status).error(
      "Adding the Target User to the Selected Group failed",
    );
  }

  return ok(undefined);
}
