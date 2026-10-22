/*
 * Stile dell'HTML di WeBeep: solo classi del design system, mai lo stile di Moodle.
 * Ogni tag ha la sua voce, così aggiungere un tag alla whitelist obbliga a decidere il suo aspetto.
 */
import type { RichTag } from './parseRichHtml';

const HEADING_CLASS = 'mt-5 mb-2 text-base font-medium first:mt-0';
const MINOR_HEADING_CLASS = 'mt-4 mb-1 text-sm font-medium first:mt-0';
const TABLE_CELL_CLASS = 'border px-2 py-1 align-top';

export const RICH_TAG_CLASSES: Readonly<Record<RichTag, string>> = {
  p: 'my-3 first:mt-0 last:mb-0',
  br: '',
  h1: HEADING_CLASS,
  h2: HEADING_CLASS,
  h3: HEADING_CLASS,
  h4: MINOR_HEADING_CLASS,
  h5: MINOR_HEADING_CLASS,
  h6: MINOR_HEADING_CLASS,
  strong: 'font-semibold',
  b: 'font-semibold',
  em: 'italic',
  i: 'italic',
  u: 'underline underline-offset-2',
  s: 'line-through',
  sub: 'align-sub text-2xs',
  sup: 'align-super text-2xs',
  code: 'rounded-sm bg-muted px-1 py-0.5 font-mono text-xs',
  pre: 'my-3 overflow-x-auto whitespace-pre rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed',
  blockquote: 'my-3 border-l-2 pl-3 text-muted-foreground',
  ul: 'my-3 list-disc space-y-1 pl-5',
  ol: 'my-3 list-decimal space-y-1 pl-5',
  li: '',
  a: 'text-primary underline underline-offset-2 hover:opacity-80',
  img: 'my-3 h-auto max-w-full rounded-lg',
  table: 'w-full border-collapse text-sm',
  thead: '',
  tbody: '',
  tr: '',
  th: `${TABLE_CELL_CLASS} text-left font-medium`,
  td: TABLE_CELL_CLASS,
  hr: 'my-4 border-t',
  span: '',
  div: '',
};
