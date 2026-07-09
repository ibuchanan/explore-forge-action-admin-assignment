import type { AdminAssignmentActionPayload } from "./admin-assignment";
import { restoreAccess } from "./admin-assignment";

export interface BatchQueueEvent {
  body: AdminAssignmentActionPayload;
}

export async function processAccessRestorationBatchEvent(
  event: BatchQueueEvent,
): Promise<void> {
  await restoreAccess(event.body);
}
