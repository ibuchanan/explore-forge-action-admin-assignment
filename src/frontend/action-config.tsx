import ForgeReconciler, {
  HelperMessage,
  Label,
  RequiredAsterisk,
  Text,
  Textfield,
} from "@forge/react";
import React from "react";

interface TargetField {
  name: string;
  label: string;
  description: string;
}

interface ActionConfigProps {
  targetField: TargetField;
}

const selectedGroupKeysDescription =
  "Comma-separated Group Keys from ADMIN_ASSIGNMENT_SOURCE_CONFIG_JSON.";

function RequiredTextField({
  name,
  label,
  description,
  defaultValue,
}: TargetField & { defaultValue?: string }) {
  const fieldId = `field-${name}`;

  return (
    <>
      <Label labelFor={fieldId}>
        {label}
        <RequiredAsterisk />
      </Label>
      <Textfield
        id={fieldId}
        name={name}
        isRequired
        defaultValue={defaultValue}
      />
      <HelperMessage>{description}</HelperMessage>
    </>
  );
}

export function ActionConfig({ targetField }: ActionConfigProps) {
  return (
    <>
      <RequiredTextField
        name="initiatorAccountId"
        label="Initiator account ID"
        defaultValue="{{initiator.accountId}}"
        description="Use the Jira Automation initiator account ID smart value."
      />
      <RequiredTextField
        name={targetField.name}
        label={targetField.label}
        description={targetField.description}
      />
      <RequiredTextField
        name="selectedGroupKeys"
        label="Selected group keys"
        description={selectedGroupKeysDescription}
      />
    </>
  );
}

export function renderActionConfig(targetField: TargetField) {
  const config = <ActionConfig targetField={targetField} />;

  ForgeReconciler.render(
    <React.StrictMode>
      <Text>Admin Access Automation</Text>
    </React.StrictMode>,
  );
  ForgeReconciler.addConfig(<React.StrictMode>{config}</React.StrictMode>);
}
