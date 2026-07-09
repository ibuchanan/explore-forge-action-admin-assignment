/**
 * Forge Architecture Tests
 *
 * - Transitive dependency rules: Frontend shouldn't import modules that depend on @forge/api
 * - Circular dependency prevention
 *
 * These are cross-file checks that can't be expressed as single-file
 * ast-grep rules. Storage-boundary checks (@forge/api, @forge/kvs in
 * frontend) are covered by the strict/imports rules in
 * tool-forge-prelint-ast-grep instead.
 */

import { join } from "node:path";
import { type ProjectFiles, projectFiles } from "archunit";
import { beforeAll, describe, expect, it } from "vitest";
import { findLocalImports, parseSourceFile } from "./ast-helpers";
import { directoryExists } from "./filesystem-helpers";

describe("Forge Architecture", () => {
  // Cache projectFiles() result to speed up tests
  // This scans the filesystem once instead of per-test
  let cachedProjectFiles: ProjectFiles;

  beforeAll(() => {
    cachedProjectFiles = projectFiles();
  });

  describe("transitive dependencies on @forge libraries", () => {
    it.skipIf(!directoryExists(join("src", "frontend")))(
      "frontend should not import any local modules that use @forge/api",
      async () => {
        // General rule: Frontend files shouldn't import from any module that
        // depends on @forge/api (backend-only package). This prevents frontend
        // from accidentally importing server-side code that won't be available in the browser.
        const rule = cachedProjectFiles
          .inFolder("src/frontend/**")
          .should()
          .adhereTo((file) => {
            const importedModules = findLocalImports(
              parseSourceFile(file.path),
            );

            // Frontend should only import from itself or shared UI utilities
            // Any import that goes up to parent directories could import backend code
            for (const importedModule of importedModules) {
              if (importedModule.startsWith("../")) {
                // Allow imports from src/util/** (shared utilities)
                if (importedModule.startsWith("../util/")) {
                  continue;
                }
                // Importing from parent directory - potential backend code
                return false;
              }
            }

            return true;
          }, "Frontend should not import from modules outside src/frontend/** (may depend on @forge/api)");

        await expect(rule).toPassAsync();
      },
    );
  });

  describe("structural rules", () => {
    it("source code should be cycle free", async () => {
      // General rule: No circular dependencies in source code
      const rule = cachedProjectFiles
        .inFolder("src/**")
        .should()
        .haveNoCycles();

      await expect(rule).toPassAsync();
    });
  });
});
