/*
 * Deduzioni pure dai campi di una notifica Moodle: che risorsa è (`component`),
 * il modulo indicato dalla `contexturl` e il testo da mostrare nel corpo.
 * Niente React e niente rete: si legge e si verifica da solo.
 */
import type { MoodleNotification } from '@webeep/moodle-api';
import { parseRichHtml, type RichNode } from '../components/rich-html/parseRichHtml';
import { htmlToText } from './format';

/** Dove porta il contenuto di una notifica: sceglie etichetta e voce "apri nel corso". */
export type NotificationDestination = 'course' | 'forum' | 'assign' | 'quiz' | 'page' | 'resource' | 'other';

/*
 * Componente Moodle → destinazione. La mappa copre i componenti che l'app sa
 * mostrare; tutto il resto (plugin, `moodle`, …) resta `other`.
 */
const DESTINATION_BY_COMPONENT: Readonly<Record<string, NotificationDestination>> = {
  core_course: 'course',
  mod_forum: 'forum',
  mod_assign: 'assign',
  mod_quiz: 'quiz',
  mod_page: 'page',
  mod_resource: 'resource',
  mod_folder: 'resource',
  mod_url: 'resource',
};

/** Etichette brevi, in italiano e minuscole: stanno accanto al soggetto come promemoria del tipo. */
const DESTINATION_LABELS: Readonly<Record<NotificationDestination, string>> = {
  course: 'corso',
  forum: 'forum',
  assign: 'compito',
  quiz: 'quiz',
  page: 'pagina',
  resource: 'materiale',
  other: 'altro',
};

/**
 * Tipo del contenuto di una notifica. `fullmessagehtml` è HTML di Moodle: si mostra
 * con `<RichHtml>`, mai iniettato. `empty` = niente da leggere oltre al soggetto.
 */
export type NotificationContent =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'empty' };

/*
 * Modulo Moodle con l'id nella query: "https://webeep.polimi.it/mod/forum/view.php?id=9002" cattura "9002",
 * anche con altri parametri dopo ("…?id=9002&page=2"). Non corrispondono "…/mod/forum/discuss.php?d=9002"
 * (lì l'id è della discussione, non del modulo) e "…/course/view.php?id=5" (un corso, non un modulo).
 * https://regex101.com/?regex=%2F%5C%2Fmod%5C%2F%5Ba-z_%5D%2B%5C%2Fview%5C.php%5C%3Fid%3D%28%5Cd%2B%29%28%3F%3A%5B%26%23%5D%7C%24%29%2F&testString=https%3A%2F%2Fwebeep.polimi.it%2Fmod%2Fforum%2Fview.php%3Fid%3D9002%26page%3D2%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fmod%2Fforum%2Fdiscuss.php%3Fd%3D9002%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fcourse%2Fview.php%3Fid%3D5&flavor=javascript&flags=g
 */
const COURSE_MODULE_URL = /\/mod\/[a-z_]+\/view\.php\?id=(\d+)(?:[&#]|$)/;

/**
 * `cmid` del modulo indicato dalla `contexturl`, oppure `null` se la notifica non
 * punta a un modulo con l'id nella query (discussione del forum, corso, link esterno).
 * Quel numero è il `moduleId` della rotta `course` e l'argomento di `moodle:course-module`.
 */
export const extractCourseModuleId = (contexturl: string | null | undefined): number | null => {
  if (!contexturl) return null;
  const id = Number(COURSE_MODULE_URL.exec(contexturl)?.[1] ?? '');
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** Destinazione del componente (`mod_forum` → `forum`); un componente assente o sconosciuto è `other`. */
export const notificationDestination = (component: string | undefined): NotificationDestination =>
  (component === undefined ? undefined : DESTINATION_BY_COMPONENT[component]) ?? 'other';

export const notificationDestinationLabel = (destination: NotificationDestination): string => DESTINATION_LABELS[destination];

const trimmedOrUndefined = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

/** Il corpo in testo semplice (`text`, `fullmessage`, `smallmessage`), già ridotto a una riga leggibile. */
const plainBodyText = (notification: MoodleNotification): string | undefined => {
  const raw =
    trimmedOrUndefined(notification.text) ??
    trimmedOrUndefined(notification.fullmessage) ??
    trimmedOrUndefined(notification.smallmessage);
  if (raw === undefined) return undefined;
  const text = htmlToText(raw);
  return text === '' ? undefined : text;
};

/** Vero se il testo ripete il soggetto: mostrarlo due volte non aggiunge nulla. */
const isRedundantWithSubject = (notification: MoodleNotification, text: string): boolean =>
  text === htmlToText(notification.subject);

/*
 * Tag che in HTML occupano una riga: separandoli con uno spazio le parole di due
 * paragrafi non si incollano ("…T.2.1.porta gli appunti…").
 */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'br',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'blockquote',
  'pre',
  'tr',
  'td',
  'th',
  'hr',
]);

const textOfNodes = (nodes: readonly RichNode[]): string =>
  nodes
    .map((node) => {
      if (node.kind === 'text') return node.text;
      const inner = textOfNodes(node.children);
      return BLOCK_TAGS.has(node.tag) ? ` ${inner} ` : inner;
    })
    .join('');

/*
 * Sequenze di spazi, tabulazioni e a capo: "a\n\n  b" → "a b".
 * https://regex101.com/?regex=%2F%5Cs%2B%2Fg&testString=a%0A%0A%20%20b&flavor=javascript&flags=g
 */
const WHITESPACE_RUNS = /\s+/g;

/**
 * Testo leggibile dall'HTML di Moodle: usa l'albero con whitelist di `<RichHtml>`,
 * così `<script>` e `<style>` spariscono invece di finire nell'anteprima.
 */
const richTextOf = (html: string): string => textOfNodes(parseRichHtml(html)).replace(WHITESPACE_RUNS, ' ').trim();

/*
 * Corpo della notifica, dal più ricco al più povero: HTML, poi `text`, `fullmessage`
 * e `smallmessage` in testo semplice. Un testo identico al soggetto non aggiunge
 * nulla: Moodle lo ripete spesso, e mostrarlo due volte non serve (l'HTML invece
 * resta sempre, perché può contenere link e impaginazione).
 */
export const selectNotificationContent = (notification: MoodleNotification): NotificationContent => {
  const html = trimmedOrUndefined(notification.fullmessagehtml);
  if (html !== undefined) return { kind: 'html', html };

  const text = plainBodyText(notification);
  if (text === undefined || isRedundantWithSubject(notification, text)) return { kind: 'empty' };
  return { kind: 'text', text };
};

/**
 * Anteprima di una riga chiusa. Prima i campi brevi (`smallmessage` è la versione
 * sintetica che Moodle manda apposta), poi il corpo; `''` quando non c'è niente da dire.
 */
export const notificationPreviewText = (notification: MoodleNotification): string => {
  const short = trimmedOrUndefined(notification.smallmessage) ?? plainBodyText(notification);
  if (short !== undefined) return isRedundantWithSubject(notification, short) ? '' : short;

  const html = trimmedOrUndefined(notification.fullmessagehtml);
  if (html === undefined) return '';
  const text = richTextOf(html);
  return isRedundantWithSubject(notification, text) ? '' : text;
};
