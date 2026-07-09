import type { APIResponse } from "@forge/api";

export function mockApiResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: {
      append: () => undefined,
      delete: () => undefined,
      get: (name: string) => headers[name] ?? null,
      has: (name: string) => name in headers,
      set: () => undefined,
      forEach: () => undefined,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
