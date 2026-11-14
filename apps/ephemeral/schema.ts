import { z } from 'zod';
export const preferencesSchema = z.object({
  layout: z.enum(['table', 'list', 'cards', 'board']).nullable(),
  density: z.enum(['compact', 'comfortable']).nullable(),
  descriptions: z.boolean().nullable(),
  groupBy: z.enum(['none', 'state', 'repository', 'assignee']).nullable(),
}).strict();
export const emptyPreferences = { layout: null, density: null, descriptions: null, groupBy: null };
export const sectionSchema = z.object({
  title: z.string().min(1).max(120),
  layout: z.enum(['table', 'list', 'cards', 'board']),
  density: z.enum(['compact', 'comfortable']),
  descriptions: z.boolean(),
  groupBy: z.enum(['none', 'state', 'repository', 'assignee']),
  columns: z.array(z.enum(['number', 'title', 'state', 'labels', 'assignees', 'updated', 'repository'])).min(1).max(7),
  query: z.object({
    kind: z.enum(['issues', 'pulls']), state: z.enum(['open', 'closed', 'all']),
    labels: z.array(z.string().max(80)).max(8), assignee: z.string().max(80),
    reviewRequested: z.boolean(), text: z.string().max(200), sort: z.enum(['updated', 'created', 'comments']),
  }).strict(),
}).strict();
export const planSchema = z.object({
  title: z.string().min(1).max(120), description: z.string().max(500),
  preferences: preferencesSchema, sections: z.array(sectionSchema).min(1).max(4),
}).strict();
export type Plan = z.infer<typeof planSchema>;
export type Section = z.infer<typeof sectionSchema>;
export const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(3000),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/).max(180),
  preferences: preferencesSchema,
  previous: planSchema.nullable(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(3000) }).strict()).max(12),
}).strict();
// Explicit JSON Schema avoids sending renderer code or unconstrained HTML to the model.
const en = (...values: string[]) => ({ type: 'string', enum: values });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] });
export const planJsonSchema = obj({
  title: { type: 'string' }, description: { type: 'string' },
  preferences: obj({ layout: nullable(en('table','list','cards','board')), density: nullable(en('compact','comfortable')), descriptions: { type: ['boolean','null'] }, groupBy: nullable(en('none','state','repository','assignee')) }),
  sections: { type: 'array', items: obj({
    title: { type: 'string' }, layout: en('table','list','cards','board'), density: en('compact','comfortable'), descriptions: { type:'boolean' }, groupBy: en('none','state','repository','assignee'),
    columns: { type: 'array', items: en('number','title','state','labels','assignees','updated','repository') },
    query: obj({ kind: en('issues','pulls'), state: en('open','closed','all'), labels: { type: 'array', items: {type:'string'} }, assignee: {type:'string'}, reviewRequested: {type:'boolean'}, text: {type:'string'}, sort: en('updated','created','comments') }),
  }) },
});
// Extract complete section objects from an unfinished streamed JSON document.
// Tracking nesting and strings avoids mistaking braces inside titles for boundaries.
export function completedSections(text: string): unknown[] {
  let depth = 0, quoted = false, escape = false, start = -1, array = false;
  const result: unknown[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') {
        quoted = false;
        if (!array && depth === 1 && start >= 0 && text.slice(start, i + 1) === '"sections"') {
          const tail = text.slice(i + 1);
          if (/^\s*:\s*\[/.test(tail)) { i += tail.indexOf('[') + 1; array = true; depth = 0; start = -1; }
        }
      }
      continue;
    }
    if (c === '"') { quoted = true; if (!array && depth === 1) start = i; continue; }
    if (c === '{' || c === '[') { if (array && depth === 0 && c === '{') start = i; depth++; }
    if (c === '}' || c === ']') {
      if (array && depth === 0 && c === ']') break;
      depth--;
      if (array && depth === 0 && c === '}' && start >= 0) { result.push(JSON.parse(text.slice(start, i + 1))); start = -1; }
    }
  }
  return result;
}
