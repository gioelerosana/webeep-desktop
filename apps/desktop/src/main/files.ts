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
 *
 * La logica pura (origine, riscrittura del percorso, nomi sicuri, richiesta HTTP)
 * sta in `@webeep/moodle-api`; qui restano le parti Electron e il disco.
 */
import { app, shell } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fetchWebeepFile, isWebeepUrl, sanitizeSegment } from '@webeep/moodle-api';
import type { DownloadResult, FileRequest } from '../shared/ipc.js';
import { getActiveToken } from './auth.js';
import { getSettings } from './settings.js';

// `web-routes.ts` usa ancora il nome dal vecchio punto di ingresso.
export { sanitizeSegment };

const CACHE_FOLDER = 'file-cache';
const PART_SUFFIX = '.part';
const MS_PER_SECOND = 1000;
const IMAGE_CONTENT_TYPE_PREFIX = 'image/';

export class InvalidFileRequestError extends Error {
  override readonly name = 'InvalidFileRequestError';
}

/** La risposta di WeBeep non ha il tipo atteso (es. una pagina HTML di login o di errore). */
export class UnexpectedContentError extends Error {
  override readonly name = 'UnexpectedContentError';
}

/** Un URL che non è di WeBeep non si scarica: è una richiesta non valida. */
const assertWebeepUrl = (fileUrl: string): void => {
  if (!isWebeepUrl(fileUrl)) throw new InvalidFileRequestError('Il file non proviene da WeBeep');
};

/**
 * Richiesta a un file di WeBeep con il token della sessione attiva. Il token passa solo
 * alla libreria e non esce da questo processo.
 */
const requestWebeepFile = async (fileUrl: string): Promise<Response> => {
  assertWebeepUrl(fileUrl);
  return fetchWebeepFile({ fileUrl, token: getActiveToken() });
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

/**
 * Una immagine di WeBeep ha un Content-Type `image/*`. Una pagina HTML (login o errore) va scartata
 * qui, così il renderer mostra il suo ripiego invece di un'immagine rotta.
 */
const requireImage = async (response: Response): Promise<Response> => {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.startsWith(IMAGE_CONTENT_TYPE_PREFIX)) return response;
  await response.body?.cancel();
  throw new UnexpectedContentError("La risposta di WeBeep non è un'immagine");
};

const fetchToFile = async (fileUrl: string, destination: string): Promise<void> => {
  const response = await requestWebeepFile(fileUrl);
  if (!response.body) throw new UnexpectedContentError('La risposta di WeBeep è vuota');
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

const toWebeepFileStream = (response: Response): WebeepFileStream => {
  if (!response.body) throw new UnexpectedContentError('La risposta di WeBeep è vuota');
  return {
    contentType: response.headers.get('content-type') ?? undefined,
    // Stesso cast di `fetchToFile`: il corpo assente è già escluso sopra.
    body: Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
  };
};

/**
 * Apre lo stream di un file di WeBeep senza scaricarlo su disco. Accetta solo URL di
 * WeBeep. Il token si aggiunge solo ai file protetti e non esce da questa funzione:
 * chi riceve lo stream vede solo il contenuto e il Content-Type.
 */
export const openWebeepFile = async (fileUrl: string): Promise<WebeepFileStream> =>
  toWebeepFileStream(await requestWebeepFile(fileUrl));

/** Risposta di un'immagine di WeBeep (copertina, avatar, icona), da restituire al protocollo `webeep-asset://`. */
export const fetchWebeepImage = async (fileUrl: string): Promise<Response> =>
  requireImage(await requestWebeepFile(fileUrl));

/** Come `openWebeepFile`, ma rifiuta le risposte che non sono immagini. */
export const openWebeepImage = async (fileUrl: string): Promise<WebeepFileStream> =>
  toWebeepFileStream(await fetchWebeepImage(fileUrl));

export const revealFile = (path: string): void => shell.showItemInFolder(path);
