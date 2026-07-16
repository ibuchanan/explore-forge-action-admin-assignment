import { invoke } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  SectionMessage,
  Stack,
  Text,
} from "@forge/react";
import React, { useEffect, useState } from "react";

interface StatusResponse {
  state: "configured" | "unconfigured";
  active: boolean;
  messages: string[];
  allowedGroups: Array<{ key: string; label: string }>;
  sourceConfigFingerprint: string;
  validatedAt: string;
}

const App = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    invoke<StatusResponse>("getStatus").then((result) => {
      setStatus(result as StatusResponse);
      setLoading(false);
    });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = (await invoke<StatusResponse>(
      "getStatus",
    )) as StatusResponse;
    setStatus(result);
    setRefreshing(false);
  };

  if (loading || !status) {
    return <Text>Loading…</Text>;
  }

  return (
    <Stack space="space.300">
      <Heading as="h1">Admin Access Automation status</Heading>

      {status.state === "unconfigured" && (
        <SectionMessage
          appearance="warning"
          title="Source Config is not configured"
        >
          <Text>
            Use the Configure page for this app in Manage Apps to set Org ID,
            Directory ID, Authorized Initiator Emails, and Allowed Groups.
          </Text>
        </SectionMessage>
      )}

      {status.state === "configured" && status.active && (
        <SectionMessage appearance="success" title="Config Health: active">
          <Text>Source Config resolved successfully.</Text>
        </SectionMessage>
      )}

      {status.state === "configured" && !status.active && (
        <SectionMessage appearance="error" title="Config Health: inactive">
          <Text>
            Access Restoration will fail closed until this is resolved. Use the
            Configure page for this app in Manage Apps to review and re-save
            Source Config.
          </Text>
          {status.messages.map((message) => (
            <Text key={message}>{message}</Text>
          ))}
        </SectionMessage>
      )}

      {status.allowedGroups.length > 0 && (
        <Box>
          <Text>Resolved Allowed Groups:</Text>
          {status.allowedGroups.map((group) => (
            <Text key={group.key}>
              {group.label} ({group.key})
            </Text>
          ))}
        </Box>
      )}

      <Text>
        Source Config fingerprint: {status.sourceConfigFingerprint || "(none)"}
      </Text>
      <Text>Last validated: {status.validatedAt}</Text>

      <Inline space="space.100">
        <Button
          appearance="primary"
          isDisabled={refreshing}
          onClick={handleRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
