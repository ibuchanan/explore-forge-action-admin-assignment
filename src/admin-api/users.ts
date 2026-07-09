import type { ProblemDetails } from "@forge-ahead/errors";
import { err, ok, type Result, StandardError } from "@forge-ahead/errors";
import {
  type LookupBounds,
  resolveUniqueMatch,
  sendAdminApiRequest,
} from "./client";

export interface DirectoryUser {
  accountId: string;
  email: string;
  active: boolean;
  groupIds: string[];
}

// Hand-coded: @forge-ahead/atlassian-api-types does not yet generate types for
// the Atlassian Access "Organizations" API (developer.atlassian.com/cloud/admin/
// organization/swagger.v3.json), which is where /v2/orgs/{orgId}/directories/
// {directoryId}/users/search lives. Its published api-access spec covers a
// different Atlassian Access API (API tokens/OAuth clients/service accounts)
// that happens to share the /orgs/{orgId}/... path prefix. Switch to generated
// types once that spec is added there.
interface UserSearchCandidate {
  accountId: string;
  email: string;
  accountStatus?: string;
  groups?: Array<{ id: string }>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  apiToken: string,
  orgId: string,
  directoryId: string,
  targetUserEmail: string,
  bounds: LookupBounds,
): Promise<Result<DirectoryUser, ProblemDetails>> {
  const normalizedTarget = normalizeEmail(targetUserEmail);

  return resolveUniqueMatch<UserSearchCandidate, DirectoryUser>(
    apiToken,
    bounds,
    (cursor) => ({
      method: "POST",
      path: `/v2/orgs/${orgId}/directories/${directoryId}/users/search`,
      body: {
        emails: [normalizedTarget],
        ...(cursor ? { cursor } : {}),
      },
    }),
    (candidate) =>
      normalizeEmail(candidate.email) === normalizedTarget
        ? {
            accountId: candidate.accountId,
            email: candidate.email,
            active: candidate.accountStatus === "active",
            groupIds: (candidate.groups ?? []).map((group) => group.id),
          }
        : undefined,
    {
      timeout:
        "Target User Email resolution exceeded the Lookup Budget timeout",
      requestFailed: "Target User Email resolution failed",
      notFound: "Target User Email did not resolve to any account",
      multipleFound: "Target User Email resolved to more than one account",
    },
  );
}

export async function restoreTargetUserAccess(
  apiToken: string,
  orgId: string,
  directoryId: string,
  accountId: string,
): Promise<Result<void, ProblemDetails>> {
  const response = await sendAdminApiRequest(apiToken, {
    method: "POST",
    path: `/v2/orgs/${orgId}/directories/${directoryId}/users/${accountId}/restore`,
  });

  if (response.isErr()) {
    return err(response.error);
  }

  if (!response.value.ok) {
    return StandardError.getOrDefault(response.value.status).error(
      "Restoring the Target User's directory access failed",
    );
  }

  return ok(undefined);
}
