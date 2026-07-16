import Resolver from "@forge/resolver";
import { registerHealthResolvers } from "./health";

// Separate composition root from ./index.ts: action config forms are reachable
// by anyone who can edit an Automation rule, not just a Jira admin. Wiring
// this resolver (read-only getStatus) rather than the admin one keeps
// saveConfig/resetConfig invokable only from the admin-gated jira:adminPage
// modules.
const resolver = new Resolver();

registerHealthResolvers(resolver);

export const handler = resolver.getDefinitions();
