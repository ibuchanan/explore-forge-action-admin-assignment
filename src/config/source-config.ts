import { type Result, err, ok } from "@forge-ahead/errors";
import type { ValidationProblemDetails } from "@forge-ahead/errors";
import { z } from "zod";

export interface LookupBudget {
  targetUserTimeoutMs: number;
  targetUserMaxPages: number;
  configResolutionTimeoutMs: number;
  configResolutionMaxPages: number;
}

export interface AllowedGroupConfig {
  key: string;
  label: string;
  name: string;
}

export interface SourceConfig {
  orgId: string;
  directoryId: string;
  authorizedInitiatorEmails: string[];
  allowedGroups: AllowedGroupConfig[];
  lookup: LookupBudget;
}

export const DEFAULT_LOOKUP_BUDGET: LookupBudget = {
  targetUserTimeoutMs: 10_000,
  targetUserMaxPages: 5,
  configResolutionTimeoutMs: 30_000,
  configResolutionMaxPages: 20,
};

const allowedGroupSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  name: z.string().min(1),
});

const lookupSchema = z.object({
  targetUserTimeoutMs: z.number().positive().optional(),
  targetUserMaxPages: z.number().int().positive().optional(),
  configResolutionTimeoutMs: z.number().positive().optional(),
  configResolutionMaxPages: z.number().int().positive().optional(),
});

const sourceConfigSchema = z.object({
  orgId: z.string().min(1),
  directoryId: z.string().min(1),
  authorizedInitiatorEmails: z.array(z.string().min(1)).min(1),
  allowedGroups: z.array(allowedGroupSchema).min(1),
  lookup: lookupSchema.optional(),
});

function toValidationProblemDetails(
  detail: string,
  errors: ValidationProblemDetails["errors"],
): ValidationProblemDetails {
  return {
    type: "https://httpstatuses.io/400",
    title: "Bad Request",
    status: 400,
    detail,
    timestamp: new Date().toISOString(),
    errors,
  };
}

export function parseSourceConfig(
  rawJson: string,
): Result<SourceConfig, ValidationProblemDetails> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson);
  } catch (error) {
    return err(
      toValidationProblemDetails(
        error instanceof Error ? error.message : "Invalid JSON",
        [],
      ),
    );
  }

  const parsed = sourceConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      reason: issue.code,
      message: issue.message,
    }));
    return err(
      toValidationProblemDetails(
        "Source Config failed schema validation",
        errors,
      ),
    );
  }

  const lookup: LookupBudget = {
    ...DEFAULT_LOOKUP_BUDGET,
    ...parsed.data.lookup,
  };

  return ok({ ...parsed.data, lookup });
}
