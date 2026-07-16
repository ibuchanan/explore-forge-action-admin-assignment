# Admin Config Lifecycle Tickets

Source: [Admin Config Lifecycle Spec](admin-config-lifecycle-spec.md)

Work the frontier: any ticket whose blockers are complete can start. Status for every ticket is `ready-for-agent`.

## 01 — Establish Source Config Record Storage

**What to build:** the backend can represent configured and intentionally unconfigured Source Config, validate structured Source Config candidates, parse legacy JSON by delegating to the same validation path, and persist/load the Source Config record without callers depending on raw KVS shape.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Source Config can be stored and loaded as either configured or intentionally unconfigured current state.
- [ ] Missing Source Config state is distinguishable from intentionally unconfigured state.
- [ ] Structured Source Config candidates validate through a shared helper.
- [ ] Legacy JSON parsing delegates to the same validation behavior as structured candidates.
- [ ] Storage and validation tests cover configured, unconfigured, missing, valid, and malformed cases.

## 02 — Validate Source Config Into Current Config Health

**What to build:** any backend caller can validate the current Source Config record into stored Config Health with `validatedAt`, including active results, inactive unconfigured state, missing Service Credential, resolution failures, and partial diagnostic results that runtime must not use.

**Blocked by:** 01 — Establish Source Config Record Storage.

**Status:** ready-for-agent

- [ ] Configured Source Config validates against the Service Credential and Admin API resolution rules within the Lookup Budget.
- [ ] Unconfigured Source Config stores inactive Config Health without calling Atlassian Administration APIs.
- [ ] Missing Service Credential stores inactive Config Health while preserving the configured Source Config.
- [ ] Inactive Config Health can retain partial resolved diagnostics, but runtime-facing checks reject it.
- [ ] Every validation result records `validatedAt`.

## 03 — Migrate Lifecycle Validation To KVS-Backed Source Config

**What to build:** Lifecycle Validation seeds Source Config from the legacy env var only when no Source Config record exists, writes an explicit unconfigured record otherwise, ignores the legacy env var after that, and stores current Config Health through the shared validation path.

**Blocked by:** 01 — Establish Source Config Record Storage; 02 — Validate Source Config Into Current Config Health.

**Status:** ready-for-agent

- [ ] Empty storage plus schema-valid legacy Source Config seeds configured Source Config before validation.
- [ ] Empty storage plus absent or malformed legacy Source Config stores intentionally unconfigured state and inactive Config Health.
- [ ] Existing configured or unconfigured Source Config prevents legacy env-var reseeding.
- [ ] Lifecycle Validation stores active or inactive Config Health through the shared validation path.
- [ ] Lifecycle tests cover install/upgrade-style events without relying on direct Source Config env-var runtime loading.

## 04 — Run Access Restoration From KVS-Backed Source Config

**What to build:** single and Batch Access Restoration load Source Config from the shared store, refresh stale or missing Resolved Config through the shared validation path, and fail closed before Cloud Admin writes when Source Config is unconfigured or Config Health is inactive.

**Blocked by:** 01 — Establish Source Config Record Storage; 02 — Validate Source Config Into Current Config Health.

**Status:** ready-for-agent

- [ ] Single Access Restoration loads Source Config from the shared store rather than the legacy env var.
- [ ] Batch Access Restoration loads Source Config from the shared store rather than the legacy env var.
- [ ] Stale or missing Resolved Config triggers the shared validation path before any Cloud Admin write.
- [ ] Unconfigured Source Config or inactive Config Health fails closed before Cloud Admin writes.
- [ ] Runtime Input, write order, idempotency behavior, and audit logging contract remain unchanged.

## 05 — Ship The Configure Admin Page

**What to build:** a Jira App Administrator can edit structured non-secret Source Config fields, save schema-valid config even when it resolves inactive, see saved-active versus saved-inactive feedback, and deliberately reset Source Config to the unconfigured state without exposing or modifying the Service Credential.

**Blocked by:** 01 — Establish Source Config Record Storage; 02 — Validate Source Config Into Current Config Health.

**Status:** ready-for-agent

- [ ] Configure is exposed as a Forge admin Configure surface for Jira App Administrators.
- [ ] The page presents structured fields for Source Config rather than a raw JSON editor.
- [ ] The page can load and edit the full saved non-secret Source Config.
- [ ] Saving malformed input does not write Source Config.
- [ ] Saving schema-valid input writes Source Config and returns saved-active or saved-inactive feedback.
- [ ] Reset/Clear writes intentionally unconfigured state, stores inactive Config Health, and leaves the Service Credential untouched.
- [ ] Admin UI resolvers never return the Service Credential.

## 06 — Ship The Admin Status Page

**What to build:** a Jira App Administrator can view current Config Health without reading logs, refresh stale or missing health through the shared validation path, see sanitized messages, resolved Allowed Group labels, Source Config fingerprint, `validatedAt`, and navigate to Configure.

**Blocked by:** 02 — Validate Source Config Into Current Config Health; 05 — Ship The Configure Admin Page.

**Status:** ready-for-agent

- [ ] Admin status is exposed as a plain Forge Jira admin page.
- [ ] The status payload is narrower than Configure and does not return full Source Config.
- [ ] Missing or stale Config Health refreshes through the shared validation path before status is returned.
- [ ] The page displays active/inactive state, sanitized messages, resolved Allowed Group labels, Source Config fingerprint, and `validatedAt`.
- [ ] The page provides a path to Configure and a manual refresh action.
- [ ] Resolver failures produce sanitized UI feedback instead of requiring log inspection.

## 07 — Clean Up Env-Var-Facing UX And Docs

**What to build:** user-facing copy and project docs no longer present `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` as the runtime configuration source, while preserving the Service Credential as Environment Configuration and aligning the original admin access spec with the new lifecycle.

**Blocked by:** 03 — Migrate Lifecycle Validation To KVS-Backed Source Config; 04 — Run Access Restoration From KVS-Backed Source Config; 05 — Ship The Configure Admin Page; 06 — Ship The Admin Status Page.

**Status:** ready-for-agent

- [ ] Action configuration helper text no longer tells users to copy Group Keys from the legacy Source Config env var.
- [ ] Admin access documentation describes Source Config as admin-editable app configuration.
- [ ] Admin access documentation describes the Service Credential as the remaining Environment Configuration.
- [ ] Documentation no longer says the app lacks an editable Forge configuration UI.
- [ ] The Service Credential environment-variable decision is cross-linked to the ADR where appropriate.

## 08 — Add Get Started Onboarding

**What to build:** new installs get a lightweight Get Started admin page that points Jira App Administrators to Configure and the Admin status page, without being part of the minimum shippable health loop.

**Blocked by:** 05 — Ship The Configure Admin Page; 06 — Ship The Admin Status Page.

**Status:** ready-for-agent

- [ ] Get Started is exposed as the Forge admin Get Started surface.
- [ ] The page points Jira App Administrators to Configure for Source Config setup.
- [ ] The page points Jira App Administrators to Admin status for current Config Health.
- [ ] The page handles configured, unconfigured, active, and inactive states without exposing the Service Credential.
- [ ] Get Started remains optional follow-up and does not gate the minimum shippable health loop.
