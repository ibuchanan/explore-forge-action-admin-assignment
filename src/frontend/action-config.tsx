import { events, invoke, view } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  ErrorMessage,
  Form,
  HelperMessage,
  Inline,
  Label,
  Link,
  Lozenge,
  RequiredAsterisk,
  Stack,
  Text,
  Textfield,
  useForm,
  useProductContext,
} from "@forge/react";
import React, { useEffect, useState } from "react";

interface StatusResponse {
  active: boolean;
}

// The UUID from this app's manifest.yml `app.id`
// (ari:cloud:ecosystem::app/<uuid>) -- a fixed identity, unlike the
// per-environment envId below.
const APP_ID = "7b5d7c1c-387c-40d8-a530-e16614d64b5b";

function ConfigHealthIndicator() {
  const context = useProductContext();
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<StatusResponse>("getStatus").then((result) => {
      setActive((result as StatusResponse).active);
    });
  }, []);

  // Box/xcss background-color overrides don't render inside this action
  // config surface (confirmed empirically: a filled Box + inverse Text
  // rendered as plain unstyled black text). Lozenge's color comes from the
  // platform's built-in appearance system rather than a custom xcss
  // override, so it renders correctly here. Inline keeps it content-width
  // instead of stretching to the Stack's full width.
  //
  // The Configure link below is experimental: this URL pattern
  // (siteUrl/jira/settings/apps/configure/{appId}/{envId}) comes from a
  // Jira issue tracker report, not official docs. router.navigate +
  // LinkButton was the confirmed-working fallback before this; revert to
  // that pairing if this 404s or misroutes.
  const configureUrl = context
    ? `${context.siteUrl}/jira/settings/apps/configure/${APP_ID}/${context.environmentId}`
    : undefined;

  const lozengeAppearance =
    active === null ? "default" : active ? "success" : "removed";
  const lozengeLabel =
    active === null
      ? "Config: Unknown"
      : active
        ? "Config: Active"
        : "Config: Inactive";

  return (
    <Stack space="space.050">
      <Inline>
        <Lozenge appearance={lozengeAppearance}>{lozengeLabel}</Lozenge>
      </Inline>
      {active === false && configureUrl && (
        <Inline space="space.050" alignBlock="center">
          <Text>Admins need to</Text>
          <Link href={configureUrl} openNewTab>
            configure
          </Link>
        </Inline>
      )}
    </Stack>
  );
}

interface TargetField {
  name: string;
  label: string;
  description: string;
}

type FormValues = Record<string, string>;

const selectedGroupKeysDescription =
  "Comma-separated Group Keys from the app's Configure page (Allowed Groups).";

function AutomationInputsForm({
  targetField,
  savedInputs,
  isValidating,
}: {
  targetField: TargetField;
  savedInputs: FormValues;
  isValidating: boolean;
}) {
  const defaultValues: FormValues = {
    initiatorAccountId: "{{initiator.accountId}}",
    [targetField.name]: "",
    selectedGroupKeys: "",
    ...savedInputs,
  };

  const { handleSubmit, register, getValues, formState } = useForm({
    defaultValues,
  });

  const onChange = (input: Partial<FormValues>) => {
    void view.submit({ ...getValues(), ...input });
  };

  const onSubmit = (data: FormValues) => {
    void view.submit(data);
  };

  const initiatorAccountIdField = register("initiatorAccountId", {
    required: { value: true, message: "Initiator account ID is required" },
    disabled: isValidating,
  });
  const targetFieldRegistered = register(targetField.name, {
    required: { value: true, message: `${targetField.label} is required` },
    disabled: isValidating,
  });
  const selectedGroupKeysField = register("selectedGroupKeys", {
    required: { value: true, message: "Selected group keys is required" },
    disabled: isValidating,
  });

  return (
    <Box>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Stack space="space.200">
          <Stack space="space.050">
            <Label labelFor={initiatorAccountIdField.id}>
              Initiator account ID
              <RequiredAsterisk />
            </Label>
            <Textfield
              {...initiatorAccountIdField}
              onChange={(event) => {
                initiatorAccountIdField.onChange(event);
                onChange({ initiatorAccountId: event.target.value });
              }}
            />
            <HelperMessage>
              Use the Jira Automation initiator account ID smart value.
            </HelperMessage>
            {formState.errors.initiatorAccountId?.message && (
              <ErrorMessage>
                {String(formState.errors.initiatorAccountId.message)}
              </ErrorMessage>
            )}
          </Stack>

          <Stack space="space.050">
            <Label labelFor={targetFieldRegistered.id}>
              {targetField.label}
              <RequiredAsterisk />
            </Label>
            <Textfield
              {...targetFieldRegistered}
              onChange={(event) => {
                targetFieldRegistered.onChange(event);
                onChange({ [targetField.name]: event.target.value });
              }}
            />
            <HelperMessage>{targetField.description}</HelperMessage>
            {formState.errors[targetField.name]?.message && (
              <ErrorMessage>
                {String(formState.errors[targetField.name]?.message)}
              </ErrorMessage>
            )}
          </Stack>

          <Stack space="space.050">
            <Label labelFor={selectedGroupKeysField.id}>
              Selected group keys
              <RequiredAsterisk />
            </Label>
            <Textfield
              {...selectedGroupKeysField}
              onChange={(event) => {
                selectedGroupKeysField.onChange(event);
                onChange({ selectedGroupKeys: event.target.value });
              }}
            />
            <HelperMessage>{selectedGroupKeysDescription}</HelperMessage>
            {formState.errors.selectedGroupKeys?.message && (
              <ErrorMessage>
                {String(formState.errors.selectedGroupKeys.message)}
              </ErrorMessage>
            )}
          </Stack>
        </Stack>
      </Form>
    </Box>
  );
}

function AutomationConfig({ targetField }: { targetField: TargetField }) {
  const context = useProductContext();
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const subscription = events.on(
      "AUTOMATION_ACTION_VALIDATE_RULE_EVENT",
      ({ isValidating: validating }: { isValidating: boolean }) => {
        setIsValidating(validating);
      },
    );
    return () => {
      void subscription.then((sub) => sub.unsubscribe());
    };
  }, []);

  if (!context) {
    return <Text>Loading…</Text>;
  }

  const savedInputs = (context.extension?.data?.inputs ?? {}) as FormValues;

  return (
    <Stack space="space.150">
      <ConfigHealthIndicator />
      <AutomationInputsForm
        targetField={targetField}
        savedInputs={savedInputs}
        isValidating={isValidating}
      />
    </Stack>
  );
}

export function renderActionConfig(targetField: TargetField) {
  ForgeReconciler.render(
    <React.StrictMode>
      <AutomationConfig targetField={targetField} />
    </React.StrictMode>,
  );
}
