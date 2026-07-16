import Resolver from "@forge/resolver";
import { registerConfigResolvers } from "./config";

const resolver = new Resolver();

registerConfigResolvers(resolver);

export const handler = resolver.getDefinitions();
