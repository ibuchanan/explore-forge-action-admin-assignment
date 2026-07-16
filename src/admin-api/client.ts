import api, { type APIResponse } from "@forge/api";
import type { ProblemDetails } from "@forge-ahead/errors";
import { err, ok, type Result, StandardError } from "@forge-ahead/errors";
import { logger } from "../logging";

const ADMIN_API_BASE_URL = "https://api.atlassian.com/admin";
const DEFAULT_MAX_RETRIES = 2;
const TRANSIENT_ADMIN_FAILURE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 250;

export interface AdminApiRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  maxRetries?: number;
}

export interface LookupBounds {
  maxPages: number;
  timeoutMs: number;
}

export interface PaginatedLookupMessages {
  timeout: string;
  requestFailed: string;
  notFound: string;
  multipleFound: string;
}

interface PaginatedSearchPage<TCandidate> {
  data?: TCandidate[];
  links?: { next?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
): number {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }
  }

  return BASE_RETRY_DELAY_MS * 2 ** attempt;
}

let nextRequestId = 0;

// Every outbound Admin API call funnels through here, so this is the single
// place to log a request's start before any network traffic and its outcome
// after. Forge invocations can time out (even mid-fetch) with no further logs
// after that point, so the start log is what identifies the pending request
// that was in flight when a timeout hit.
async function performRequest(
  apiToken: string,
  request: AdminApiRequest,
): Promise<APIResponse> {
  const requestId = ++nextRequestId;
  const startedAt = Date.now();
  logger.debug(
    {
      event: "admin-api-request-start",
      requestId,
      method: request.method,
      path: request.path,
    },
    "Admin API request starting",
  );

  try {
    const response = await api.fetch(`${ADMIN_API_BASE_URL}${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    logger.debug(
      {
        event: "admin-api-request-complete",
        requestId,
        method: request.method,
        path: request.path,
        status: response.status,
        durationMs: Date.now() - startedAt,
      },
      "Admin API request completed",
    );
    return response;
  } catch (error) {
    logger.debug(
      {
        event: "admin-api-request-failed",
        requestId,
        method: request.method,
        path: request.path,
        durationMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "Admin API request failed",
    );
    throw error;
  }
}

export async function sendAdminApiRequest(
  apiToken: string,
  request: AdminApiRequest,
): Promise<Result<APIResponse, ProblemDetails>> {
  const maxRetries = request.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;

  while (true) {
    const response = await performRequest(apiToken, request);

    const isTransientFailure = TRANSIENT_ADMIN_FAILURE_STATUS_CODES.has(
      response.status,
    );

    if (!isTransientFailure || attempt >= maxRetries) {
      return ok(response);
    }

    logger.warn(
      {
        event: "admin-api-retry",
        path: request.path,
        status: response.status,
        attempt: attempt + 1,
        maxRetries,
      },
      "Admin API request will be retried",
    );

    await sleep(
      computeRetryDelayMs(attempt, response.headers.get("Retry-After")),
    );
    attempt += 1;
  }
}

// Resolves a paginated Admin API search to exactly one match, failing closed
// on 0 or >1 matches. Both group-by-name and user-by-email lookups need this
// exact same page-walking, timeout, and uniqueness handling; only the request
// shape, candidate matching, and error messages differ per caller.
export async function resolveUniqueMatch<TCandidate, TMatch>(
  apiToken: string,
  bounds: LookupBounds,
  buildRequest: (cursor: string | undefined) => AdminApiRequest,
  mapCandidate: (candidate: TCandidate) => TMatch | undefined,
  messages: PaginatedLookupMessages,
): Promise<Result<TMatch, ProblemDetails>> {
  const deadline = Date.now() + bounds.timeoutMs;
  const matches: TMatch[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < bounds.maxPages; page += 1) {
    if (Date.now() > deadline) {
      return StandardError.getOrDefault(504).error(messages.timeout);
    }

    const response = await sendAdminApiRequest(apiToken, buildRequest(cursor));

    if (response.isErr()) {
      return err(response.error);
    }

    const apiResponse = response.value;
    if (!apiResponse.ok) {
      return StandardError.getOrDefault(apiResponse.status).error(
        messages.requestFailed,
      );
    }

    const body = (await apiResponse.json()) as PaginatedSearchPage<TCandidate>;
    for (const candidate of body.data ?? []) {
      const match = mapCandidate(candidate);
      if (match !== undefined) {
        matches.push(match);
      }
    }

    cursor = body.links?.next;
    if (!cursor) {
      break;
    }
  }

  const [match, ...rest] = matches;

  if (!match) {
    return StandardError.getOrDefault(404).error(messages.notFound);
  }

  if (rest.length > 0) {
    return StandardError.getOrDefault(409).error(messages.multipleFound);
  }

  return ok(match);
}
