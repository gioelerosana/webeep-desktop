/*
 * Testo semplice da un frammento HTML di Moodle, senza DOM: gira in Node puro e nel browser.
 *
 * Non è un parser HTML: sostituisce con poche regex i costrutti che cambiano il testo
 * (a capo, elenchi, elementi da scartare insieme al contenuto, entità). Il risultato è
 * solo testo: non va mai reinserito come HTML.
 */

const NEWLINE = '\n';
const SPACE = ' ';
const LIST_BULLET = '• ';
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const MAX_CODE_POINT = 0x10ffff;

/** Entità con nome più comuni nei testi di WeBeep. Le altre restano come sono nel testo. */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', SPACE],
  ['copy', '©'],
  ['reg', '®'],
  ['middot', '·'],
  ['bull', '•'],
  ['hellip', '…'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['euro', '€'],
  ['agrave', 'à'],
  ['egrave', 'è'],
  ['igrave', 'ì'],
  ['ograve', 'ò'],
  ['ugrave', 'ù'],
  ['eacute', 'é'],
]);

// Blocchi da eliminare con il loro contenuto: script e style non devono comparire come testo; head e title
// non sono corpo di pagina (il DOM li lascerebbe fuori dal body).
// Accetta: "<script>alert(1)</script>"; non accetta un testo senza tag. Esempio che cambia: "<style>p{}</style>Testo" → "Testo".
// https://regex101.com/?regex=%3C(script%7Cstyle%7Chead%7Ctitle)%5Cb%5B%5E%3E%5D*%3E%5B%5Cs%5CS%5D*%3F(%3F%3A%3C%5C%2F%5C1%5Cs*%3E%7C%24)&testString=%3Cscript%3Ealert(1)%3C%2Fscript%3ETesto%3Cstyle%3Ep%7B%7D%3C%2Fstyle%3E&flavor=javascript&flags=gi
const DROPPED_ELEMENT = /<(script|style|head|title)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
// Commenti HTML, da eliminare interi: il loro contenuto non è testo della pagina.
// Accetta: "a<!-- nota -->b" (diventa "ab"); non accetta "<b>" (non è un commento).
// https://regex101.com/?regex=%3C!--%5B%5Cs%5CS%5D*%3F--%3E&testString=a%3C!--%20nota%20--%3Eb%0A%3C!--%20senza%20fine&flavor=javascript&flags=g
const COMMENT = /<!--[\s\S]*?-->/g;
// Sequenze di spazi bianchi della sorgente (spazi, a capo, tab), prima di inserire i loro a capo.
// Accetta: "a\n\n  b" (diventa "a b"); non accetta "ab" (nessuno spazio bianco).
// https://regex101.com/?regex=%5Cs%2B&testString=a%0A%0A%20%20b&flavor=javascript&flags=g
const SOURCE_WHITESPACE = /\s+/g;
// <br> in tutte le forme (<br>, <br/>, <BR />): diventa un a capo.
// Accetta: "uno<br>due" e "uno<BR/>tre"; non accetta "<bra>" (non è un br).
// https://regex101.com/?regex=%3Cbr%5Cb%5B%5E%3E%5D*%3E&testString=uno%3Cbr%3Edue%3CBR%2F%3Etre&flavor=javascript&flags=gi
const LINE_BREAK = /<br\b[^>]*>/gi;
// Apertura o chiusura di un elemento a blocchi (paragrafi, titoli, divisioni, elenchi, tabelle): diventa un a capo.
// Accetta: "<p>uno</p>", "<h2>due"; non accetta "<param>" (non è un blocco).
// https://regex101.com/?regex=%3C%5C%2F%3F(%3F%3Ap%7Cdiv%7Ch%5B1-6%5D%7Cul%7Col%7Ctable%7Ctr%7Cblockquote%7Cpre%7Csection%7Carticle%7Cheader%7Cfooter%7Chr)%5Cb%5B%5E%3E%5D*%3E&testString=%3Cp%3Euno%3C%2Fp%3E%3Ch2%3Edue%3C%2Fh2%3E%3Cdiv%3Etre%3Cpre%3E&flavor=javascript&flags=gi
const BLOCK_BOUNDARY = /<\/?(?:p|div|h[1-6]|ul|ol|table|tr|blockquote|pre|section|article|header|footer|hr)\b[^>]*>/gi;
// Voce di elenco: l'apertura <li> diventa un a capo con il punto elenco, la chiusura </li> un a capo.
// Il gruppo cattura la "/" di chiusura. Accetta: "<li>uno</li>"; non accetta "<link>".
// https://regex101.com/?regex=%3C(%5C%2F%3F)li%5Cb%5B%5E%3E%5D*%3E&testString=%3Cul%3E%3Cli%3Euno%3C%2Fli%3E%3Cli%3Edue%3C%2Fli%3E%3C%2Ful%3E&flavor=javascript&flags=gi
const LIST_ITEM = /<(\/?)li\b[^>]*>/gi;
// Celle di tabella: diventano uno spazio, altrimenti il contenuto di due celle si attacca.
// Accetta: "<td>a</td>", "<th>b"; non accetta "<tbody>".
// https://regex101.com/?regex=%3C%5C%2F%3F(%3F%3Atd%7Cth)%5Cb%5B%5E%3E%5D*%3E&testString=%3Ctd%3Ea%3C%2Ftd%3E%3Cth%3Eb%3C%2Fth%3E&flavor=javascript&flags=gi
const CELL_BOUNDARY = /<\/?(?:td|th)\b[^>]*>/gi;
// Tag rimanenti (inline, attributi inclusi): si tolgono, il testo resta.
// Accetta: "<a href=\"x\">mondo</a>"; non accetta "a < b" (il "<" seguito da spazio non apre un tag).
// https://regex101.com/?regex=%3C%5C%2F%3F%5Ba-zA-Z%5D%5B%5E%3E%5D*%3E&testString=%3Cstrong%3ECiao%3C%2Fstrong%3E%20%3Ca%20href%3D%22x%22%3Emondo%3C%2Fa%3E%20a%20%3C%20b&flavor=javascript&flags=g
const TAG = /<\/?[a-zA-Z][^>]*>/g;
// Entità HTML: con nome ("&amp;"), decimali ("&#39;") o esadecimali ("&#x41;").
// Accetta: "&amp;", "&#39;", "&#x41;"; non accetta "&amp" (manca il ";").
// https://regex101.com/?regex=%26(%23%5BxX%5D%5B0-9a-fA-F%5D%2B%7C%23%5B0-9%5D%2B%7C%5Ba-zA-Z%5D%5Ba-zA-Z0-9%5D*)%3B&testString=%26amp%3B%20%26%2339%3B%20%26%23x41%3B%20%26nbsp%3B&flavor=javascript&flags=g
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
// Spazi ripetuti dentro una riga, dopo la rimozione dei tag ("a  b" → "a b").
// Accetta: "a    b" (diventa "a b"); non accetta "a b" (uno spazio solo).
// https://regex101.com/?regex=%20%2B&testString=a%20%20%20%20b&flavor=javascript&flags=g
const SPACE_RUNS = / +/g;

