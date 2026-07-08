import { kvs } from "@forge/kvs";
import type { ResolvedConfig } from "../config/resolved-config";

const RESOLVED_CONFIG_KEY = "admin-assignment.resolved-config";

export async function storeResolvedConfig(
  resolvedConfig: ResolvedConfig,
): Promise<void> {
  await kvs.set(RESOLVED_CONFIG_KEY, resolvedConfig);
}

export async function getStoredResolvedConfig(): Promise<
  ResolvedConfig | undefined
> {
  return kvs.get<ResolvedConfig>(RESOLVED_CONFIG_KEY);
}
