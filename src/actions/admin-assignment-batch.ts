import { randomUUID } from "node:crypto";
import { type ProblemDetails, StandardError } from "@forge-ahead/errors";
import { PartialSuccessError, Queue } from "@forge/events";
import { ensureActiveResolvedConfig } from "../config-health/validate";
import { logger } from "../logging";
import {
  parseSelectedGroupKeys,
  parseTargetUserEmails,
  resolveSelectedGroups,
} from "./execution-plan";

const BATCH_QUEUE_KEY = "admin-assignment-batch-queue";
const BATCH_CONCURRENCY_KEY = "admin-assignment-batch-consumer";
const BATCH_CONCURRENCY_LIMIT = 5;
const MAX_EVENTS_PER_PUSH = 50;

interface BatchQueueEventBody {
  initiatorAccountId: string;
  targetUserEmail: string;
  selectedGroupKeys?: string;
  batchId: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export interface AdminAssignmentBatchActionPayload {
  initiatorAccountId?: string;
  targetUserEmails?: string;
  selectedGroupKeys?: string;
}

export interface BatchAcknowledgment {
  status: "accepted";
  batchId: string;
  acceptedCount: number;
  enqueuedCount: number;
}

function problem(status: number, detail: string): ProblemDetails {
  return StandardError.getOrDefault(status).error(detail)._unsafeUnwrapErr();
}

function fail(step: string, problemDetails: ProblemDetails): never {
  throw new Error(
    `Batch Access Restoration failed at step "${step}": ${problemDetails.detail}`,
  );
}

export async function enqueueAccessRestorationBatch(
  payload: AdminAssignmentBatchActionPayload,
): Promise<BatchAcknowledgment> {
  if (!payload.initiatorAccountId) {
    fail("validate-initiator", problem(400, "initiatorAccountId is missing"));
  }
  const initiatorAccountId = payload.initiatorAccountId;

  const apiToken = process.env.ORGANIZATION_API_KEY;
  if (!apiToken) {
    fail(
      "load-source-config",
      problem(500, "Environment Configuration is missing"),
    );
  }

  const runtimeConfigResult = await ensureActiveResolvedConfig();
  if (runtimeConfigResult.isErr()) {
    fail("load-source-config", runtimeConfigResult.error);
  }
  const { resolvedConfig } = runtimeConfigResult.value;

  if (
    !resolvedConfig.authorizedInitiatorAccountIds.includes(initiatorAccountId)
  ) {
    fail(
      "validate-initiator",
      problem(403, "initiatorAccountId is not an Authorized Initiator"),
    );
  }

  const selectedGroupsResult = resolveSelectedGroups(
    parseSelectedGroupKeys(payload.selectedGroupKeys),
    resolvedConfig,
  );
  if (selectedGroupsResult.isErr()) {
    fail("validate-selected-groups", selectedGroupsResult.error);
  }

  const targetUserEmails = parseTargetUserEmails(payload.targetUserEmails);
  if (targetUserEmails.length === 0) {
    fail(
      "validate-target-user-emails",
      problem(400, "targetUserEmails is missing or empty"),
    );
  }

  const batchId = randomUUID();
  const events = targetUserEmails.map((targetUserEmail) => ({
    body: {
      initiatorAccountId,
      targetUserEmail,
      selectedGroupKeys: payload.selectedGroupKeys,
      batchId,
    } satisfies BatchQueueEventBody,
    concurrency: {
      key: BATCH_CONCURRENCY_KEY,
      limit: BATCH_CONCURRENCY_LIMIT,
    },
  }));

  const queue = new Queue({ key: BATCH_QUEUE_KEY });
  let enqueuedCount = 0;
  for (const eventsChunk of chunk(events, MAX_EVENTS_PER_PUSH)) {
    try {
      await queue.push(eventsChunk);
      enqueuedCount += eventsChunk.length;
    } catch (error) {
      if (!(error instanceof PartialSuccessError)) {
        throw error;
      }

      const failedCount = error.failedEvents.length;
      enqueuedCount += eventsChunk.length - failedCount;

      for (const failedEvent of error.failedEvents) {
        logger.warn(
          {
            event: "admin-assignment-batch-enqueue-failure",
            batchId,
            targetUserEmail: (
              failedEvent.event.body as unknown as BatchQueueEventBody
            ).targetUserEmail,
            errorMessage: failedEvent.errorMessage,
          },
          "Batch Access Restoration enqueue partially failed",
        );
      }
    }
  }

  return {
    status: "accepted",
    batchId,
    acceptedCount: targetUserEmails.length,
    enqueuedCount,
  };
}
