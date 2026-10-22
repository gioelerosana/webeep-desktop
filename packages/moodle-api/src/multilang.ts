/*
 * Ripiego lato client per i testi multilingua di WeBeep.
 *
 * Il sito scrive i titoli in più lingue con due sintassi: quella del filtro
 * `filter_multilang2` (`{mlang it}…{mlang}{mlang en}…{mlang}`) e quella del
 * core `multilang` (`<span lang="it" class="multilang">…</span>`). Il server
 * le risolve già con `moodlewssettingfilter`; questo modulo copre il caso in
 * cui il filtro non agisca, tenendo un solo blocco per gruppo.
 *
 * Limite: i blocchi non si annidano. Un `{mlang}` dentro un altro blocco, o uno
 * `<span>` dentro uno `<span class="multilang">`, chiude il blocco prima del
 * previsto e il risultato può essere sbagliato. WeBeep non li produce.
 */

type LangBlock = { readonly lang: string; readonly text: string };

type UnknownRecord = Readonly<Record<string, unknown>>;

const MARKER_WORDS: readonly string[] = ['mlang', 'multilang'];
const OTHER_LANG = 'other';

// Un gruppo di blocchi `{mlang lingua}testo{mlang}` consecutivi, senza testo in mezzo.
// Accetta "{mlang it}A{mlang}{mlang en}B{mlang}", non accetta "{mlang it}A{mlang} x {mlang en}B{mlang}".
// https://regex101.com/?regex=(%3F%3A%5C%7Bmlang%5Cs%2B%5B%5E%7D%5D*%5C%7D%5B%5Cs%5CS%5D*%3F%5C%7Bmlang%5C%7D)%2B&flags=gi&testString=%7Bmlang%20it%7DAnnunci%7Bmlang%7D%7Bmlang%20en%7DAnnouncements%7Bmlang%7D%0ABacheca&flavor=javascript
const MLANG_GROUP_RE = /(?:\{mlang\s+[^}]*\}[\s\S]*?\{mlang\})+/gi;

// Un singolo blocco `{mlang lingua}testo{mlang}`: gruppo 1 la lingua, gruppo 2 il testo.
// Accetta "{mlang en}Notices{mlang}", non accetta "{mlang}Notices{mlang}" (manca la lingua).
// https://regex101.com/?regex=%5C%7Bmlang%5Cs%2B(%5B%5E%7D%5D*)%5C%7D(%5B%5Cs%5CS%5D*%3F)%5C%7Bmlang%5C%7D&flags=gi&testString=%7Bmlang%20it%7DAnnunci%7Bmlang%7D%7Bmlang%20en%7DAnnouncements%7Bmlang%7D&flavor=javascript
const MLANG_BLOCK_RE = /\{mlang\s+([^}]*)\}([\s\S]*?)\{mlang\}/gi;

