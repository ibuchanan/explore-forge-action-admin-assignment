# Admin Access Automation

This context describes the language for a Forge Automation action that restores directory access and grants selected group memberships through Atlassian Administration.

## Language

**Authorized Initiator**:
A human user whose account is explicitly allowed to deliberately start the automation from the Atlassian UI.
_Avoid_: connection user, rule owner, automation actor

**Authorized Initiator Email**:
An email address in Source Config used to resolve an Authorized Initiator's account ID.
_Avoid_: runtime identity, display name

**Interactive Initiation**:
An automation execution started by a present human user from an Atlassian UI control.
_Avoid_: scheduled run, webhook event, system-triggered run

**Jira App Administrator**:
A Jira administrator who can access the app's Jira admin pages to view and edit Source Config.
_Avoid_: authorized initiator, connection user, organization administrator

**Connection User**:
The Atlassian account associated with the Forge Automation action connection.
_Avoid_: initiator, triggering user

**Service Credential**:
The organization API key used by the app to call Atlassian Administration APIs.
_Avoid_: initiator token, connection user token

**Config Health**:
The app's stored current assessment of whether Source Config and the Service Credential are valid enough to run, including when that assessment was made.
_Avoid_: UI configuration, live feature flag

**Lifecycle Validation**:
The validation and resolution of Source Config and the Service Credential when the app is installed or upgraded.
_Avoid_: runtime execution, manual trigger

**Source Config**:
The human-editable app configuration used to describe authorized people and groups after setup or migration.
_Avoid_: resolved config, runtime input, environment variable

**Resolved Config**:
The app-stored canonical identifiers derived from Source Config.
_Avoid_: environment variables, manual input

**Source Config Fingerprint**:
A deterministic digest of normalized Source Config used to detect stale Resolved Config.
_Avoid_: config version, deployment version

**Lookup Budget**:
A configured bound on how much resolution work the action may perform before failing closed.
_Avoid_: retry policy, background job

**Transient Admin Failure**:
A temporary Atlassian Administration API failure that may be retried within the active Lookup Budget.
_Avoid_: validation failure, unauthorized request

**Target User**:
The Atlassian account whose directory access and group memberships are changed by the action.
_Avoid_: initiator, connection user, actor

**Target User Email**:
An email address provided as Runtime Input to resolve the Target User.
_Avoid_: account ID input, display name

**Runtime Input**:
A value the Authorized Initiator provides while manually starting the automation.
_Avoid_: action configuration, environment variable

**Environment Configuration**:
Forge environment variables that hold deployment-managed settings; for access restoration, this contains only the Service Credential.
_Avoid_: Source Config, Forge configuration UI, Automation action UI

**Allowed Group**:
A configured Atlassian group that the action is permitted to add a Target User to.
_Avoid_: arbitrary group, organization admin group

**Allowed Group Name**:
The Atlassian group name in Source Config used to resolve an Allowed Group's Directory Group ID.
_Avoid_: group key, group label, search term

**Directory Group ID**:
The Atlassian Administration directory group identifier used in Cloud Admin group membership paths.
_Avoid_: group key, group name, resource ARI

**Configured Directory**:
The Atlassian directory that bounds all user and group resolution for the action.
_Avoid_: any directory, site directory

**Selected Group**:
An Allowed Group chosen for a specific Interactive Initiation.
_Avoid_: configured group, all groups

**Group Key**:
A stable alias, derived from an Allowed Group's Allowed Group Name, used in Runtime Input to identify the Allowed Group.
_Avoid_: group ID, group name (still a distinct concept from Allowed Group Name, even though its value is now always identical)

**Access Restoration**:
The complete operation of restoring a Target User's directory access and adding them to the Selected Groups.
_Avoid_: admin assignment, activation only

**Batch Access Restoration**:
The operation of performing an Access Restoration independently for each of one or more Target User Emails submitted together as Runtime Input to a single action execution.
_Avoid_: bulk assignment, multi-user restoration

**Target User Outcome**:
The success or failure result of one Target User's Access Restoration within a Batch Access Restoration, including the failing step name when unsuccessful.
_Avoid_: batch result, user result

**Batch ID**:
A generated identifier included in every Target User Outcome's Audit Record produced by the same Batch Access Restoration, used to correlate its logs. Absent for a single, non-batch Access Restoration.
_Avoid_: run ID, correlation ID, batch summary

**Preflight Check**:
A bounded read performed before access changes to detect invalid or already-satisfied requests.
_Avoid_: dry run, approval step

**Audit Record**:
A structured record of an attempted Access Restoration and its outcome.
_Avoid_: debug log, user-visible notification

**Automation Failure**:
A sanitized failure surfaced to Atlassian Automation when Access Restoration cannot proceed or complete.
_Avoid_: raw exception, Cloud Admin response body

