import { invoke, router } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  Button,
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
  allowedGroups: Array<{ name: string }>;
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
      {status.state === "unconfigured" && (
        <SectionMessage
          appearance="warning"
          title="Source Config is not configured"
        >
          <Text>
            Use the Configure button below to set Org ID, Directory ID,
            Authorized Initiator Emails, and Allowed Groups.
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
            Configure button below to review and re-save Source Config.
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
            <Text key={group.name}>{group.name}</Text>
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
          onClick={() => {
            // @see https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/router/#example-7
            void router.navigate({
              target: "module",
              moduleKey: "admin-assignment-configure-page",
            });
          }}
        >
          Configure
        </Button>
        <Button
          appearance="subtle"
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
