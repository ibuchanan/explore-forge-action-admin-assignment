import React, { useEffect, useState } from 'react';

import { view, events } from '@forge/bridge';
import ForgeReconciler, {
  Form,
  useForm,
  Stack,
  Text,
  useProductContext,
  ErrorMessage,
  Textfield,
  Box,
} from '@forge/react';

const CommentForm = ({ context, isValidating }) => {
  const formInstance = useForm({
    defaultValues: context.extension.data.inputs,
    disabled: isValidating
  });
  const { handleSubmit, register, getValues, formState } = formInstance;

  const onChange = (input) => {
    const updatedFormData = { ...getValues(), ...input };

    view.submit(updatedFormData);
  };

  const onSubmit = data => {
    view.submit(data);
  };

  const { onChange: issueKeyOnChange, ...issueKeyRegisterProps } = register('issueKey', {
    required: { value: true, message: 'Issue key is required' },
    disabled: isValidating,
  });

  const { onChange: commentOnChange, ...commentRegisterProps } = register('comment', {
    required: { value: true, message: 'Comment is required' },
    disabled: isValidating,
  });

  return (
    <Box>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Stack space="space.100">
          <Text>Issue key</Text>
          <Textfield
            {...issueKeyRegisterProps}
            onChange={(e) => {
              issueKeyOnChange(e);
              onChange({ issueKey: e.target.value });
            }}
          />
          {formState.errors.issueKey?.message && (
            <ErrorMessage>
              {formState.errors.issueKey?.message}
            </ErrorMessage>
          )}
          <Text>Comment</Text>
          <Textfield
            {...commentRegisterProps}
            onChange={(e) => {
              commentOnChange(e);
              onChange({ comment: e.target.value });
            }}
          />
          {formState.errors.comment?.message && (
            <ErrorMessage>
              {formState.errors.comment?.message}
            </ErrorMessage>
          )}
        </Stack>
      </Form>
    </Box>
  );
};

export const App = () => {
  const context = useProductContext();
  const [isValidating, setIsValidating] = useState(false);

  // This effect sets up a listener for the 'AUTOMATION_ACTION_VALIDATE_RULE_EVENT' event.
  useEffect(() => {
    const handleValidateRuleEvent = ({ isValidating }) => {
      setIsValidating(isValidating);
    };
    const subscription = events.on('AUTOMATION_ACTION_VALIDATE_RULE_EVENT', handleValidateRuleEvent);
    return () => subscription.then(sub => sub.unsubscribe());
  }, []);

  return context ? <CommentForm context={context} isValidating={isValidating} /> : <Text>Loading...</Text>;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
