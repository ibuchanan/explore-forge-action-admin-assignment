import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOKUP_BUDGET,
  parseSourceConfig,
  validateSourceConfig,
} from "../../src/config/source-config";

describe("parseSourceConfig", () => {
  it("parses a valid minimal Source Config and applies default Lookup Budget values", () => {
    const raw = JSON.stringify({
      orgId: "org-1",
      directoryId: "dir-1",
      authorizedInitiatorEmails: ["alice@example.com"],
      allowedGroups: [{ name: "jira-administrators" }],
    });

    const result = parseSourceConfig(raw);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      orgId: "org-1",
      directoryId: "dir-1",
      authorizedInitiatorEmails: ["alice@example.com"],
      allowedGroups: [{ name: "jira-administrators" }],
      lookup: DEFAULT_LOOKUP_BUDGET,
    });
  });

  it("fails closed with a ValidationProblemDetails when orgId is missing", () => {
    const raw = JSON.stringify({
      directoryId: "dir-1",
      authorizedInitiatorEmails: ["alice@example.com"],
      allowedGroups: [{ name: "jira-administrators" }],
    });

    const result = parseSourceConfig(raw);

    expect(result.isErr()).toBe(true);
    const problem = result._unsafeUnwrapErr();
    expect(problem.status).toBe(400);
    expect(problem.errors.some((error) => error.field === "orgId")).toBe(true);
  });

  it("fails closed with a ValidationProblemDetails when the raw value is not valid JSON", () => {
    const result = parseSourceConfig("not json");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().status).toBe(400);
  });

  it("fails closed when authorizedInitiatorEmails or allowedGroups are empty", () => {
    const raw = JSON.stringify({
      orgId: "org-1",
      directoryId: "dir-1",
      authorizedInitiatorEmails: [],
      allowedGroups: [],
    });

    const result = parseSourceConfig(raw);

    expect(result.isErr()).toBe(true);
    const fields = result._unsafeUnwrapErr().errors.map((error) => error.field);
    expect(fields).toContain("authorizedInitiatorEmails");
    expect(fields).toContain("allowedGroups");
  });
});

describe("validateSourceConfig", () => {
  it("validates a structured candidate and applies default Lookup Budget values", () => {
    const candidate = {
      orgId: "org-1",
      directoryId: "dir-1",
      authorizedInitiatorEmails: ["alice@example.com"],
      allowedGroups: [{ name: "jira-administrators" }],
    };

    const result = validateSourceConfig(candidate);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      ...candidate,
      lookup: DEFAULT_LOOKUP_BUDGET,
    });
  });

  it("fails closed with a ValidationProblemDetails for a malformed candidate", () => {
    const result = validateSourceConfig({ directoryId: "dir-1" });

    expect(result.isErr()).toBe(true);
    const problem = result._unsafeUnwrapErr();
    expect(problem.status).toBe(400);
    expect(problem.errors.some((error) => error.field === "orgId")).toBe(true);
  });

  it("fails closed for a non-object candidate", () => {
    const result = validateSourceConfig("not an object");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().status).toBe(400);
  });
});
