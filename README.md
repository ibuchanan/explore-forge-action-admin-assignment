# Admin access automation

A Forge app
that adds a Jira Automation action for restoring an Atlassian directory user's access
and adding them to a set of pre-configured groups.
Currently, the action only runs from a manual Automation trigger,
and only for an Authorized Initiator listed in the app's environment configuration.
See [`docs/admin-access-automation-spec.md`](docs/admin-access-automation-spec.md)
for the full design
and [`CONTEXT.md`](CONTEXT.md) for the domain glossary used throughout the code and tests.

## Status

This app has the testing, error handling, and observability
expected for production use;
however, the functionality is intentionally "proof of concept".
Join us in [the Atlassian developer community](https://community.developer.atlassian.com/)
if you have questions or feedback.

## Prerequisites

- [Node.js 24][node-download] for local development. The repo includes
  `.nvmrc` and `.node-version`, and `package.json` constrains
  `engines.node` to `>=24 <25`.
- [npm][npm-install] for dependency installation and package scripts.
- [Atlassian Forge CLI][forge-getting-started], authenticated with an
  Atlassian account. The `forge:*` scripts assume `forge` is available on
  `PATH`.
- [secretspec][secretspec], for managing local secrets. The `forge:*` scripts
  assume `secretspec` is available on `PATH`.
- An Atlassian Cloud Organization
  that is the target for admin operations.
- A Jira Cloud site where the Forge app can be registered, deployed, and installed.

[node-download]: https://nodejs.org/en/download
[npm-install]: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
[forge-getting-started]: https://developer.atlassian.com/platform/forge/getting-started/
[secretspec]: https://secretspec.dev/

## Getting Started

Clone the repository:

```sh
git clone https://github.com/ibuchanan/explore-forge-action-admin-assignment.git
```

This repo declares its local secrets in [`secretspec.toml`](secretspec.toml)
and stores real values in a local, gitignored `.env` file through
secretspec's `dotenv` provider — nothing sensitive is ever committed.

Run `secretspec check --provider dotenv` and follow the prompts to fill in:

- `FORGE_ENVIRONMENT`, `FORGE_SITE`, and `FORGE_PRODUCT`.
  Even though the app operates on Org-level APIs,
  the app itself must be installed into a specific Jira site.
- `ADMIN_ASSIGNMENT_API_TOKEN`,
  [an org admin API key](https://support.atlassian.com/organization-administration/docs/manage-an-organization-with-the-admin-apis/).
- `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` (optional),
  a JSON object describing the org, directory, Authorized Initiator emails, and Allowed Groups.
  See below for elaboration on that structure.

Then run:

```sh
npm install                         # Usually only needed once, or if changes are made to npm dependencies
npm run check                       # Runs various checks to make sure the app is in good condition
npm run forge:register              # Only do this once to change the appId in the manifest
npm run forge:variables:set:dotenv  # Repeat whenever there are changes to the .env file
npm run forge:deploy                # Deploy after any code changes
npm run forge:install               # Usually only needed once
```

## Configuration

The app is configured entirely through Forge environment variables
(no in-app configuration UI).
`ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` is a structured JSON object:

```json
{
  "orgId": "organization-id",
  "directoryId": "directory-id",
  "authorizedInitiatorEmails": ["alice@example.com", "bob@example.com"],
  "allowedGroups": [
    {
      "key": "jira-admins",
      "label": "Jira admins",
      "name": "jira-administrators"
    },
    {
      "key": "support-admins",
      "label": "Support admins",
      "name": "support-administrators"
    }
  ],
  "lookup": {
    "targetUserTimeoutMs": 10000,
    "targetUserMaxPages": 5,
    "configResolutionTimeoutMs": 30000,
    "configResolutionMaxPages": 20
  }
}
```

- `orgId` is required. [Find your organization's Cloud ID][find-org-id].
- `directoryId` is required. [List your organization's directories][list-directories]
  to find it — it is not currently shown in the admin.atlassian.com UI.
- `authorizedInitiatorEmails` is a non-empty JSON array of email strings.
- `allowedGroups` is a non-empty JSON array.
- `allowedGroups[*].key` is the stable Runtime Input token for a group.
- `allowedGroups[*].label` is a human-readable label for logs and summaries.
- `allowedGroups[*].name` is the exact Atlassian group name to resolve.
- The app does not enforce a hardcoded maximum number of allowed groups
  but it is not recommended to use more than a dozen.
- Lookup budget fields are optional and have conservative defaults.

[find-org-id]: https://confluence.atlassian.com/cloudkb/retrieve-my-atlassian-cloud-organization-s-id-1207189876.html
[list-directories]: https://developer.atlassian.com/cloud/admin/organization/rest/api-group-directory/

## Using in Automation

The action is supported only behind a Jira Automation manual trigger from a work item.

Required Forge action inputs:

- `initiatorAccountId`: the account ID from `{{initiator.accountId}}`. This value is implicit.
- `targetUserEmail`: the Target User Email entered by the Authorized Initiator at manual trigger time.
- `selectedGroupKeys`: comma-separated Group Keys chosen at manual trigger time.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to propose changes,
including the CLA required for external contributions, and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## License

Apache-2.0: see [`LICENSE`](LICENSE).
