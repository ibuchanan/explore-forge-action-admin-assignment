import Resolver from "@forge/resolver";
import { registerConfigResolvers } from "./config";
import { registerHealthResolvers } from "./health";

const resolver = new Resolver();

registerConfigResolvers(resolver);
registerHealthResolvers(resolver);

export const handler = resolver.getDefinitions();
