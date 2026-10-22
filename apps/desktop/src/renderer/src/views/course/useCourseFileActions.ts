/*
 * Stato delle azioni sui materiali del corso (apri, scarica, mostra, apri link),
 * tenuto per URL: ogni riga mostra solo lo stato del proprio file.
 */
import { useEffect, useRef, useState } from 'react';
import { openExternal, revealFile, useDownloadFile, useOpenFile } from '../../lib/queries';
import { toFileRequest, type DownloadableFile } from './courseContent';

/** Quanto resta visibile l'esito "Scaricato" o "Già aggiornato". */
const SETTLED_STATE_MS = 4_000;
const UNEXPECTED_ERROR = 'errore imprevisto';

export type FileActionState =
  | { readonly status: 'running'; readonly action: 'open' | 'download' }
  | { readonly status: 'downloaded'; readonly path: string }
  | { readonly status: 'up-to-date' }
  | { readonly status: 'failed'; readonly message: string };

export type CourseFileActions = {
  /** Stato dell'ultima azione sul file (o link) identificato dal suo URL. */
  readonly stateOf: (key: string) => FileActionState | undefined;
  readonly open: (file: DownloadableFile, sectionName: string) => void;
  readonly download: (file: DownloadableFile, sectionName: string) => void;
  readonly reveal: (key: string, path: string) => void;
  readonly openLink: (url: string) => void;
};

type FileStates = Readonly<Record<string, FileActionState>>;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : UNEXPECTED_ERROR);

export const useCourseFileActions = (courseName: string): CourseFileActions => {
  const [states, setStates] = useState<FileStates>({});
  const timers = useRef(new Map<string, number>());
  const { mutateAsync: openFileAsync } = useOpenFile();
  const { mutateAsync: downloadFileAsync } = useDownloadFile();

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  /** Imposta lo stato di una chiave; `undefined` lo rimuove. */
  const put = (key: string, state: FileActionState | undefined): void => {
    setStates((previous) => {
      const rest = Object.fromEntries(Object.entries(previous).filter(([entryKey]) => entryKey !== key));
      return state ? { ...rest, [key]: state } : rest;
    });
  };

  const cancelTimer = (key: string): void => {
    const timer = timers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(key);
  };

  /** Esito che si spegne da solo dopo qualche secondo. */
  const putSettled = (key: string, state: FileActionState): void => {
    cancelTimer(key);
    put(key, state);
    const timer = window.setTimeout(() => {
      timers.current.delete(key);
      put(key, undefined);
    }, SETTLED_STATE_MS);
    timers.current.set(key, timer);
  };

  const openItem = async (file: DownloadableFile, sectionName: string): Promise<void> => {
    cancelTimer(file.fileurl);
    put(file.fileurl, { status: 'running', action: 'open' });
    try {
      await openFileAsync(toFileRequest(file, courseName, sectionName));
      put(file.fileurl, undefined);
    } catch (error) {
      put(file.fileurl, { status: 'failed', message: toMessage(error) });
    }
  };

  const downloadItem = async (file: DownloadableFile, sectionName: string): Promise<void> => {
    cancelTimer(file.fileurl);
    put(file.fileurl, { status: 'running', action: 'download' });
    try {
      const result = await downloadFileAsync(toFileRequest(file, courseName, sectionName));
      putSettled(file.fileurl, result.downloaded ? { status: 'downloaded', path: result.path } : { status: 'up-to-date' });
    } catch (error) {
      put(file.fileurl, { status: 'failed', message: toMessage(error) });
    }
  };

  const revealItem = async (key: string, path: string): Promise<void> => {
    try {
      await revealFile(path);
    } catch (error) {
      put(key, { status: 'failed', message: toMessage(error) });
    }
  };

  const openLinkItem = async (url: string): Promise<void> => {
    cancelTimer(url);
    try {
      await openExternal(url);
      put(url, undefined);
    } catch (error) {
      put(url, { status: 'failed', message: toMessage(error) });
    }
  };

  return {
    stateOf: (key) => states[key],
    open: (file, sectionName) => void openItem(file, sectionName),
    download: (file, sectionName) => void downloadItem(file, sectionName),
    reveal: (key, path) => void revealItem(key, path),
    openLink: (url) => void openLinkItem(url),
  };
};
