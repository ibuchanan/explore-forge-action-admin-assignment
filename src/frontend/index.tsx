import React, { useEffect, useState } from "react";

import { events, view, type FullContext } from "@forge/bridge";
import ForgeReconciler, {
  Box,
  ErrorMessage,
  Form,
  Stack,
  Text,
  Textfield,
  useForm,
  useProductContext,
} from "@forge/react";

type CommentFormValues = {
  issueKey: string;
  comment: string;
};

type CommentFormProps = {
  context: FullContext;
  isValidating: boolean;
};

const getDefaultValues = (
  context: FullContext,
): Partial<CommentFormValues> =>
  (context.extension.data?.inputs ?? {}) as Partial<CommentFormValues>;

const CommentForm = ({ context, isValidating }: CommentFormProps) => {
  const formInstance = useForm<CommentFormValues>({
    defaultValues: getDefaultValues(context),
  });
  const { handleSubmit, register, getValues, formState } = formInstance;

  const onChange = (input: Partial<CommentFormValues>) => {
    const updatedFormData = { ...getValues(), ...input };

    void view.submit(updatedFormData);
  };

  const onSubmit = (data: CommentFormValues) => {
    void view.submit(data);
  };

  const { onChange: issueKeyOnChange, ...issueKeyRegisterProps } = register(
    "issueKey",
    {
      required: { value: true, message: "Issue key is required" },
      disabled: isValidating,
    },
  );

  const { onChange: commentOnChange, ...commentRegisterProps } = register(
    "comment",
    {
      required: { value: true, message: "Comment is required" },
      disabled: isValidating,
    },
  );

  return (
    <Box>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Stack space="space.100">
          <Text>Issue key</Text>
          <Textfield
            {...issueKeyRegisterProps}
            onChange={(event: any) => {
              issueKeyOnChange(event);
              onChange({ issueKey: event.target.value });
            }}
          />
          {formState.errors.issueKey?.message && (
            <ErrorMessage>{formState.errors.issueKey.message}</ErrorMessage>
          )}
          <Text>Comment</Text>
          <Textfield
            {...commentRegisterProps}
            onChange={(event: any) => {
              commentOnChange(event);
              onChange({ comment: event.target.value });
            }}
          />
          {formState.errors.comment?.message && (
            <ErrorMessage>{formState.errors.comment.message}</ErrorMessage>
          )}
        </Stack>
      </Form>
    </Box>
  );
};

export const App = () => {
  const context = useProductContext();
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const handleValidateRuleEvent = ({
      isValidating,
    }: {
      isValidating: boolean;
    }) => {
      setIsValidating(isValidating);
    };
    const subscription = events.on(
      "AUTOMATION_ACTION_VALIDATE_RULE_EVENT",
      handleValidateRuleEvent,
    );
    return () => {
      void subscription.then((sub) => sub.unsubscribe());
    };
  }, []);

  return context ? (
    <CommentForm context={context} isValidating={isValidating} />
  ) : (
    <Text>Loading...</Text>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