**Success Summary**:
A minimal non-secret result returned after successful Access Restoration.
_Avoid_: audit record, raw API response

## Relationships

- An **Authorized Initiator** can trigger access restoration for one **Target User** per action execution.
- An **Authorized Initiator** is matched by Atlassian account ID at execution time.
- An **Authorized Initiator Email** must resolve to exactly one **Authorized Initiator**.
- **Authorized Initiator Emails** are provided in Source Config as a JSON array.
- An **Interactive Initiation** must identify exactly one **Authorized Initiator**.
- An **Interactive Initiation** is the only supported way to run the access restoration action.
- A **Jira App Administrator** can edit **Source Config** but is not automatically an **Authorized Initiator**.
- A **Jira App Administrator** may configure **Authorized Initiator Emails**.
- A **Target User** must be provided as **Runtime Input**.
- A **Target User Email** must resolve to exactly one **Target User** before Access Restoration can run.
- One or more **Selected Groups** must be provided as **Runtime Input**.
- Runtime Input names are `initiatorAccountId`, `targetUserEmail`, and `selectedGroupKeys`.
- Every **Selected Group** must be one of the configured **Allowed Groups**.
- **Selected Groups** are passed as **Group Keys**, not group IDs or group names.
- Each **Allowed Group** maps one **Group Key** to one **Directory Group ID**.
- Each **Allowed Group Name** must resolve to exactly one **Allowed Group**.
- The number of configured **Allowed Groups** is determined by **Source Config**, not by app logic.
- **Authorized Initiators**, **Target Users**, and **Allowed Groups** must resolve within the same **Configured Directory**.
- **Access Restoration** restores directory access before adding group memberships.
- **Access Restoration** does not roll back earlier successful changes when a later change fails.
- **Access Restoration** can be rerun when Cloud Admin responses show the desired state already exists.
- Already-satisfied Access Restoration steps count as successful outcomes.
- A **Batch Access Restoration** processes one or more Target User Emails as Runtime Input, each resolving to its own **Access Restoration**.
- A failing **Target User Outcome** does not stop the other Target User Emails in the same **Batch Access Restoration**.
- **Target User Emails** are not deduplicated within a **Batch Access Restoration**, since **Access Restoration** is idempotent.
- Every **Target User Outcome**'s **Audit Record** includes the **Batch ID** of the **Batch Access Restoration** it belongs to.
- A **Batch Access Restoration** does not return **Target User Outcomes** to the triggering Automation rule; they are only available as structured logs.
- **Preflight Checks** run before Access Restoration writes when they fit within the Lookup Budget.
- Every attempted Access Restoration produces an **Audit Record**.
- **Audit Records** are emitted as structured logs rather than stored as app state.
- Failed Access Restoration produces an **Automation Failure** after structured logging.
- Successful Access Restoration may return a **Success Summary**.
- A **Connection User** executes the Forge action connection but is not treated as the **Authorized Initiator**.
- A **Service Credential** performs Atlassian Administration API calls but does not authorize an Interactive Initiation.
- **Config Health** is stored by the app after validation.
- Invalid **Config Health** prevents Access Restoration before any Atlassian Administration API call.
- **Lifecycle Validation** runs when the app is installed or upgraded.
- A **Jira App Administrator** can trigger validation by saving **Source Config**.
- A **Jira App Administrator** can trigger validation by viewing or refreshing Config Health in the admin status page.
- **Source Config** is resolved into **Resolved Config** before Access Restoration can run.
- **Source Config** is provided as one structured JSON object, excluding the Service Credential.
- **Source Config** is the runtime source of truth once configured.
- **Source Config** may be intentionally unconfigured.
- **Environment Configuration** may seed **Source Config** only when Source Config has never been configured.
- An intentionally unconfigured app is not reseeded from **Environment Configuration**.
- Schema-valid **Source Config** may be stored even when validation produces inactive **Config Health**.
- Saving a new **Source Config** replaces the app's stored **Resolved Config** result, even when the new result has inactive **Config Health**.
- Inactive **Config Health** may include partial **Resolved Config** identifiers for diagnostics, but runtime execution must not use them.
- Resolving **Source Config** may call Atlassian Administration read/search APIs.
- **Resolved Config** must match the current **Source Config Fingerprint** before Access Restoration can run.
- Stale or missing **Resolved Config** may be refreshed during execution before any access changes.
- A **Lookup Budget** limits Source Config resolution and Target User Email resolution.
- **Transient Admin Failures** may be retried only while the active Lookup Budget allows.

## Example Dialogue

> **Dev:** "Should we allow the action because the connection user is trusted?"
> **Domain expert:** "No. The **Authorized Initiator** must be present in the rule execution and must be explicitly allowed."

## Flagged Ambiguities

- "user" was used to mean the person running the automation, the Forge connection account, and the account being restored; resolved: these are **Authorized Initiator**, **Connection User**, and **Target User**.
