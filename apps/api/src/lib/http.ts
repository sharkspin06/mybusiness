import type { Response } from 'express';
import type { ZodError } from 'zod';

/** 400 with field messages the form can show next to each input. */
export function sendValidationError(res: Response, err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  res.status(400).json({ error: 'validation', fields });
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
