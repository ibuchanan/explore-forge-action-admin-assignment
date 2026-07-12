/**
 * Dagger automation for the Forge admin assignment action.
 */
import {
  type Container,
  check,
  type Directory,
  dag,
  func,
  object,
  type Workspace,
} from "@dagger.io/dagger";

@object()
export class ExploreForgeActionAdminAssignment {
  private readonly source: Directory;
  private readonly nodeVersion: string;

  constructor(ws: Workspace, nodeVersion = "24") {
    this.source = ws.directory("/", {
      exclude: [
        ".AppleDouble",
        ".DS_Store",
        ".cocoindex_code",
        ".dagger",
        ".env",
        ".env.*",
        ".git",
        ".history",
        ".npm",
        ".turbo",
        ".vscode",
        "*.tgz",
        "*.vsix",
        "*~",
        "dist",
        "node_modules",
        "package-lock.json",
      ],
    });
    this.nodeVersion = nodeVersion;
  }

  /**
   * Return a prepared Node container with dependencies installed from public package metadata.
   */
  @func()
  deps(): Container {
    return dag
      .container()
      .from(`node:${this.nodeVersion}-bookworm-slim`)
      .withExec(["apt-get", "update"])
      .withExec([
        "apt-get",
        "install",
        "-y",
        "--no-install-recommends",
        "ca-certificates",
        "git",
        "openssh-client",
      ])
      .withDirectory("/app", this.source)
      .withWorkdir("/app")
      .withEnvVariable("NPM_CONFIG_REGISTRY", "https://registry.npmjs.org/")
      .withMountedCache(
        "/root/.npm",
        dag.cacheVolume("explore-forge-action-admin-assignment-npm-cache"),
      )
      .withExec([
        "npm",
        "install",
        "--no-package-lock",
        "--no-audit",
        "--no-fund",
      ]);
  }

  /**
   * Run the repository formatter in check mode.
   */
  @func()
  @check()
  async formatCheck(): Promise<void> {
    await this.runScript("format:check").sync();
  }

  /**
   * Run the TypeScript typecheck.
   */
  @func()
  @check()
  async typecheck(): Promise<void> {
    await this.runScript("typecheck").sync();
  }

  /**
   * Run the Forge pre-lint ast-grep rules.
   */
  @func()
  @check()
  async lintPrelint(): Promise<void> {
    await this.runScript("lint:prelint").sync();
  }

  /**
   * Run the Biome lint check.
   */
  @func()
  @check()
  async lintCheck(): Promise<void> {
    await this.runScript("lint:check").sync();
  }

  /**
   * Run the unit test suite.
   */
  @func()
  @check()
  async test(): Promise<void> {
    await this.runScript("test").sync();
  }

  /**
   * Build the package.
   */
  @func()
  @check()
  async build(): Promise<void> {
    await this.runScript("build").sync();
  }

  /**
   * Build the package and check the backend bundle size.
   */
  @func()
  @check()
  async size(): Promise<void> {
    await this.runScript("size").sync();
  }

  /**
   * Run the container-friendly CI checks.
   */
  @func()
  async ci(): Promise<void> {
    await Promise.all([
      this.formatCheck(),
      this.typecheck(),
      this.lintPrelint(),
      this.lintCheck(),
      this.test(),
      this.build(),
      this.size(),
    ]);
  }

  private runScript(script: string): Container {
    return this.deps().withExec(["npm", "run", script]);
  }
}
