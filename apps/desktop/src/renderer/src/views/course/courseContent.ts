/*
 * Logica pura della pagina corso: da sezioni e moduli Moodle a righe pronte per
 * la vista. Nessun React qui: filtro, classificazione e raggruppamento si
 * leggono e si verificano senza componenti.
 */
import type { Course, CourseModule, CourseSection, ModuleContent } from '@webeep/moodle-api';
import type { FileRequest } from '../../../../shared/ipc';
import { formatDateTime, formatFileSize, htmlToText, parseCourseName } from '../../lib/format';

const LOCALE = 'it-IT';
const META_SEPARATOR = ' · ';
const SINGLE_FILE_COUNT = 1;

export const LABEL_MODNAME = 'label';
const URL_MODNAME = 'url';
const RESOURCE_MODNAME = 'resource';
const FOLDER_MODNAME = 'folder';
/** Moduli che possono contenere file: gli altri, anche con allegati, si aprono sul sito. */
const FILE_MODNAMES: readonly string[] = [RESOURCE_MODNAME, FOLDER_MODNAME];

/** Contenuto scaricabile: Moodle lo manda senza `fileurl` quando non è un file vero. */
export type CourseFile = ModuleContent & { readonly fileurl: string };

/** Una riga di modulo già classificata: la vista sceglie il componente dal `kind`. */
export type CourseRow =
  | { readonly kind: 'text'; readonly module: CourseModule; readonly text: string }
  | { readonly kind: 'link'; readonly module: CourseModule; readonly url: string | undefined }
  | { readonly kind: 'file'; readonly module: CourseModule; readonly file: CourseFile }
  | { readonly kind: 'folder'; readonly module: CourseModule; readonly files: readonly CourseFile[] };

export type CourseSectionView = {
  readonly id: number;
  readonly name: string;
  readonly summary: string;
  readonly rows: readonly CourseRow[];
  readonly fileCount: number;
};

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

export const isCourseFile = (content: ModuleContent): content is CourseFile => content.fileurl !== undefined;

/** Query pronta per il confronto: senza spazi ai bordi e in minuscolo. */
export const normalizeQuery = (query: string): string => query.trim().toLocaleLowerCase(LOCALE);

/** Vero se la query (già normalizzata) compare in uno dei valori; una query vuota corrisponde sempre. */
const matches = (query: string, ...values: readonly string[]): boolean =>
  values.some((value) => value.toLocaleLowerCase(LOCALE).includes(query));

const toLinkUrl = (module: CourseModule, files: readonly CourseFile[]): string | undefined =>
  module.modname === URL_MODNAME ? (files.at(0)?.fileurl ?? module.url) : module.url;

const toModuleRow = (module: CourseModule, query: string): CourseRow | undefined => {
  const files = module.contents.filter(isCourseFile);

  if (module.modname === LABEL_MODNAME) {
    const text = htmlToText(module.description ?? '');
    return text !== '' && matches(query, text) ? { kind: 'text', module, text } : undefined;
  }

  if (!FILE_MODNAMES.includes(module.modname) || files.length === 0) {
    return matches(query, module.name) ? { kind: 'link', module, url: toLinkUrl(module, files) } : undefined;
  }

  const nameMatches = matches(query, module.name);
  const single = files.length === SINGLE_FILE_COUNT ? files.at(0) : undefined;
  if (module.modname === RESOURCE_MODNAME && single) {
    return nameMatches || matches(query, single.filename) ? { kind: 'file', module, file: single } : undefined;
  }

  // Se il nome del modulo corrisponde, ogni file è un risultato; altrimenti solo quelli con il nome giusto.
  const matchingFiles = nameMatches ? files : files.filter((file) => matches(query, file.filename));
  return matchingFiles.length > 0 ? { kind: 'folder', module, files: matchingFiles } : undefined;
};

const rowFiles = (row: CourseRow): readonly CourseFile[] => {
  if (row.kind === 'file') return [row.file];
  if (row.kind === 'folder') return row.files;
  return [];
};

/**
 * Sezioni visibili con le righe che corrispondono alla query. Con query attiva
 * spariscono le sezioni senza risultati; senza query restano quelle con moduli
 * o con un riepilogo. Le sezioni e i moduli nascosti a chi guarda non passano mai.
 */
export const buildSectionViews = (sections: readonly CourseSection[], query: string): readonly CourseSectionView[] => {
  const normalized = normalizeQuery(query);
  return sections
    .filter((section) => section.uservisible)
    .map((section) => {
      const rows = section.modules
        .filter((module) => module.uservisible)
        .map((module) => toModuleRow(module, normalized))
        .filter(isDefined);
      return {
        id: section.id,
        name: section.name,
        summary: htmlToText(section.summary),
        rows,
        fileCount: rows.flatMap(rowFiles).length,
      };
    })
    .filter((view) => (normalized ? view.rows.length > 0 : view.rows.length > 0 || view.summary !== ''));
};

/** Estensione in maiuscolo, se il nome ha un punto dopo il primo carattere: "Esercizi-03.pdf" → "PDF". */
export const fileExtension = (filename: string): string | undefined => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLocaleUpperCase(LOCALE) : undefined;
};

/** Riga secondaria di un file: "PDF · 1,2 MB · 4 nov, 14:30". */
export const fileMeta = (file: CourseFile): string =>
  [
    fileExtension(file.filename),
    formatFileSize(file.filesize),
    file.timemodified === undefined ? undefined : formatDateTime(file.timemodified),
  ]
    .filter(isDefined)
    .join(META_SEPARATOR);

export const toFileRequest = (file: CourseFile, courseName: string, sectionName: string): FileRequest => ({
  fileUrl: file.fileurl,
  fileName: file.filename,
  courseName,
  sectionName,
  timeModified: file.timemodified,
});

/** Docente e categoria sotto il titolo; le parti mancanti si omettono. */
export const courseSubtitle = (course: Course): string | undefined => {
  const teacher = parseCourseName(course.fullname).teacher;
  const parts = [teacher, course.coursecategory].filter((part): part is string => part !== undefined && part !== '');
  return parts.length > 0 ? parts.join(META_SEPARATOR) : undefined;
};
