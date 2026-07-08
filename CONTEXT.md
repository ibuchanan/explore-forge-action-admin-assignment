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

**Connection User**:
The Atlassian account associated with the Forge Automation action connection.
_Avoid_: initiator, triggering user

**Service Credential**:
The organization API key used by the app to call Atlassian Administration APIs.
_Avoid_: initiator token, connection user token

**Config Health**:
The app's stored assessment of whether environment-provided configuration is valid enough to run.
_Avoid_: UI configuration, live feature flag

**Lifecycle Validation**:
The validation and resolution of Environment Configuration when the app is installed or upgraded.
_Avoid_: runtime execution, manual trigger

**Source Config**:
The human-editable environment configuration used to describe authorized people and groups.
_Avoid_: resolved config, runtime input

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
The only supported app-owned configuration surface for access restoration.
_Avoid_: Forge configuration UI, Automation action UI

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
A stable configured alias used in Runtime Input to identify an Allowed Group.
_Avoid_: group ID, group name

**Access Restoration**:
The complete operation of restoring a Target User's directory access and adding them to the Selected Groups.
_Avoid_: admin assignment, activation only

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
- A **Target User** must be provided as **Runtime Input**.
- A **Target User Email** must resolve to exactly one **Target User** before Access Restoration can run.
- One or more **Selected Groups** must be provided as **Runtime Input**.
- Runtime Input names are `initiatorAccountId`, `targetUserEmail`, and `selectedGroupKeys`.
- Every **Selected Group** must be one of the configured **Allowed Groups**.
- **Selected Groups** are passed as **Group Keys**, not group IDs or group names.
- Each **Allowed Group** maps one **Group Key** to one **Directory Group ID**.
- Each **Allowed Group Name** must resolve to exactly one **Allowed Group**.
- The number of configured **Allowed Groups** is determined by environment configuration, not by app logic.
- **Authorized Initiators**, **Target Users**, and **Allowed Groups** must resolve within the same **Configured Directory**.
- **Access Restoration** restores directory access before adding group memberships.
- **Access Restoration** does not roll back earlier successful changes when a later change fails.
- **Access Restoration** can be rerun when Cloud Admin responses show the desired state already exists.
- Already-satisfied Access Restoration steps count as successful outcomes.
- **Preflight Checks** run before Access Restoration writes when they fit within the Lookup Budget.
- Every attempted Access Restoration produces an **Audit Record**.
- **Audit Records** are emitted as structured logs rather than stored as app state.
- Failed Access Restoration produces an **Automation Failure** after structured logging.
- Successful Access Restoration may return a **Success Summary**.
- A **Connection User** executes the Forge action connection but is not treated as the **Authorized Initiator**.
- A **Service Credential** performs Atlassian Administration API calls but does not authorize an Interactive Initiation.
- **Config Health** is stored by the app after lifecycle validation.
- Invalid **Config Health** prevents Access Restoration before any Atlassian Administration API call.
- **Lifecycle Validation** runs when the app is installed or upgraded.
- No separate operator-triggered validation path exists for the initial version.
- **Source Config** is resolved into **Resolved Config** before Access Restoration can run.
- **Source Config** is provided as one structured JSON object, excluding the Service Credential.
- **Environment Configuration** is the only app-owned configuration surface.
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
