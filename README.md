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
- A Confluence Cloud site where the Forge app can be registered, deployed,
  and installed.

[node-download]: https://nodejs.org/en/download
[npm-install]: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
[forge-getting-started]: https://developer.atlassian.com/platform/forge/getting-started/

## Getting Started

Clone the repository:

```sh
git clone https://github.com/ibuchanan/explore-forge-action-admin-assignment.git
```

Copy `.env.example` to `.env`.
Fill in your `FORGE_ENVIRONMENT`, `FORGE_SITE`, and `FORGE_PRODUCT`.
Even though the app operates on Org-level APIs,
the app itself must be installed into a specific Jira site.
Fill in `ADMIN_ASSIGNMENT_API_TOKEN`
with [an org admin API key](https://support.atlassian.com/organization-administration/docs/manage-an-organization-with-the-admin-apis/).
Fill in `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON`
with a JSON object describing the org, directory, Authorized Initiator emails, and Allowed Groups.
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
Two are required:

- `ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON` — a JSON object describing the org,
  directory, Authorized Initiator emails, and Allowed Groups. See the
  [spec](docs/admin-access-automation-spec.md#environment-configuration) for
  the exact schema.
- `ADMIN_ASSIGNMENT_API_TOKEN` — the Service Credential used to call the
  Organizations REST API. This must be set as an **encrypted** Forge
  variable.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to propose changes,
including the CLA required for external contributions, and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community expectations.

## License

Apache-2.0: see [`LICENSE`](LICENSE).
