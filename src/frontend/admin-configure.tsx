import { invoke } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  Button,
  Form,
  FormFooter,
  FormSection,
  HelperMessage,
  Inline,
  Label,
  Link,
  RequiredAsterisk,
  SectionMessage,
  Stack,
  Text,
  Textfield,
} from "@forge/react";
import React, { useEffect, useState } from "react";

interface AllowedGroup {
  name: string;
}

interface EmailRow {
  id: number;
  value: string;
}

interface GroupRow extends AllowedGroup {
  id: number;
}

type GetConfigResponse =
  | { state: "unconfigured" }
  | {
      state: "configured";
      sourceConfig: {
        orgId: string;
        directoryId: string;
        authorizedInitiatorEmails: string[];
        allowedGroups: AllowedGroup[];
        lookup: {
          targetUserTimeoutMs: number;
          targetUserMaxPages: number;
          configResolutionTimeoutMs: number;
          configResolutionMaxPages: number;
        };
      };
    };

interface SaveConfigResponse {
  success: boolean;
  active?: boolean;
  messages?: string[];
  detail?: string;
  errors?: Array<{ field: string; message: string }>;
}

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value.trim());
  return Number.isNaN(parsed) ? undefined : parsed;
}

let nextRowId = 0;
function makeRowId(): number {
  nextRowId += 1;
  return nextRowId;
}

