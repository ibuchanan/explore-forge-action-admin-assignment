import Resolver, { type Request } from "@forge/resolver";

const resolver = new Resolver();

resolver.define("getText", (req: Request) => {
  console.log(req);
  return "Hello, world!";
});

export const handler = resolver.getDefinitions();
