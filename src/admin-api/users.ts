import { type Result, StandardError, err, ok } from "@forge-ahead/errors";
import type { ProblemDetails } from "@forge-ahead/errors";
import { sendAdminApiRequest } from "./client";

export interface DirectoryUser {
  accountId: string;
  email: string;
  active: boolean;
  groupIds: string[];
}

export interface LookupBounds {
  maxPages: number;
  timeoutMs: number;
}

interface UserSearchPage {
  data?: Array<{
    accountId: string;
    email: string;
    accountStatus?: string;
    groups?: Array<{ id: string }>;
  }>;
  links?: { next?: string };
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
  const deadline = Date.now() + bounds.timeoutMs;

  const matches: DirectoryUser[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < bounds.maxPages; page += 1) {
    if (Date.now() > deadline) {
      return StandardError.getOrDefault(504).error(
        "Target User Email resolution exceeded the Lookup Budget timeout",
      );
    }

    const response = await sendAdminApiRequest(apiToken, {
      method: "POST",
      path: `/v2/orgs/${orgId}/directories/${directoryId}/users/search`,
      body: {
        emails: [normalizedTarget],
        ...(cursor ? { cursor } : {}),
      },
    });

    if (response.isErr()) {
      return err(response.error);
    }

    const apiResponse = response.value;
    if (!apiResponse.ok) {
      return StandardError.getOrDefault(apiResponse.status).error(
        "Target User Email resolution failed",
      );
    }

    const body = (await apiResponse.json()) as UserSearchPage;
    for (const candidate of body.data ?? []) {
      if (normalizeEmail(candidate.email) === normalizedTarget) {
        matches.push({
          accountId: candidate.accountId,
          email: candidate.email,
          active: candidate.accountStatus === "active",
          groupIds: (candidate.groups ?? []).map((group) => group.id),
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
      "Target User Email did not resolve to any account",
    );
  }

  if (rest.length > 0) {
    return StandardError.getOrDefault(409).error(
      "Target User Email resolved to more than one account",
    );
  }

  return ok(match);
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
