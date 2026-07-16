import { describe, expect, it } from "vitest";
import {
  getManifestHandlerReferences,
  type ParsedManifest,
} from "./manifest-helpers";

describe("getManifestHandlerReferences - jira:adminPage", () => {
  it("resolves jira:adminPage resolver.function refs through the function module list", () => {
    const manifest: ParsedManifest = {
      modules: {
        "jira:adminPage": [
          { key: "configure-page", resolver: { function: "adminResolver" } },
        ],
        function: [
          { key: "adminResolver", handler: "resolvers/index.handler" },
        ],
      },
    };

    const refs = getManifestHandlerReferences(manifest);

    expect(refs).toContainEqual({
      moduleType: "jira:adminPage",
      key: "configure-page",
      handler: "resolvers/index.handler",
    });
  });

  it("falls back to src/index.ts#<functionKey> when the function module is not declared", () => {
    const manifest: ParsedManifest = {
      modules: {
        "jira:adminPage": [
          { key: "orphan-page", resolver: { function: "missingFn" } },
        ],
      },
    };

    const refs = getManifestHandlerReferences(manifest);

    expect(refs).toContainEqual({
      moduleType: "jira:adminPage",
      key: "orphan-page",
      handler: "src/index.ts#missingFn",
    });
  });

  it("does not add a ref for a jira:adminPage module with no resolver", () => {
    const manifest: ParsedManifest = {
      modules: {
        "jira:adminPage": [{ key: "plain-page" }],
      },
    };

    const refs = getManifestHandlerReferences(manifest);

    expect(refs.find((ref) => ref.key === "plain-page")).toBeUndefined();
  });
});
