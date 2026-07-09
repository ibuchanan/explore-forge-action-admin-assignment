import type { ProblemDetails } from "@forge-ahead/errors";
import { err, ok, type Result, StandardError } from "@forge-ahead/errors";
import {
  type LookupBounds,
  resolveUniqueMatch,
  sendAdminApiRequest,
} from "./client";

export interface DirectoryGroup {
  id: string;
  name: string;
  modifiable: boolean;
}

// Hand-coded: see the note in ./users.ts. This is the same "Organizations" API
// gap in @forge-ahead/atlassian-api-types, just for the groups/search endpoint.
interface GroupSearchCandidate {
  id: string;
  name: string;
  managementAccess?: { modifiable?: boolean };
}

export async function findGroupByName(
  apiToken: string,
  orgId: string,
  directoryId: string,
  allowedGroupName: string,
  bounds: LookupBounds,
): Promise<Result<DirectoryGroup, ProblemDetails>> {
  return resolveUniqueMatch<GroupSearchCandidate, DirectoryGroup>(
    apiToken,
    bounds,
    (cursor) => ({
      method: "POST",
      path: `/v2/orgs/${orgId}/directories/${directoryId}/groups/search`,
      body: {
        groupNames: [allowedGroupName],
        ...(cursor ? { cursor } : {}),
      },
    }),
    (candidate) =>
      candidate.name === allowedGroupName
        ? {
            id: candidate.id,
            name: candidate.name,
            modifiable: candidate.managementAccess?.modifiable ?? true,
          }
        : undefined,
    {
      timeout:
        "Allowed Group Name resolution exceeded the Lookup Budget timeout",
      requestFailed: "Allowed Group Name resolution failed",
      notFound: "Allowed Group Name did not resolve to any group",
      multipleFound: "Allowed Group Name resolved to more than one group",
    },
  );
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
