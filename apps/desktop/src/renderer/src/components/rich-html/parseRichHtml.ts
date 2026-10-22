/*
 * Parsing dell'HTML di Moodle in un albero di nodi con una whitelist di tag.
 * Il DOMParser è inerte: non esegue script né carica risorse. Qui non c'è React:
 * il renderer costruisce gli elementi a partire da questo albero.
 */

export const RICH_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'span',
  'div',
] as const;

export type RichTag = (typeof RICH_TAGS)[number];

const RICH_TAG_SET: ReadonlySet<string> = new Set<string>(RICH_TAGS);
const isRichTag = (tag: string): tag is RichTag => RICH_TAG_SET.has(tag);

/**
 * Tag scartati con tutto il contenuto: codice eseguibile, risorse esterne,
 * moduli e controlli di input, grafica incorporata. Gli altri tag sconosciuti
 * si tolgono ma lasciano il loro testo.
 */
const DROPPED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'frame',
  'frameset',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'noscript',
  'template',
  'svg',
  'math',
  'video',
  'audio',
  'canvas',
  'head',
  'title',
  'meta',
  'link',
  'base',
]);

/** Dentro queste righe React segnala gli spazi tra i tag: li si scarta. */
const TABLE_STRUCTURE_TAGS: ReadonlySet<string> = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);
const BODY_TAG = 'body';
const MIN_SPAN = 1;
// Sopra questo valore lo span è quasi certamente un errore di scrittura nell'HTML: si ignora.
const MAX_SPAN = 1000;

export type RichTextNode = { readonly kind: 'text'; readonly text: string };

/** Solo gli attributi ricostruiti: tutti gli altri dell'HTML di Moodle vengono scartati. */
export type RichAttributes = {
  readonly href?: string;
  readonly src?: string;
  readonly alt?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
};

export type RichElementNode = RichAttributes & {
  readonly kind: 'element';
  readonly tag: RichTag;
  readonly children: readonly RichNode[];
};

export type RichNode = RichTextNode | RichElementNode;

const parseSpan = (value: string | null): number | undefined => {
  const span = Number(value);
  return Number.isInteger(span) && span >= MIN_SPAN && span <= MAX_SPAN ? span : undefined;
};

const attributesOf = (element: Element, tag: RichTag): RichAttributes => {
  if (tag === 'a') return { href: element.getAttribute('href') ?? undefined };
  if (tag === 'img') return { src: element.getAttribute('src') ?? undefined, alt: element.getAttribute('alt') ?? undefined };
  if (tag === 'td' || tag === 'th') {
    return { colSpan: parseSpan(element.getAttribute('colspan')), rowSpan: parseSpan(element.getAttribute('rowspan')) };
  }
  return {};
};

const toTextNodes = (text: string, parentTag: string): readonly RichNode[] => {
  if (text === '') return [];
  if (text.trim() === '' && TABLE_STRUCTURE_TAGS.has(parentTag)) return [];
  return [{ kind: 'text', text }];
};

const childrenOf = (parent: Node, parentTag: string): readonly RichNode[] =>
  Array.from(parent.childNodes).flatMap((child) => toRichNodes(child, parentTag));

const toElementNode = (element: Element, tag: RichTag): RichElementNode => ({
  kind: 'element',
  tag,
  children: childrenOf(element, tag),
  ...attributesOf(element, tag),
});

const toRichNodes = (node: Node, parentTag: string): readonly RichNode[] => {
  if (node.nodeType === Node.TEXT_NODE) return toTextNodes(node.textContent ?? '', parentTag);
  if (!(node instanceof Element)) return [];
  const tag = node.tagName.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return [];
  if (isRichTag(tag)) return [toElementNode(node, tag)];
  // Tag sconosciuto: via il contenitore, il contenuto resta al suo posto.
  return childrenOf(node, parentTag);
};

/** Albero di nodi da un frammento HTML di Moodle, con solo i tag della whitelist. */
export const parseRichHtml = (html: string): readonly RichNode[] => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return childrenOf(document.body, BODY_TAG);
};

/** Vero se c'è qualcosa da mostrare: testo non vuoto, un'immagine o una linea. */
export const hasRichContent = (nodes: readonly RichNode[]): boolean =>
  nodes.some((node) => {
    if (node.kind === 'text') return node.text.trim() !== '';
    if (node.tag === 'img' || node.tag === 'hr') return true;
    return hasRichContent(node.children);
  });
