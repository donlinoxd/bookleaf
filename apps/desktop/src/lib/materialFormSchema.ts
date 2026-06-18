import { z } from 'zod';
import type { FieldDescriptor } from './materialFields';

// Field kinds that the authority pickers own (their state lives outside RHF).
const PICKER_KINDS = new Set(['author-authority', 'publisher-authority', 'subjects']);

export function buildMaterialSchema(fields: FieldDescriptor[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (PICKER_KINDS.has(f.kind)) continue; // handled by picker state, not RHF
    if (f.key === 'title') {
      shape[f.key] = z.string().min(1, 'Title is required');
      continue;
    }
    if (f.kind === 'select' && f.options && f.options.length > 0) {
      // Allow empty (unselected) OR one of the options.
      shape[f.key] = z.union([z.literal(''), z.enum([...f.options] as [string, ...string[]])]).optional();
      continue;
    }
    if (f.kind === 'number') {
      // Treat a blank input as "unset" so an empty number field persists as NULL, not 0.
      const blankToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);
      shape[f.key] = f.key === 'total_copies'
        // Copies must be a positive integer; a blank field defaults to 1 (never 0).
        ? z.preprocess(blankToUndefined, z.coerce.number().int().min(1).default(1))
        : z.preprocess(blankToUndefined, z.coerce.number().optional());
      continue;
    }
    shape[f.key] = f.required ? z.string().min(1, `${f.label} is required`) : z.string().optional();
  }
  return z.object(shape).passthrough();
}
