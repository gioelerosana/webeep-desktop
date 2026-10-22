/*
 * Download dei file dei corsi.
 *
 * - `openFile` scarica nella cache dell'app e apre con l'applicazione predefinita;
 * - `downloadFile` salva in `<downloadDir>/<corso>/<sezione>/<file>`.
 *
 * Scrittura atomica: si scarica in un `.part` accanto alla destinazione e si
 * rinomina solo a download completo, così un file interrotto non sostituisce
 * mai una copia buona. Se il file locale è già più recente del
 * `timemodified` di Moodle non si riscarica.
 */
import { app, shell } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { authenticatedFileUrl, MoodleNetworkError, WEBEEP_SITE_URL } from '@webeep/moodle-api';
import type { DownloadResult, FileRequest } from '../shared/ipc.js';
import { getActiveToken } from './auth.js';
import { getSettings } from './settings.js';

const CACHE_FOLDER = 'file-cache';
const PART_SUFFIX = '.part';
const MS_PER_SECOND = 1000;
const MAX_SEGMENT_LENGTH = 120;
const FALLBACK_SEGMENT = 'senza-nome';
// Segmento del percorso dei file protetti di Moodle: solo questi richiedono il token (vedi asset-protocol.ts).
const PLUGINFILE_MARKER = 'pluginfile.php';

export class InvalidFileRequestError extends Error {
  override readonly name = 'InvalidFileRequestError';
}

// Caratteri non ammessi nei nomi di file su Windows/Linux/macOS e caratteri di controllo:
// "Analisi 1: esercizi/parte?" → "Analisi 1_ esercizi_parte_"; "Fisica" resta invariato.
// https://regex101.com/?regex=%5B%3C%3E%3A%22%2F%5C%5C%7C%3F*%5Cx00-%5Cx1f%5D&testString=Analisi%201%3A%20esercizi%2Fparte%3F%0AFisica&flavor=javascript&flags=g
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
// Punti e spazi finali, vietati su Windows: "slide. " → "slide"; "slide.pdf" resta invariato.
// https://regex101.com/?regex=%5B.%20%5D%2B%24&testString=slide.%20%0Aslide.pdf&flavor=javascript
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;

/** Un segmento di percorso sicuro: niente separatori, niente `..`, lunghezza limitata. */
export const sanitizeSegment = (raw: string): string => {
  const cleaned = raw.replace(UNSAFE_FILENAME_CHARS, '_').replace(TRAILING_DOTS_AND_SPACES, '').trim();
  const safe = cleaned === '..' || cleaned === '.' ? '' : cleaned;
  return safe.slice(0, MAX_SEGMENT_LENGTH) || FALLBACK_SEGMENT;
};

const assertWebeepUrl = (fileUrl: string): void => {
  if (new URL(fileUrl).origin !== new URL(WEBEEP_SITE_URL).origin) {
    throw new InvalidFileRequestError('Il file non proviene da WeBeep');
  }
};

const isUpToDate = async (path: string, timeModified: number | undefined): Promise<boolean> => {
  try {
    const local = await stat(path);
    return timeModified === undefined || local.mtimeMs >= timeModified * MS_PER_SECOND;
  } catch {
    // Il file locale non esiste: va scaricato.
    return false;
  }
};

const fetchToFile = async (fileUrl: string, destination: string): Promise<void> => {
  const response = await fetch(authenticatedFileUrl(fileUrl, getActiveToken()));
  if (!response.ok || !response.body) {
    throw new MoodleNetworkError(`Download non riuscito (HTTP ${response.status})`, response.status);
  }
  await mkdir(dirname(destination), { recursive: true });
  const partial = `${destination}${PART_SUFFIX}`;
  try {
    // Il ReadableStream DOM di fetch e quello di node:stream/web sono lo stesso oggetto a runtime,
    // ma i due tipi non coincidono: il cast colma solo la differenza di dichiarazioni.
    await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), createWriteStream(partial));
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
};

const ensureLocalCopy = async (file: FileRequest, destination: string): Promise<DownloadResult> => {
  assertWebeepUrl(file.fileUrl);
  if (await isUpToDate(destination, file.timeModified)) return { path: destination, downloaded: false };
  await fetchToFile(file.fileUrl, destination);
  return { path: destination, downloaded: true };
};

const cachePathFor = (file: FileRequest): string =>
  join(app.getPath('userData'), CACHE_FOLDER, sanitizeSegment(file.courseName), sanitizeSegment(file.fileName));

const downloadPathFor = async (file: FileRequest): Promise<string> => {
  const { downloadDir } = await getSettings();
  const sectionSegments = file.sectionName ? [sanitizeSegment(file.sectionName)] : [];
  return join(downloadDir, sanitizeSegment(file.courseName), ...sectionSegments, sanitizeSegment(file.fileName));
};

export const openFile = async (file: FileRequest): Promise<void> => {
  const { path } = await ensureLocalCopy(file, cachePathFor(file));
  const failure = await shell.openPath(path);
  if (failure) throw new Error(failure);
};

export const downloadFile = async (file: FileRequest): Promise<DownloadResult> =>
  ensureLocalCopy(file, await downloadPathFor(file));

/** Un file di WeBeep aperto in streaming, pronto da inoltrare a una risposta HTTP (modalità web). */
export type WebeepFileStream = {
  readonly contentType: string | undefined;
  readonly body: Readable;
};

/**
 * Apre lo stream di un file di WeBeep senza scaricarlo su disco. Accetta solo URL di
 * WeBeep. Il token si aggiunge solo ai file protetti e non esce da questa funzione:
 * chi riceve lo stream vede solo il contenuto e il Content-Type.
 */
export const openWebeepFile = async (fileUrl: string): Promise<WebeepFileStream> => {
  assertWebeepUrl(fileUrl);
  const isProtected = new URL(fileUrl).pathname.includes(PLUGINFILE_MARKER);
  const response = await fetch(isProtected ? authenticatedFileUrl(fileUrl, getActiveToken()) : fileUrl);
  if (!response.ok || !response.body) {
    throw new MoodleNetworkError(`Download non riuscito (HTTP ${response.status})`, response.status);
  }
  return {
    contentType: response.headers.get('content-type') ?? undefined,
    // Stesso cast di `fetchToFile`: il ReadableStream di fetch è quello di node:stream/web a runtime.
    body: Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
  };
};

export const revealFile = (path: string): void => shell.showItemInFolder(path);