/** Un codice numerico valido diventa il carattere; altrimenti l'entità resta com'è. */
const decodeCodePoint = (entity: string, digits: string, radix: number): string => {
  const code = Number.parseInt(digits, radix);
  return code > 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : entity;
};

/** `body` è il contenuto dell'entità senza "&" e ";": "amp", "#39" o "#x41". */
const decodeEntity = (entity: string, body: string): string => {
  if (body[0] !== '#') return NAMED_ENTITIES.get(body) ?? entity;
  const isHex = body[1] === 'x' || body[1] === 'X';
  return isHex
    ? decodeCodePoint(entity, body.slice(2), HEX_RADIX)
    : decodeCodePoint(entity, body.slice(1), DECIMAL_RADIX);
};

/** Rimuove i tag e pone a capo e punti elenco dove servono. Le entità restano ancora codificate. */
const stripMarkup = (html: string): string =>
  html
    .replace(COMMENT, '')
    .replace(DROPPED_ELEMENT, '')
    .replace(SOURCE_WHITESPACE, SPACE)
    .replace(LINE_BREAK, NEWLINE)
    .replace(BLOCK_BOUNDARY, NEWLINE)
    .replace(LIST_ITEM, (_tag: string, closing: string) => (closing ? NEWLINE : `${NEWLINE}${LIST_BULLET}`))
    .replace(CELL_BOUNDARY, SPACE)
    .replace(TAG, '');

/** Decodifica in un solo passaggio: "&amp;lt;" diventa "&lt;" (testo), non "<". */
const decodeEntities = (text: string): string =>
  text.replace(ENTITY, (entity: string, body: string) => decodeEntity(entity, body));

/** Una riga per capoverso: spazi ripetuti tolti, righe vuote eliminate. */
const normalizeLines = (text: string): string =>
  text
    .split(NEWLINE)
    .map((line) => line.replace(SPACE_RUNS, SPACE).trim())
    .filter((line) => line !== '')
    .join(NEWLINE);

/**
 * Testo semplice da un frammento HTML di Moodle (descrizioni, pagine, notifiche).
 * Capoversi e interruzioni di riga diventano a capo; gli elementi di elenco un punto elenco.
 */
export const htmlToText = (html: string): string => normalizeLines(decodeEntities(stripMarkup(html)));
