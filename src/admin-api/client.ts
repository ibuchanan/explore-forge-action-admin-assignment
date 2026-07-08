import api, { type APIResponse } from "@forge/api";
import { type Result, ok } from "@forge-ahead/errors";
import type { ProblemDetails } from "@forge-ahead/errors";

const ADMIN_API_BASE_URL = "https://api.atlassian.com";
const DEFAULT_MAX_RETRIES = 2;
const TRANSIENT_ADMIN_FAILURE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 250;

export interface AdminApiRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  maxRetries?: number;
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

async function performRequest(
  apiToken: string,
  request: AdminApiRequest,
): Promise<APIResponse> {
  return api.fetch(`${ADMIN_API_BASE_URL}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
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

    console.log({
      event: "admin-api-retry",
      path: request.path,
      status: response.status,
      attempt: attempt + 1,
      maxRetries,
    });

    await sleep(
      computeRetryDelayMs(attempt, response.headers.get("Retry-After")),
    );
    attempt += 1;
  }
}
