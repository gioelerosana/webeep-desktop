/*
 * Pagina del corso (`mod_page`) ridotta a quello che il renderer può vedere: niente token,
 * niente file senza URL. Pura: il recupero dei dati e la validazione dell'input restano nell'app.
 */
import { stripAuthTokens } from './sanitize.js';
import type { Page, PageFile } from './schemas.js';

const ROOT_FILE_PATH = '/';

/** File di una pagina; `fileurl` è già senza token. */
export type CoursePageContentFile = {
  readonly filename: string;
  readonly filepath: string;
  readonly filesize: number;
  readonly fileurl: string;
  readonly mimetype: string | undefined;
  readonly timemodified: number | undefined;
};

/** Pagina del corso senza token. `introHtml` e `contentHtml` sono HTML come stringa: mai iniettati. */
export type CoursePageContent = {
  readonly moduleId: number;
  readonly name: string;
  readonly introHtml: string;
  readonly contentHtml: string;
  readonly files: readonly CoursePageContentFile[];
  readonly timemodified: number;
};

const toCoursePageFile = (file: PageFile, fileUrl: string): CoursePageContentFile => ({
  filename: file.filename,
  filepath: file.filepath ?? ROOT_FILE_PATH,
  filesize: file.filesize,
  fileurl: stripAuthTokens(fileUrl),
  mimetype: file.mimetype,
  timemodified: file.timemodified,
});

/** Un file di Moodle che si può aprire; i file senza URL si omettono. */
const toOpenableFiles = (files: readonly PageFile[]): readonly CoursePageContentFile[] =>
  files.flatMap((file) => (file.fileurl ? [toCoursePageFile(file, file.fileurl)] : []));

/** Stesso file in `introfiles` e `contentfiles`: si tiene una sola voce per URL (già senza token). */
const uniqueByFileUrl = (files: readonly CoursePageContentFile[]): readonly CoursePageContentFile[] =>
  Array.from(new Map(files.map((file) => [file.fileurl, file] as const)).values());

/** I file dell'introduzione e del testo della pagina, in quest'ordine. */
export const toCoursePage = (page: Page): CoursePageContent => ({
  moduleId: page.coursemodule,
  name: page.name,
  introHtml: stripAuthTokens(page.intro),
  contentHtml: stripAuthTokens(page.content),
  files: uniqueByFileUrl(toOpenableFiles([...page.introfiles, ...page.contentfiles])),
  timemodified: page.timemodified,
});
