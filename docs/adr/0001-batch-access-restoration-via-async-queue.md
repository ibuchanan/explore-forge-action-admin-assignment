# Route Batch Access Restoration through a Forge async event queue

Batch Access Restoration processes one or more Target User Emails submitted to a single action execution. A Forge `action` module function is capped at the standard invocation time limit and cannot use Long-Running Compute directly — only async event consumer functions can run up to 900 seconds. Running the per-user work inside the action function itself (sequentially or concurrently) risks the invocation timing out on any list large enough to matter. We chose to keep the action function thin — it only validates the input list and pushes one queue event per Target User Email (chunked to Forge's 50-events-per-`Queue.push()` limit, consumer concurrency capped at 5) — and let a consumer function invoke the existing, unmodified single-user `restoreAccess()` per event.

## Consequences

- The action's return value to the triggering Automation rule can only report how many emails were actually enqueued, not their outcomes — consumer invocations run asynchronously, after the action function has already returned.
- Target User Outcomes are therefore only observable as structured logs, correlated by a Batch ID threaded through each queue event's payload. There is no synchronous or durably stored Batch Summary.
- The queue's own automatic retry (via `InvocationError`) is deliberately not used. The existing client-level retry budget in `sendAdminApiRequest` remains the only retry layer, so a transient failure that exhausts it becomes a terminal Target User Outcome rather than triggering an automatic queue-level retry.
