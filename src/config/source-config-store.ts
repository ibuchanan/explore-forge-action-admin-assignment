import { kvs } from "@forge/kvs";
import type { SourceConfig } from "./source-config";

const SOURCE_CONFIG_KEY = "admin-assignment.source-config";

export type SourceConfigRecord =
  | { state: "unconfigured" }
  | { state: "configured"; sourceConfig: SourceConfig };

export async function storeSourceConfigRecord(
  record: SourceConfigRecord,
): Promise<void> {
  await kvs.set(SOURCE_CONFIG_KEY, record);
}

export async function getSourceConfigRecord(): Promise<
  SourceConfigRecord | undefined
> {
  return kvs.get<SourceConfigRecord>(SOURCE_CONFIG_KEY);
}
