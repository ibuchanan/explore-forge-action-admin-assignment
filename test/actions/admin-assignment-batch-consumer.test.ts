import { describe, expect, it, vi } from "vitest";
import { restoreAccess } from "../../src/actions/admin-assignment";
import { processAccessRestorationBatchEvent } from "../../src/actions/admin-assignment-batch-consumer";

vi.mock("../../src/actions/admin-assignment", () => ({
  restoreAccess: vi.fn(),
}));

describe("processAccessRestorationBatchEvent", () => {
  it("delegates to restoreAccess with the queue event's body", async () => {
    const body = {
      initiatorAccountId: "initiator-1",
      targetUserEmail: "person@example.com",
      selectedGroupKeys: "jira-admins",
      batchId: "batch-1",
    };

    await processAccessRestorationBatchEvent({ body });

    expect(restoreAccess).toHaveBeenCalledWith(body);
  });
});
