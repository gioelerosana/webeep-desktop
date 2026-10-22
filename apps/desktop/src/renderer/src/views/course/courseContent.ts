/*
 * Logica pura della pagina corso: da sezioni e moduli Moodle a righe pronte per
 * la vista. Nessun React qui: filtro, classificazione e raggruppamento si
 * leggono e si verificano senza componenti.
 */
import type { Course, CourseModule, CourseSection, ModuleContent } from '@webeep/moodle-api';
import type { FileRequest } from '../../../../shared/ipc';
import { hasRichContent, parseRichHtml, type RichNode } from '../../components/rich-html/parseRichHtml';
import { formatDateTime, formatFileSize, htmlToText, parseCourseName } from '../../lib/format';

const LOCALE = 'it-IT';
const META_SEPARATOR = ' · ';
const SINGLE_FILE_COUNT = 1;

export const LABEL_MODNAME = 'label';
const URL_MODNAME = 'url';
export const PAGE_MODNAME = 'page';
export const RESOURCE_MODNAME = 'resource';
const FOLDER_MODNAME = 'folder';
/** Moduli che possono contenere file: gli altri, anche con allegati, si aprono sul sito. */
const FILE_MODNAMES: readonly string[] = [RESOURCE_MODNAME, FOLDER_MODNAME];

/** Contenuto scaricabile: Moodle lo manda senza `fileurl` quando non è un file vero. */
export type CourseFile = ModuleContent & { readonly fileurl: string };

/** Ciò che serve per aprire o scaricare un file, sia di un modulo del corso sia di una pagina. */
export type DownloadableFile = {
  readonly fileurl: string;
  readonly filename: string;
  readonly timemodified?: number;
};

/** Dati per la riga secondaria di un file: estensione, dimensione, data. */
export type FileMetaSource = {
  readonly filename: string;
  readonly filesize: number;
  readonly timemodified?: number;
};

/** Una riga di modulo già classificata: la vista sceglie il componente dal `kind`. */
export type CourseRow =
  | { readonly kind: 'label'; readonly module: CourseModule; readonly nodes: readonly RichNode[] }
  | { readonly kind: 'page'; readonly module: CourseModule }
  | { readonly kind: 'link'; readonly module: CourseModule; readonly url: string | undefined }
  | { readonly kind: 'file'; readonly module: CourseModule; readonly file: CourseFile }
  | { readonly kind: 'folder'; readonly module: CourseModule; readonly files: readonly CourseFile[] };

export type CourseSectionView = {
  readonly id: number;
  readonly name: string;
  /** Sommario già parsato: la vista lo mostra come HTML, senza passare dal testo piatto. */
  readonly summary: readonly RichNode[];
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
    const description = module.description ?? '';
    const nodes = parseRichHtml(description);
    // La ricerca usa il testo piatto; la resa usa l'albero HTML. Un'etichetta senza contenuto visibile non è una riga.
    return hasRichContent(nodes) && matches(query, htmlToText(description)) ? { kind: 'label', module, nodes } : undefined;
  }

  // La pagina si apre nell'app: il suo contenuto non sta nell'elenco del corso, quindi basta il nome.
  if (module.modname === PAGE_MODNAME) return matches(query, module.name) ? { kind: 'page', module } : undefined;

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
        summary: parseRichHtml(section.summary),
        rows,
        fileCount: rows.flatMap(rowFiles).length,
      };
    })
    .filter((view) => (normalized ? view.rows.length > 0 : view.rows.length > 0 || hasRichContent(view.summary)));
};

/** Estensione in maiuscolo, se il nome ha un punto dopo il primo carattere: "Esercizi-03.pdf" → "PDF". */
export const fileExtension = (filename: string): string | undefined => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLocaleUpperCase(LOCALE) : undefined;
};

/** Riga secondaria di un file: "PDF · 1,2 MB · 4 nov, 14:30". */
export const fileMeta = (file: FileMetaSource): string =>
  [
    fileExtension(file.filename),
    formatFileSize(file.filesize),
    file.timemodified === undefined ? undefined : formatDateTime(file.timemodified),
  ]
    .filter(isDefined)
    .join(META_SEPARATOR);

export const toFileRequest = (file: DownloadableFile, courseName: string, sectionName: string): FileRequest => ({
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

/** Posizione di un modulo nel corso: il modulo e il nome della sezione che lo contiene. */
export type ModuleLocation = {
  readonly module: CourseModule;
  readonly sectionName: string;
};

/** Tutti i moduli del corso con la sezione: serve a risolvere i link interni alle pagine. */
export const buildModuleLocations = (sections: readonly CourseSection[]): readonly ModuleLocation[] =>
  sections.flatMap((section) => section.modules.map((module) => ({ module, sectionName: section.name })));