// Un gruppo di `<span class="multilang">` consecutivi, senza testo in mezzo, con attributi in qualunque ordine.
// Accetta "<span lang=\"it\" class=\"multilang\">A</span><span lang=\"en\" class=\"multilang\">B</span>",
// non accetta "<span class=\"multilang\">A</span> testo <span class=\"multilang\">B</span>".
// https://regex101.com/?regex=(%3F%3A%3Cspan%5Cb%5B%5E%3E%5D*%5Cbclass%3D%5B%22'%5Dmultilang%5B%22'%5D%5B%5E%3E%5D*%3E%5B%5Cs%5CS%5D*%3F%3C%5C%2Fspan%3E)%2B&flags=gi&testString=%3Cp%3E%3Cspan%20lang%3D%22it%22%20class%3D%22multilang%22%3EBacheca%3C%2Fspan%3E%3Cspan%20lang%3D%22en%22%20class%3D%22multilang%22%3EBoard%3C%2Fspan%3E%3C%2Fp%3E&flavor=javascript
const SPAN_GROUP_RE = /(?:<span\b[^>]*\bclass=["']multilang["'][^>]*>[\s\S]*?<\/span>)+/gi;

// Un singolo `<span …>testo</span>`: gruppo 1 gli attributi, gruppo 2 il testo.
// Accetta "<span lang=\"it\" class=\"multilang\">Bacheca</span>", non accetta "<spanish>" (il \b impedisce il match).
// https://regex101.com/?regex=%3Cspan%5Cb(%5B%5E%3E%5D*)%3E(%5B%5Cs%5CS%5D*%3F)%3C%5C%2Fspan%3E&flags=gi&testString=%3Cspan%20lang%3D%22it%22%20class%3D%22multilang%22%3EBacheca%3C%2Fspan%3E&flavor=javascript
const SPAN_BLOCK_RE = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

// L'attributo `lang` di uno span, con apici singoli o doppi; `xml:lang` non conta.
// Accetta ' lang="it" class="multilang"', non accetta ' xml:lang="it"'.
// https://regex101.com/?regex=%5Cslang%3D%5B%22'%5D(%5B%5E%22'%5D*)%5B%22'%5D&flags=i&testString=%20lang%3D%22it%22%20class%3D%22multilang%22&flavor=javascript
const SPAN_LANG_ATTR_RE = /\slang=["']([^"']*)["']/i;

// Separatore del codice lingua: "it_IT" e "en-US" diventano "it" ed "en".
// Accetta "it_IT" e "en-US", non accetta "italiano" (nessun separatore: resta intero).
// https://regex101.com/?regex=%5B_-%5D&flags=&testString=it_IT%20en-US&flavor=javascript
const LANG_SUBTAG_SEPARATOR_RE = /[_-]/;

const normalizeLang = (lang: string): string => lang.trim().toLowerCase().split(LANG_SUBTAG_SEPARATOR_RE)[0] ?? '';

const hasMultilangMarker = (text: string): boolean => {
  const lower = text.toLowerCase();
  return MARKER_WORDS.some((word) => lower.includes(word));
};

/** Sceglie il blocco della lingua richiesta, altrimenti `other`, altrimenti il primo. */
const pickBlock = (blocks: readonly LangBlock[], wantedLang: string): LangBlock | undefined =>
  blocks.find((block) => block.lang === wantedLang) ??
  blocks.find((block) => block.lang === OTHER_LANG) ??
  blocks[0];

const parseMlangGroup = (group: string): readonly LangBlock[] =>
  [...group.matchAll(MLANG_BLOCK_RE)].map(([, lang = '', text = '']) => ({ lang: normalizeLang(lang), text }));

const parseSpanGroup = (group: string): readonly LangBlock[] =>
  [...group.matchAll(SPAN_BLOCK_RE)].map(([, attributes = '', text = '']) => ({
    lang: normalizeLang(SPAN_LANG_ATTR_RE.exec(attributes)?.[1] ?? ''),
    text,
  }));

const resolveGroups = (
  text: string,
  groupRe: RegExp,
  parseGroup: (group: string) => readonly LangBlock[],
  wantedLang: string,
): string =>
  text.replace(groupRe, (group) => pickBlock(parseGroup(group), wantedLang)?.text ?? group);

/**
 * Riduce ogni gruppo di blocchi multilingua di `text` a un solo testo, nella
 * lingua `lang` (es. "it"). Il testo fuori dai gruppi resta invariato. Senza
 * marcatori restituisce `text` com'è.
 */
export const resolveMultilang = (text: string, lang: string): string => {
  if (!hasMultilangMarker(text)) return text;
  const wantedLang = normalizeLang(lang);
  const withoutFilterBlocks = resolveGroups(text, MLANG_GROUP_RE, parseMlangGroup, wantedLang);
  return resolveGroups(withoutFilterBlocks, SPAN_GROUP_RE, parseSpanGroup, wantedLang);
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Applica `resolveMultilang` a ogni stringa di un valore JSON, a qualunque profondità. */
export const resolveMultilangDeep = (value: unknown, lang: string): unknown => {
  if (typeof value === 'string') return resolveMultilang(value, lang);
  if (Array.isArray(value)) return value.map((item: unknown) => resolveMultilangDeep(item, lang));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveMultilangDeep(child, lang)]),
    );
  }
  return value;
};
