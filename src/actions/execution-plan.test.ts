import { describe, expect, it } from "vitest";
import type { DirectoryUser } from "../admin-api/users";
import type { ResolvedConfig } from "../config/resolved-config";
import {
  parseSelectedGroupKeys,
  planAccessRestoration,
  resolveSelectedGroups,
} from "./execution-plan";

const jiraAdmins = {
  key: "jira-admins",
  label: "Jira admins",
  name: "jira-administrators",
  directoryGroupId: "group-1",
  modifiable: true,
};

const supportAdmins = {
  key: "support-admins",
  label: "Support admins",
  name: "support-administrators",
  directoryGroupId: "group-2",
  modifiable: true,
};

const resolvedConfig: ResolvedConfig = {
  sourceConfigFingerprint: "fingerprint-1",
  authorizedInitiatorAccountIds: ["initiator-1"],
  allowedGroups: [jiraAdmins, supportAdmins],
  configHealth: { active: true, messages: [] },
};

describe("parseSelectedGroupKeys", () => {
  it("splits a comma-separated Runtime Input into trimmed Group Keys", () => {
    expect(parseSelectedGroupKeys(" jira-admins, support-admins ")).toEqual([
      "jira-admins",
      "support-admins",
    ]);
  });

  it("returns an empty array for missing or blank input", () => {
    expect(parseSelectedGroupKeys(undefined)).toEqual([]);
    expect(parseSelectedGroupKeys("")).toEqual([]);
    expect(parseSelectedGroupKeys("  ")).toEqual([]);
  });

  it("drops empty entries from stray commas", () => {
    expect(parseSelectedGroupKeys("jira-admins,,support-admins,")).toEqual([
      "jira-admins",
      "support-admins",
    ]);
  });
});

describe("resolveSelectedGroups", () => {
  it("maps each Selected Group Key to its Resolved Allowed Group", () => {
    const result = resolveSelectedGroups(["jira-admins"], resolvedConfig);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([jiraAdmins]);
  });

  it("fails closed when selectedGroupKeys is empty", () => {
    const result = resolveSelectedGroups([], resolvedConfig);

    expect(result.isErr()).toBe(true);
  });

  it("fails closed when a Group Key is not a configured Allowed Group", () => {
    const result = resolveSelectedGroups(["unknown-key"], resolvedConfig);

    expect(result.isErr()).toBe(true);
  });
});

describe("planAccessRestoration", () => {
  function targetUser(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
    return {
      accountId: "target-1",
      email: "target@example.com",
      active: false,
      groupIds: [],
      ...overrides,
    };
  }

  it("plans a restore and every Selected Group as an addition when nothing is already satisfied", () => {
    const result = planAccessRestoration(targetUser(), [
      jiraAdmins,
      supportAdmins,
    ]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      needsRestore: true,
      groupsToAdd: [jiraAdmins, supportAdmins],
      groupsAlreadyMember: [],
    });
  });

  it("skips restoring access when the Target User is already active", () => {
    const result = planAccessRestoration(targetUser({ active: true }), [
      jiraAdmins,
    ]);

    expect(result._unsafeUnwrap().needsRestore).toBe(false);
  });

  it("treats groups the Target User already belongs to as already satisfied", () => {
    const result = planAccessRestoration(
      targetUser({ groupIds: [jiraAdmins.directoryGroupId] }),
      [jiraAdmins, supportAdmins],
    );

    expect(result._unsafeUnwrap()).toEqual({
      needsRestore: true,
      groupsToAdd: [supportAdmins],
      groupsAlreadyMember: [jiraAdmins],
    });
  });

  it("fails closed before restoring access when a Selected Group cannot accept direct membership changes", () => {
    const result = planAccessRestoration(targetUser(), [
      { ...jiraAdmins, modifiable: false },
    ]);

    expect(result.isErr()).toBe(true);
  });
});
