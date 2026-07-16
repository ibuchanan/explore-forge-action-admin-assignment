# Admin Access Automation Spec

This document specifies the Forge Automation action that restores Atlassian directory access for a target user and adds that user to selected configured groups.

Canonical terms are defined in [CONTEXT.md](../CONTEXT.md).

## Status

Draft design, ready for implementation planning.

## Goal

The action restores access for one Target User when deliberately run by an Authorized Initiator from the Atlassian UI, then adds the Target User to one or more Selected Groups.

## Non-Goals

- The action does not assign organization admin or site admin roles directly.
- The action does not accept arbitrary group IDs, group names, or emails for group membership.
- The action does not support scheduled, webhook, system-triggered, or indirect automation runs.
- The app does not maintain durable per-run audit history.
- The initial version does not provide a separate operator-triggered config validation endpoint.

Source Config editing and the admin status dashboard are specified separately in [Admin Config Lifecycle Spec](admin-config-lifecycle-spec.md); this spec's Non-Goals above no longer include lacking an editable Forge configuration UI.

## Atlassian APIs

The action uses the Atlassian Organizations REST API with a Service Credential.

Restore Target User access:

```text
POST https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/restore
```

Add Target User to an Allowed Group:

```text
POST https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/memberships
```

Membership request body:

```json
{
  "accountId": "target-account-id"
}
```

User and group resolution use Atlassian Administration read/search APIs scoped to the same organization and Configured Directory.

References:

- https://developer.atlassian.com/cloud/admin/organization/rest/api-group-users/
- https://developer.atlassian.com/cloud/admin/organization/rest/api-group-groups/

## Environment Configuration

The only app-owned Environment Configuration is the Service Credential, kept as a deployment-managed Forge environment variable rather than moved into the app's own storage — see [ADR 0002](adr/0002-keep-service-credential-in-forge-environment.md).

Required variable:

```text
ADMIN_ASSIGNMENT_API_TOKEN
```

`ADMIN_ASSIGNMENT_API_TOKEN` must be stored as an encrypted Forge environment variable. It is not part of the Source Config fingerprint.

## Source Config Shape

Source Config is admin-editable app configuration, not Environment Configuration. A Jira App Administrator edits it from the Configure admin page, described in [Admin Config Lifecycle Spec](admin-config-lifecycle-spec.md); it is stored in Forge KVS rather than `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON`, which is now legacy migration input only. Source Config is a structured object:

```json
{
  "orgId": "organization-id",
  "directoryId": "directory-id",
  "authorizedInitiatorEmails": ["alice@example.com", "bob@example.com"],
  "allowedGroups": [
    { "name": "jira-administrators" },
    { "name": "support-administrators" }
  ],
  "lookup": {
    "targetUserTimeoutMs": 10000,
    "targetUserMaxPages": 5,
    "configResolutionTimeoutMs": 30000,
    "configResolutionMaxPages": 20
  }
}
```

Schema rules:

- `orgId` is required.
- `directoryId` is required.
- `authorizedInitiatorEmails` is a non-empty JSON array of email strings.
- `allowedGroups` is a non-empty JSON array.
- `allowedGroups[*].name` is the exact Atlassian group name to resolve.
- Resolution derives the Group Key and label from `allowedGroups[*].name`; an admin does not type them separately.
- The app does not enforce a hardcoded maximum number of allowed groups.
- Lookup budget fields are optional and have conservative defaults.

Implementation should validate this shape with zenv/Zod. Schema errors become inactive Config Health, not unhandled exceptions.

## Resolved Config

Source Config is resolved into canonical identifiers before Access Restoration can run.

Resolved Config contains:

- Source Config fingerprint.
- Resolved Authorized Initiator account IDs.
- Resolved Allowed Groups, each mapping:
  - Group Key (derived from, and identical to, the Allowed Group Name)
  - label (derived from, and identical to, the Allowed Group Name)
  - Allowed Group Name
  - Directory Group ID
- Config Health status and non-secret validation messages.

Resolution rules:

- Authorized Initiator Emails must each resolve to exactly one Atlassian account ID.
- Allowed Group Names must each resolve to exactly one Directory Group ID.
- Authorized Initiators, Target Users, and Allowed Groups must all resolve within the same Configured Directory.
- Zero matches are invalid.
- Ambiguous matches are invalid.
- Lookup failures, timeouts, and rate limits are invalid unless a bounded retry succeeds.

The Source Config fingerprint is computed from normalized Source Config. It excludes the Service Credential.

## Config Health

Config Health is stored in Forge KVS.

Lifecycle Validation runs on install and upgrade:

- parse Source Config
- validate schema
- validate Service Credential presence
- resolve Authorized Initiator Emails
- resolve Allowed Group Names
- store active Resolved Config when all checks pass
- store inactive Config Health with non-secret reasons when any check fails
- emit structured validation logs

Action execution also checks Config Health:

- If stored Resolved Config is active and matches the current Source Config fingerprint, execution may use it.
- If stored Resolved Config is missing, stale, or inactive, execution may refresh it inline before any access changes.
- Inline refresh must fit within the config-resolution Lookup Budget.
- If inline refresh fails, execution stores inactive Config Health and fails before any write API call.

The app cannot dynamically remove or hide the Forge action from Automation. “Inactive” means execution fails closed before Cloud Admin writes.

## Automation Contract

The action is supported only behind a Jira Automation manual trigger from a work item.

Required Forge action inputs:

```text
initiatorAccountId
targetUserEmail
selectedGroupKeys
```

Input meanings:

