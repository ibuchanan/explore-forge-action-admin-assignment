# Admin Config Lifecycle Spec

This document specifies replacing the `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` Forge environment variable with an admin-editable Configure page backed by Forge KVS.

Canonical terms are defined in [CONTEXT.md](../CONTEXT.md). This spec revises the configuration-related terms described in [Terminology Impact](#terminology-impact).

## Status

Draft design, ready for implementation planning.

## Background

A prior customer incident showed that a misconfigured Source Config was not evident from application logs. Two gaps were identified: insufficient logging, and configuration UX. Logging has since been improved (structured start/finish logs for outbound Admin API requests). This spec addresses the second gap.

Today, editing Source Config requires `forge variables set` and a redeploy, with no inline validation feedback — a config mistake is only discovered when Lifecycle Validation next runs, or when an Automation execution fails. This spec makes Source Config admin-editable directly in the Jira UI, with immediate validation feedback on save.

The pattern follows [`docs/examples/explore-forge-config-lifecycle`](examples/explore-forge-config-lifecycle) (a submodule sample app), which demonstrates a Configure admin page, a Get Started checklist, an always-available status dashboard, and KVS-backed lifecycle seeding.

## Goal

A Jira App Administrator can view, edit, and validate Source Config from a Jira admin page, without touching Forge environment variables or redeploying the app. Config Health is visible in the UI, not only in logs.

## Delivery Slices

- Minimum shippable slice:
  - KVS Source Config record and migration
  - shared validation path
  - Configure page with save and reset
  - plain admin status page with refresh
  - lifecycle, single Access Restoration, and Batch Access Restoration switched to KVS-backed Source Config loading
- Get Started can ship after the minimum slice because it is onboarding, not the durable Config Health surface that closes the original incident gap.

## Non-Goals

- This spec does not change the Access Restoration or Batch Access Restoration business operation, Runtime Input contract, Lookup Budget semantics, Cloud Admin write order, idempotency behavior, or audit logging contract. It does change how Source Config and Config Health are loaded and refreshed before those operations run.
- This spec does not move `ADMIN_ASSIGNMENT_API_TOKEN` out of Forge environment variables. The Service Credential remains a plain encrypted Forge env var to minimize its exposure surface — it is not surfaced through any resolver or UI round-trip.
- This spec does not add durable audit history for config edits.
- This spec does not add a public API for editing Source Config outside the Jira admin UI.
- This spec does not add an app-specific allowlist for Jira App Administrators. Access to the Forge `jira:adminPage` Configure and status surfaces is the admin authorization boundary.

## Admin Authorization

- **Jira App Administrator** is distinct from **Authorized Initiator**. A Jira App Administrator can configure Authorized Initiator Emails, but does not become an Authorized Initiator unless their account is also included in Source Config and resolved into Resolved Config.
- The Configure, Get Started, and admin status pages rely on Jira/Forge admin-page access rather than an app-owned admin allowlist.
- The app still enforces Authorized Initiator checks during Access Restoration. Admin-page access does not authorize Interactive Initiation by itself.

## Admin UI Resolver Contract

- The Configure page's `getConfig` resolver returns the full saved non-secret Source Config so a Jira App Administrator can edit the current configuration in place: `orgId`, `directoryId`, `authorizedInitiatorEmails`, `allowedGroups`, and `lookup`.
- Admin UI resolvers never return the Service Credential.
- The admin status page uses a narrower health payload: active/inactive Config Health, sanitized messages, resolved Allowed Group labels, Source Config fingerprint, and `validatedAt`.
- The admin status page does not return the full Source Config. Its job is health scanning and navigation to Configure, not editing.

## Configure UI Shape

- The Configure page presents structured fields rather than a raw JSON textarea:
  - `orgId`
  - `directoryId`
  - repeatable Authorized Initiator Email rows
  - repeatable Allowed Group rows, each a single directory group `name` (Group Key and label are derived from `name`, not admin-typed)
  - numeric Lookup Budget fields
- The resolver assembles the same `SourceConfig` object from structured form payloads and uses a shared `validateSourceConfig(candidate: unknown)` helper as the backend schema gate.
- A raw JSON preview/import affordance can be added later, but raw JSON is not the primary editing surface.
- The Configure page includes a deliberate Reset/Clear Source Config action. It asks for confirmation, writes `{ state: "unconfigured" }`, stores inactive Config Health with a clear non-secret message such as "Source Config is not configured", and leaves `ADMIN_ASSIGNMENT_API_TOKEN` unchanged.

## Manifest Changes

Add three `jira:adminPage` modules to `manifest.yml`, alongside the existing `automation:actionProvider`, `action`, `consumer`, and lifecycle `trigger` modules (unchanged):

- **Configure** (`useAsConfig: true`) — form for `orgId`, `directoryId`, `authorizedInitiatorEmails`, `allowedGroups`, and `lookup` budget overrides. Saving validates the structured payload through `validateSourceConfig`.
- **Admin status page** (plain `jira:adminPage`, no `useAs*`) — status dashboard showing current `ConfigHealth` (active/inactive plus messages) and resolved Allowed Group labels, with a button to jump to Configure. This is the surface that directly closes the original gap: config problems become visible without reading logs.
- **Get Started** (`useAsGetStarted: true`) — first-run checklist pointing new installs at Configure. Follow-up after the minimum shippable slice.

## Storage Changes

- New KVS key, e.g. `admin-assignment.source-config`, holds a Source Config record and is the only runtime source of truth once present:

  ```ts
  type SourceConfigRecord =
    | { state: "unconfigured" }
    | { state: "configured"; sourceConfig: SourceConfig };
  ```

- The Configure page's `saveConfig` resolver builds a Source Config object from form input and reuses `src/config/source-config.ts` validation. Add a shared `validateSourceConfig(candidate: unknown)` helper; keep `parseSourceConfig(rawJson)` for legacy env-var migration by having it parse JSON and delegate to `validateSourceConfig`.
- Do not export the raw Zod `sourceConfigSchema` as the resolver contract. Keep Zod as an implementation detail.
- `saveConfig` rejects malformed form/schema input without writing Source Config.
- `saveConfig` persists schema-valid Source Config even when resolution fails, then immediately re-runs the existing `resolveConfig`/`storeResolvedConfig` logic. The saved Source Config represents the Jira App Administrator's current intended configuration; Config Health represents whether that saved configuration is runnable.
- If `ADMIN_ASSIGNMENT_API_TOKEN` is missing when schema-valid Source Config is saved, `saveConfig` still persists the configured Source Config record and stores inactive Config Health with a sanitized message such as `ADMIN_ASSIGNMENT_API_TOKEN is not set`.
- The save response distinguishes "saved and active" from "saved but inactive" so the admin gets pass/fail feedback at save time instead of discovering a problem later via a failed Automation run or the next Lifecycle Validation.
- A newly saved Source Config replaces the previous stored Resolved Config result immediately. If the new Source Config resolves to inactive Config Health, store that inactive result tied to the new Source Config fingerprint; do not keep using the last active Resolved Config as a fallback.
- Inactive Resolved Config may retain partial successful resolution results for admin diagnostics, matching the current `resolveConfig()` behavior. Runtime execution must treat any inactive Config Health as unusable regardless of partial identifiers.
- Reset/Clear Source Config replaces the Source Config record with `{ state: "unconfigured" }`, replaces stored Config Health with inactive state, and causes single and Batch Access Restoration to fail closed before Cloud Admin writes.
- Config Health stores `validatedAt` as current-state metadata. It updates on Lifecycle Validation, `saveConfig`, Reset/Clear Source Config, and inline refresh during action execution.

## Source Config Loading

- Add a shared Source Config store/load boundary, e.g. `src/config/source-config-store.ts`, so lifecycle validation, single Access Restoration, Batch Access Restoration, and admin resolvers all load the Source Config record from KVS.
- `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` is legacy migration input only. Runtime execution must not fall back to it once KVS contains either a configured Source Config record or an explicit unconfigured record.
- Inline Resolved Config refresh during action execution still uses the current Source Config fingerprint, but that fingerprint is computed from the KVS-backed Source Config.
- Runtime execution uses only Resolved Config that matches the current KVS-backed Source Config fingerprint. If the matching Resolved Config is inactive, execution fails closed before Cloud Admin writes.

## Validation Path

- Use one shared validation path for Lifecycle Validation, `saveConfig`, admin status refresh, and inline refresh during action execution.
- For a configured Source Config record, validation checks Service Credential presence, runs Source Config resolution within the config-resolution Lookup Budget, stores active or inactive Config Health with `validatedAt`, and returns the result.
- For an unconfigured Source Config record, validation stores inactive Config Health with `validatedAt` and does not call Atlassian Administration APIs.
- The admin status resolver loads the Source Config record and stored Resolved Config. If Config Health is missing or the Source Config fingerprint is stale, it runs the shared validation path before returning status.
- If admin status validation fails, the resolver stores inactive Config Health and returns sanitized messages rather than requiring a Jira App Administrator to inspect logs.
- Inline refresh during single and Batch Access Restoration remains in place as runtime protection against stale, missing, or drifted Resolved Config. It uses the same shared validation path and fails closed before Cloud Admin writes if validation cannot produce active Config Health.

## Lifecycle Changes

- `src/lifecycle.ts` reads Source Config from `kvs.get("admin-assignment.source-config")` instead of `process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON`.
- On any Lifecycle Validation event, if KVS has no Source Config record yet and `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` contains schema-valid Source Config, seed KVS with `{ state: "configured", sourceConfig }` before resolving Config Health.
- If KVS has no Source Config record and the legacy env var is absent or malformed, store `{ state: "unconfigured" }` and an inactive `ConfigHealth` sentinel (same shape as today's "not set" path) rather than treating it as an error. This mirrors the idempotent seed-on-install handler in the example app.
- Once KVS contains any Source Config record, Lifecycle Validation ignores `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON`. A configured record is validated and resolved; an unconfigured record stores inactive Config Health.

## Migration

When KVS has no Source Config record but `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` is still set, read the env var once and seed KVS with its parsed value. This rule is intentionally event-agnostic: it applies to install, upgrade, reinstall/dev flows, and any other Lifecycle Validation event. Treat the env var as legacy and ignore it for all runtime loads once KVS holds either a configured or unconfigured Source Config record. Without this step, every existing installed site would need to re-enter its full Source Config by hand in the new Configure page.

## Other Touch Points

- `src/frontend/action-config.tsx`: the "Comma-separated Group Keys from `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON`" helper text must be reworded, since the env var name goes away as the source of truth.
- `src/actions/admin-assignment.ts` and `src/actions/admin-assignment-batch.ts` currently read `process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` during execution. They should use the shared KVS-backed Source Config loader.
- Add focused tests for the Source Config store boundary: missing KVS record, configured record, explicit unconfigured record, legacy env-var seed only when no record exists, malformed legacy env var producing unconfigured/inactive state, and reset/clear preventing reseed.
- `test/lifecycle.test.ts`, `test/actions/admin-assignment.test.ts`, `test/actions/admin-assignment-batch.test.ts` currently set `process.env.ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` directly. These should seed the existing `vi.mock("@forge/kvs", ...)` mocks instead.
- `docs/admin-access-automation-spec.md`: update the Environment Configuration section, and drop or rewrite the non-goal "The app does not provide an editable Forge configuration UI."

## Terminology Impact

`CONTEXT.md` has been revised so **Source Config** is no longer environment-sourced, **Environment Configuration** now refers only to deployment-managed settings such as the Service Credential, and **Jira App Administrator** is distinct from **Authorized Initiator**.

## Open Questions

None outstanding. The decision to keep `ADMIN_ASSIGNMENT_API_TOKEN` in Forge environment variables is recorded in [ADR 0002](adr/0002-keep-service-credential-in-forge-environment.md).