const App = () => {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [directoryId, setDirectoryId] = useState("");
  const [emailRows, setEmailRows] = useState<EmailRow[]>([
    { id: makeRowId(), value: "" },
  ]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([
    { id: makeRowId(), name: "" },
  ]);
  const [targetUserTimeoutMs, setTargetUserTimeoutMs] = useState("");
  const [targetUserMaxPages, setTargetUserMaxPages] = useState("");
  const [configResolutionTimeoutMs, setConfigResolutionTimeoutMs] =
    useState("");
  const [configResolutionMaxPages, setConfigResolutionMaxPages] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveConfigResponse | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean } | null>(
    null,
  );

  useEffect(() => {
    invoke<GetConfigResponse>("getConfig").then((rawResponse) => {
      const response = rawResponse as GetConfigResponse;
      if (response.state === "configured") {
        const { sourceConfig } = response;
        setOrgId(sourceConfig.orgId);
        setDirectoryId(sourceConfig.directoryId);
        const emails =
          sourceConfig.authorizedInitiatorEmails.length > 0
            ? sourceConfig.authorizedInitiatorEmails
            : [""];
        setEmailRows(emails.map((value) => ({ id: makeRowId(), value })));
        const groups =
          sourceConfig.allowedGroups.length > 0
            ? sourceConfig.allowedGroups
            : [{ name: "" }];
        setGroupRows(groups.map((group) => ({ id: makeRowId(), ...group })));
        setTargetUserTimeoutMs(String(sourceConfig.lookup.targetUserTimeoutMs));
        setTargetUserMaxPages(String(sourceConfig.lookup.targetUserMaxPages));
        setConfigResolutionTimeoutMs(
          String(sourceConfig.lookup.configResolutionTimeoutMs),
        );
        setConfigResolutionMaxPages(
          String(sourceConfig.lookup.configResolutionMaxPages),
        );
      }
      setLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    setBusy(true);
    setSaveResult(null);
    setResetResult(null);

    const payload = {
      orgId: orgId.trim(),
      directoryId: directoryId.trim(),
      authorizedInitiatorEmails: emailRows
        .map((row) => row.value.trim())
        .filter((email) => email.length > 0),
      allowedGroups: groupRows
        .map((row) => ({ name: row.name.trim() }))
        .filter((group) => group.name.length > 0),
      lookup: {
        targetUserTimeoutMs: toNumberOrUndefined(targetUserTimeoutMs),
        targetUserMaxPages: toNumberOrUndefined(targetUserMaxPages),
        configResolutionTimeoutMs: toNumberOrUndefined(
          configResolutionTimeoutMs,
        ),
        configResolutionMaxPages: toNumberOrUndefined(configResolutionMaxPages),
      },
    };

    const result = (await invoke<SaveConfigResponse>(
      "saveConfig",
      payload,
    )) as SaveConfigResponse;
    setSaveResult(result);
    setBusy(false);
  };

  const handleResetConfirmed = async () => {
    setBusy(true);
    setSaveResult(null);
    setConfirmingReset(false);
    const result = (await invoke<{ success: boolean }>("resetConfig")) as {
      success: boolean;
    };
    if (result.success) {
      setOrgId("");
      setDirectoryId("");
      setEmailRows([{ id: makeRowId(), value: "" }]);
      setGroupRows([{ id: makeRowId(), name: "" }]);
      setTargetUserTimeoutMs("");
      setTargetUserMaxPages("");
      setConfigResolutionTimeoutMs("");
      setConfigResolutionMaxPages("");
    }
    setResetResult(result);
    setBusy(false);
  };

  if (loading) {
    return <Text>Loading…</Text>;
  }

  return (
    <Stack space="space.300">
      <Text>
        Source Config controls who can run Access Restoration (Authorized
        Initiator Emails) and which Jira directory groups they can grant
        (Allowed Groups).
      </Text>

      {saveResult?.success && saveResult.active && (
        <SectionMessage appearance="success" title="Saved and active">
          Source Config was saved and resolved successfully.
        </SectionMessage>
      )}
      {saveResult?.success && !saveResult.active && (
        <SectionMessage appearance="warning" title="Saved but inactive">
          Source Config was saved, but it did not resolve cleanly:
          {(saveResult.messages ?? []).map((message) => (
            <Text key={message}>{message}</Text>
          ))}
        </SectionMessage>
      )}
      {saveResult && !saveResult.success && (
        <SectionMessage appearance="error" title="Save failed">
          <Text>
            {saveResult.detail ?? "Source Config failed schema validation."}
          </Text>
          {(saveResult.errors ?? []).map((error) => (
            <Text key={error.field}>
              {error.field}: {error.message}
            </Text>
          ))}
        </SectionMessage>
      )}
      {resetResult?.success && (
        <SectionMessage appearance="information" title="Reset">
          Source Config has been cleared. The app is now unconfigured.
        </SectionMessage>
      )}

      <Form onSubmit={handleSubmit}>
        <FormSection>
          <Label labelFor="org-id">
            Org ID
            <RequiredAsterisk />
          </Label>
          <Textfield
            id="org-id"
            value={orgId}
            isDisabled={busy}
            onChange={(event) => {
              setOrgId(event.target.value);
            }}
          />
          <HelperMessage>
            <Link
              href="https://confluence.atlassian.com/cloudkb/retrieve-my-atlassian-cloud-organization-s-id-1207189876.html"
              openNewTab
            >
              Where do I find my Org ID?
            </Link>
          </HelperMessage>

          <Label labelFor="directory-id">
            Directory ID
            <RequiredAsterisk />
          </Label>
          <Textfield
            id="directory-id"
            value={directoryId}
            isDisabled={busy}
            onChange={(event) => {
              setDirectoryId(event.target.value);
            }}
          />
          <HelperMessage>
            <Link
              href="https://developer.atlassian.com/cloud/admin/organization/rest/api-group-directory/"
              openNewTab
            >
              Where do I find my Directory ID?
            </Link>
          </HelperMessage>

          <Label labelFor="initiator-emails">Authorized Initiator Emails</Label>
          <Stack space="space.100">
            {emailRows.map((row) => (
              <Inline key={row.id} space="space.100" alignBlock="center">
                <Textfield
                  value={row.value}
                  isDisabled={busy}
                  placeholder="person@example.com"
                  onChange={(event) => {
                    const value = event.target.value;
                    setEmailRows((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, value } : r)),
                    );
                  }}
                />
                <Button
                  appearance="subtle"
                  isDisabled={busy}
                  onClick={() => {
                    setEmailRows((rows) => rows.filter((r) => r.id !== row.id));
                  }}
                >
                  Remove
                </Button>
              </Inline>
            ))}
            <Box>
              <Button
                appearance="default"
                isDisabled={busy}
                onClick={() => {
                  setEmailRows((rows) => [
                    ...rows,
                    { id: makeRowId(), value: "" },
                  ]);
                }}
              >
                Add Authorized Initiator Email
              </Button>
            </Box>
          </Stack>
          <HelperMessage>
            Human users allowed to run Access Restoration from Jira Automation.
          </HelperMessage>

          <Label labelFor="allowed-groups">Allowed Groups</Label>
          <Stack space="space.100">
            {groupRows.map((row) => (
              <Inline key={row.id} space="space.100" alignBlock="center">
                <Textfield
                  value={row.name}
                  isDisabled={busy}
                  placeholder="Directory group name"
                  onChange={(event) => {
                    const value = event.target.value;
                    setGroupRows((rows) =>
                      rows.map((r) =>
                        r.id === row.id ? { ...r, name: value } : r,
                      ),
                    );
                  }}
                />
                <Button
                  appearance="subtle"
                  isDisabled={busy}
                  onClick={() => {
                    setGroupRows((rows) => rows.filter((r) => r.id !== row.id));
                  }}
                >
                  Remove
                </Button>
              </Inline>
            ))}
            <Box>
              <Button
                appearance="default"
                isDisabled={busy}
                onClick={() => {
                  setGroupRows((rows) => [
                    ...rows,
                    { id: makeRowId(), name: "" },
                  ]);
                }}
              >
                Add Allowed Group
              </Button>
            </Box>
          </Stack>
          <HelperMessage>
            The exact Atlassian directory group name. Authorized Initiators may
            grant this group during Access Restoration.
          </HelperMessage>

          <Label labelFor="target-user-timeout-ms">
            Lookup Budget (optional — defaults apply when left blank)
          </Label>
          <Inline space="space.100">
            <Textfield
              id="target-user-timeout-ms"
              value={targetUserTimeoutMs}
              isDisabled={busy}
              placeholder="Target User Timeout (ms)"
              onChange={(event) => {
                setTargetUserTimeoutMs(event.target.value);
              }}
            />
            <Textfield
              value={targetUserMaxPages}
              isDisabled={busy}
              placeholder="Target User Max Pages"
              onChange={(event) => {
                setTargetUserMaxPages(event.target.value);
              }}
            />
            <Textfield
              value={configResolutionTimeoutMs}
              isDisabled={busy}
              placeholder="Config Resolution Timeout (ms)"
              onChange={(event) => {
                setConfigResolutionTimeoutMs(event.target.value);
              }}
            />
            <Textfield
              value={configResolutionMaxPages}
              isDisabled={busy}
              placeholder="Config Resolution Max Pages"
              onChange={(event) => {
                setConfigResolutionMaxPages(event.target.value);
              }}
            />
          </Inline>
        </FormSection>
        <FormFooter>
          <Inline space="space.100">
            <Button type="submit" appearance="primary" isDisabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {!confirmingReset && (
              <Button
                appearance="danger"
                isDisabled={busy}
                onClick={() => setConfirmingReset(true)}
              >
                Reset / Clear Source Config
              </Button>
            )}
          </Inline>
        </FormFooter>
      </Form>

      {confirmingReset && (
        <SectionMessage appearance="warning" title="Confirm reset">
          <Text>
            This clears Source Config and marks the app unconfigured. Access
            Restoration will fail closed until Source Config is saved again.
          </Text>
          <Inline space="space.100">
            <Button
              appearance="danger"
              isDisabled={busy}
              onClick={handleResetConfirmed}
            >
              Confirm Reset
            </Button>
            <Button
              appearance="subtle"
              isDisabled={busy}
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </Button>
          </Inline>
        </SectionMessage>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
