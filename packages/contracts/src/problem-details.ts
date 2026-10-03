import { z } from 'zod';

/** Formato único de erro da API: Problem Details (RFC 9457). Ver docs/04-API.md §4. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  /** Código estável para o frontend (membro de extensão, RFC 9457 §3.2). */
  code: z.string().optional(),
  errors: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json';
