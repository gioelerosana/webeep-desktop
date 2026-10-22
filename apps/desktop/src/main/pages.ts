/*
 * Pagine del corso (`mod_page`) per la vista di lettura.
 *
 * Il token Moodle non esce da qui: l'HTML e gli URL dei file che tornano al renderer
 * non devono contenere `token` o `wstoken`. L'HTML resta una stringa: il renderer non
 * lo inietta mai, lo interpreta con una whitelist.
 */
import { getPages, type Page, type PageFile } from '@webeep/moodle-api';
import { z } from 'zod';
import type { CoursePage, CoursePageFile, CoursePageRequest } from '../shared/ipc.js';
import { withClient } from './auth.js';

const ROOT_FILE_PATH = '/';
const INVALID_REQUEST_MESSAGE = 'Richiesta di pagina non valida';
const PAGE_NOT_FOUND_MESSAGE = 'Pagina non trovata in questo corso';

/** Il modulo richiesto non è una pagina del corso, o l'input non è valido. */
export class InvalidPageRequestError extends Error {
  override readonly name = 'InvalidPageRequestError';
}

const pageRequestSchema = z.object({
  courseId: z.number().int().positive(),
  moduleId: z.number().int().positive(),
});

// Parametro `token` o `wstoken` di Moodle, con il separatore che lo apre e l'eventuale `&` (o `&amp;`) che lo segue.
// Accetta: "…/a.pdf?token=abc&forcedownload=1" e "…/a.pdf?x=1&wstoken=abc"; non accetta "…/a.pdf?forcedownload=1".
// Esempio che cambia: "…/a.pdf?token=abc&forcedownload=1" → "…/a.pdf?forcedownload=1".
// https://regex101.com/?regex=%28%5C%3F%7C%26amp%3B%7C%26%29%28%3F%3Awstoken%7Ctoken%29%3D%5B%5E%26%22%5C%27%5Cs%23%3C%3E%5D%2A%28%26amp%3B%7C%26%29%3F&testString=https%3A%2F%2Fwebeep.polimi.it%2Fwebservice%2Fpluginfile.php%2F123%2Fa.pdf%3Ftoken%3Dabc%26forcedownload%3D1%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fwebservice%2Fpluginfile.php%2F123%2Fa.pdf%3Fforcedownload%3D1&flavor=javascript&flags=gi
const AUTH_TOKEN_PARAM = /(\?|&amp;|&)(?:wstoken|token)=[^&"'\s#<>]*(&amp;|&)?/gi;

/**
 * Toglie i parametri di autenticazione da un testo (HTML o URL). Un solo passaggio non basta
 * con token adiacenti (`?token=a&token=b`): il secondo viene visto solo dopo il primo, quindi
 * si ripete finché il testo cambia.
 */
export const stripAuthTokens = (text: string): string => {
  const stripped = text.replace(AUTH_TOKEN_PARAM, (_match: string, lead: string, trail: string | undefined) =>
    trail ? lead : '',
  );
  return stripped === text ? text : stripAuthTokens(stripped);
};

const toCoursePageFile = (file: PageFile, fileUrl: string): CoursePageFile => ({
  filename: file.filename,
  filepath: file.filepath ?? ROOT_FILE_PATH,
  filesize: file.filesize,
  fileurl: stripAuthTokens(fileUrl),
  mimetype: file.mimetype,
  timemodified: file.timemodified,
});

/** Un file di Moodle che si può aprire; i file senza URL si omettono. */
const toOpenableFiles = (files: readonly PageFile[]): readonly CoursePageFile[] =>
  files.flatMap((file) => (file.fileurl ? [toCoursePageFile(file, file.fileurl)] : []));

/** Stesso file in `introfiles` e `contentfiles`: si tiene una sola voce per URL (già senza token). */
const uniqueByFileUrl = (files: readonly CoursePageFile[]): readonly CoursePageFile[] =>
  Array.from(new Map(files.map((file) => [file.fileurl, file] as const)).values());

/** I file dell'introduzione e del testo della pagina, in quest'ordine. */
export const toCoursePage = (page: Page): CoursePage => ({
  moduleId: page.coursemodule,
  name: page.name,
  introHtml: stripAuthTokens(page.intro),
  contentHtml: stripAuthTokens(page.content),
  files: uniqueByFileUrl(toOpenableFiles([...page.introfiles, ...page.contentfiles])),
  timemodified: page.timemodified,
});

/** Chiamato dal canale `course:page`: gli argomenti arrivano dal renderer non tipizzati, quindi si validano qui. */
export const getCoursePage = async (request: CoursePageRequest): Promise<CoursePage> => {
  const parsed = pageRequestSchema.safeParse(request);
  if (!parsed.success) throw new InvalidPageRequestError(INVALID_REQUEST_MESSAGE);
  const { courseId, moduleId } = parsed.data;
  const pages = await withClient((client) => getPages(client, [courseId]));
  const page = pages.find((item) => item.coursemodule === moduleId);
  if (!page) throw new InvalidPageRequestError(PAGE_NOT_FOUND_MESSAGE);
  return toCoursePage(page);
};
