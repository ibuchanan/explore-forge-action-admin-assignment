import { events, invoke, router, view } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  ErrorMessage,
  Form,
  HelperMessage,
  Inline,
  Label,
  LinkButton,
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

function ConfigHealthIndicator() {
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<StatusResponse>("getStatus").then((result) => {
      setActive((result as StatusResponse).active);
    });
  }, []);

  if (active === null) {
    return null;
  }

  // Box/xcss background-color overrides don't render inside this action
  // config surface (confirmed empirically: a filled Box + inverse Text
  // rendered as plain unstyled black text). Lozenge's color comes from the
  // platform's built-in appearance system rather than a custom xcss
  // override, so it renders correctly here. Inline keeps it content-width
  // instead of stretching to the Stack's full width.
  return (
    <Stack space="space.050">
      <Inline>
        <Lozenge appearance={active ? "success" : "removed"}>
          {active ? "Config: Active" : "Config: Inactive"}
        </Lozenge>
      </Inline>
      {!active && (
        <Inline space="space.050" alignBlock="center">
          <Text>Admins need to</Text>
          <LinkButton
            appearance="link"
            onClick={() => {
              void router.navigate({
                target: "module",
                moduleKey: "admin-assignment-configure-page",
              });
            }}
          >
            configure
          </LinkButton>
          <Text>.</Text>
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
