import { z } from 'zod';

/**
 * Contract schemas for the Notes API, verified against the live service.
 *
 * These exist so that "schema validation" means something stronger than
 * `expect(body.data.id).toBeTruthy()`. A field silently changing type, or
 * disappearing, fails with a precise path — exactly the kind of failure the
 * AI explainer reads well.
 */

export const categorySchema = z.enum(['Home', 'Work', 'Personal']);

export const envelope = z.object({
  success: z.boolean(),
  status: z.number().int(),
  message: z.string().min(1),
});

/** Mongo ObjectId — 24 hex chars. */
const objectId = z.string().regex(/^[0-9a-f]{24}$/, 'expected a 24-char hex ObjectId');

export const userSchema = z.object({
  id: objectId,
  name: z.string(),
  email: z.email(),
});

export const loginDataSchema = userSchema.extend({
  token: z.string().min(10),
});

export const noteSchema = z.object({
  id: objectId,
  title: z.string().min(4).max(100),
  description: z.string(),
  category: categorySchema,
  completed: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  user_id: objectId,
});

export const loginResponseSchema = envelope.extend({ success: z.literal(true), data: loginDataSchema });
export const profileResponseSchema = envelope.extend({ success: z.literal(true), data: userSchema });
export const noteResponseSchema = envelope.extend({ success: z.literal(true), data: noteSchema });
export const notesListResponseSchema = envelope.extend({ success: z.literal(true), data: z.array(noteSchema) });

/** 4xx bodies keep the envelope, carry no `data`, and must never leak a token. */
export const errorResponseSchema = envelope.extend({ success: z.literal(false) }).strict();

export type Note = z.infer<typeof noteSchema>;
export type Category = z.infer<typeof categorySchema>;

/**
 * Formats a Zod failure into something a human (and the LLM) can act on:
 * which field, what was expected, what arrived.
 */
export function describeSchemaError(error: z.ZodError): string {
  return error.issues.map((issue) => `  • ${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n');
}

export function assertSchema<T extends z.ZodType>(schema: T, value: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Schema validation failed for ${label}:\n${describeSchemaError(result.error)}\n\nReceived:\n${JSON.stringify(value, null, 2).slice(0, 1500)}`,
    );
  }
  return result.data;
}
