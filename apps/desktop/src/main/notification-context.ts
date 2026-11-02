/*
 * Contesto di una notifica: dal `cmid` (l'id del modulo nel corso, quello che
 * compare nella `contexturl` della notifica) al corso che lo contiene, così il
 * renderer può aprire la risorsa dentro l'app invece che nel browser.
 *
 * Se WeBeep non sa rispondere (funzione non disponibile sul sito, non
 * autorizzata, risposta malformata) si restituisce `null`: la notifica resta
 * leggibile e il renderer ripiega su "Apri su WeBeep". Un contesto non
 * risolvibile non deve far fallire l'elenco delle notifiche.
 *
 * Sola lettura: qui non si scrive nulla sul sito e il token non esce da questo
 * processo (l'URL che torna al renderer passa da `stripAuthTokens`).
 */
import {
  getCourseModule,
  MoodleApiError,
  MoodleResponseShapeError,
  type CourseModuleContext,
  type MoodleClient,
} from '@webeep/moodle-api';
import { z } from 'zod';
import { InvalidPageRequestError, stripAuthTokens } from './pages.js';

const LOG_PREFIX = 'Contesto notifica:';
const INVALID_CALLER_MESSAGE = 'Id del modulo non valido';
/* Alternativa all'`errorcode` di Moodle quando la risposta è malformata: il log resta leggibile e non ambiguo. */
const SHAPE_FAILURE_CODE = 'risposta-inattesa';

/* `cmid` arriva dal renderer, che non è fidato: intero positivo, come gli altri id del contratto. */
const cmidSchema = z.number().int().positive();

/**
 * Codice per il log. Solo `errorcode` di Moodle o un'etichetta fissa: il
 * messaggio completo può contenere URL con query string (e quindi il token) e
 * non va mai scritto.
 */
const safeErrorCode = (error: MoodleApiError | MoodleResponseShapeError): string =>
  error instanceof MoodleApiError ? error.errorCode : SHAPE_FAILURE_CODE;

/** Il renderer riceve l'URL così com'è: se WeBeep ci mettesse un token, va tolto qui (AGENTS.md, regola 1). */
const withSafeUrl = (module: CourseModuleContext): CourseModuleContext =>
  module.url === undefined ? module : { ...module, url: stripAuthTokens(module.url) };

/**
 * Chiamato dal canale `moodle:course-module`. `null` significa "contesto non
 * risolvibile": il renderer ripiega su "Apri su WeBeep".
 *
 * `InvalidPageRequestError` è l'errore di input non valido già mappato su
 * `invalid-input` in `handlers.ts`: si riusa invece di aggiungere una classe e
 * una voce nuove alla tendina di `toFailure`.
 */
export const resolveCourseModule = async (
  client: MoodleClient,
  cmid: number,
): Promise<CourseModuleContext | null> => {
  if (!cmidSchema.safeParse(cmid).success) throw new InvalidPageRequestError(INVALID_CALLER_MESSAGE);
  try {
    return withSafeUrl(await getCourseModule(client, cmid));
  } catch (error) {
    // Degrado voluto, non silenzioso: un modulo non risolvibile non deve far fallire la vista
    // delle notifiche, ma resta una riga di log per capire perché. Gli errori di rete restano
    // errori (la rete giù è un problema vero, da mostrare all'utente).
    if (!(error instanceof MoodleApiError || error instanceof MoodleResponseShapeError)) throw error;
    console.warn(`${LOG_PREFIX} contesto non risolvibile per il modulo ${cmid} (${safeErrorCode(error)})`);
    return null;
  }
};