- `initiatorAccountId`: the account ID from `{{initiator.accountId}}`.
- `targetUserEmail`: the Target User Email entered by the Authorized Initiator at manual trigger time.
- `selectedGroupKeys`: comma-separated Group Keys chosen at manual trigger time.

Validation rules:

- Missing `initiatorAccountId` fails closed.
- An initiator account ID not present in Resolved Config fails closed.
- Missing or malformed `targetUserEmail` fails closed.
- A Target User Email that does not resolve uniquely fails closed.
- Missing or empty `selectedGroupKeys` fails closed.
- Unknown Group Keys fail closed.
- Runtime input never supplies group IDs.

## Execution Flow

Execution performs no Cloud Admin writes until config, initiator, target, and selected group inputs are valid.

Required order:

1. Validate and load current Source Config.
2. Load or refresh Resolved Config.
3. Validate `initiatorAccountId` against resolved Authorized Initiators.
4. Parse and validate `selectedGroupKeys`.
5. Resolve `targetUserEmail` to exactly one Target User account ID within the Configured Directory.
6. Run bounded Preflight Checks when available and within the Lookup Budget.
7. Restore Target User directory access.
8. Add Target User to each Selected Group.
9. Emit one structured Audit Record.
10. Return a Success Summary when supported by the Forge action boundary.

Access Restoration restores directory access before adding group memberships.

The action fails on the first non-idempotent failed operation. It does not roll back earlier successful changes.

## Target User Email Resolution

Target User Email remains the operator-facing input for usability.

Resolution rules:

- Normalize by trimming whitespace and comparing email addresses case-insensitively.
- Use current Organizations REST API user listing/search capabilities scoped to `orgId` and `directoryId`.
- Prefer targeted search parameters when available.
- Compare returned `emailAddress` values exactly after normalization.
- Page only within `targetUserMaxPages`.
- Stop when `targetUserTimeoutMs` is exceeded.
- Fail closed when resolution is slow, ambiguous, incomplete, or unsuccessful.

The deprecated `POST /v1/orgs/{orgId}/users/search` endpoint must not be used.

## Preflight Checks

Preflight Checks are best effort and bounded.

Preflight may check:

- the Target User belongs to the Configured Directory
- the Target User is already active/restored
- the Target User is already a member of each Selected Group
- a Selected Group is eligible for direct membership changes when the API exposes that information

If a reliable preflight answer is unavailable, execution relies on the write response.

If preflight predicts that required group additions cannot succeed, execution fails before restoring access.

## Idempotency

The action is idempotent to the extent possible without app-managed run state.

Successful outcomes include:

- access was restored in this run
- access was already restored
- group membership was added in this run
- group membership already existed

Recognizable “already done” responses from Cloud Admin writes count as success.

## Retries and Budgets

Cloud Admin calls may retry only Transient Admin Failures:

- `429`
- `500`
- `502`
- `503`
- `504`
- network timeout

Retry rules:

- Use a small retry count, such as two retries after the initial request.
- Honor `Retry-After` when present.
- Never exceed the active Lookup Budget.
- Never retry validation failures such as `400`, `401`, `403`, or `404`.
- Never retry semantic conflicts except recognized idempotent “already done” cases.
- Log retry attempts in structured form.

## Error Handling

Implementation should follow the `@forge-ahead/errors` pattern:

- internal functions return `Result<T, ProblemDetails>` or `ResultAsync<T, ProblemDetails>`
- schema failures become `ValidationProblemDetails`
- Cloud Admin failures become `ProblemDetails`
- unhandled throws are not the normal control path
- Forge boundaries translate typed errors into logs and Automation outcomes

Lifecycle boundary behavior:

- log structured validation failures
- store inactive Config Health

Action boundary behavior:

- emit one Audit Record
- return or throw a sanitized Automation Failure
- never expose API tokens, stack traces, or raw Cloud Admin response bodies

## Success Summary

When the Forge action surface supports returning a useful value, successful execution returns a minimal non-secret summary:

```json
{
  "status": "succeeded",
  "targetUserEmail": "person@example.com",
  "selectedGroupKeys": ["jira-admins", "support-admins"]
}
```

The Success Summary does not include account IDs, Directory Group IDs, API responses, or config internals.

## Audit Records

Every attempted Access Restoration emits one structured log record.

Audit Record fields should include:

- run or correlation ID when available
- initiator account ID
- target user email
- resolved target account ID when available
- selected group keys
- per-step outcomes
- config fingerprint
- final status
- sanitized failure category when failed

Audit Records are logs only in the initial version. They are not stored in Forge KVS.

## Forge Manifest Implications

Implementation will likely require:

- lifecycle trigger module for install and upgrade validation
- Forge KVS access and `storage:app` scope
- backend egress to `https://api.atlassian.com`
- removal of Jira issue comment scopes from the sample app if no longer needed
- action input replacement with `initiatorAccountId`, `targetUserEmail`, and `selectedGroupKeys`
- separate native configuration resources for single-user and batch actions
- `jira:adminPage` modules for the Configure and Admin status surfaces, per [Admin Config Lifecycle Spec](admin-config-lifecycle-spec.md)

Manifest changes require Forge deploy and reinstall/upgrade where scopes or egress change.

## Open Implementation Questions

- Confirm the exact current Organizations REST API query parameters for efficient user email narrowing in v2.
- Confirm the exact current Organizations REST API query parameters for efficient exact group-name narrowing in v2.
- Confirm the Forge Automation action boundary shape for structured success values and structured failures.
- Decide whether to add `zenv` directly or use explicit `zod` plus a small env parser.
- Decide the exact KVS record keys and stored Config Health schema.
