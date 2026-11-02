/*
 * Modalità diagnostica (`WEBEEP_DIAGNOSE=1`, script `pnpm diagnose`).
 *
 * Al posto della finestra: verifica la sessione salvata, chiama le funzioni Moodle
 * che usa la vista corso e stampa esiti e conteggi. Non stampa mai il token né dati
 * personali: solo nomi di funzione, esiti, classi d'errore, conteggi e, per gli
 * errori di forma, il percorso zod che fallisce e il TIPO del valore reale.
 *
 * Con `WEBEEP_DIAGNOSE_COURSE=<nome>` (sottostringa, senza distinzione di maiuscole)
 * stampa anche la struttura dei corsi che corrispondono: sezioni, moduli, tipi e nomi
 * di file, percorso degli URL interni e solo il dominio di quelli esterni. Di description,
 * content e file non esce mai il contenuto, solo lunghezze e presenza.
 *
 * Il corpo grezzo della risposta resta in memoria, solo per leggerne i tipi.
 *
 * Con `WEBEEP_DIAGNOSE_FUNCTIONS=1` stampa le funzioni WS dichiarate dal sito, filtrate per
 * prefisso. Con `WEBEEP_DIAGNOSE_COURSE` chiama anche, in sola lettura, le funzioni WS di forum,
 * consegne, voti, completamento, quiz, libri, calendario e messaggi, stampando per ognuna esito
 * e struttura (chiavi di primo e secondo livello, tipi, conteggi). Il post di un forum si legge
 * solo con `WEBEEP_DIAGNOSE_FORUM_POSTS=1`: Moodle lo segna come letto sul sito.
 *
 * Con `WEBEEP_DIAGNOSE_SEARCH=<testo>` sonda la ricerca di corsi (`core_course_search_courses`):
 * forma della risposta, corsi trovati non iscritti e, per il primo, esito di contenuti e metodi
 * di iscrizione. Sola lettura; il testo di ricerca non è dato personale.
 *
 * I pezzi stanno nei moduli accanto: `env.ts` (variabili e funzioni WS), `inspect.ts`
 * (esiti, errori, struttura), `courses.ts` (contenuti e WS del corso), `search.ts` (ricerca).
 */
import { getCourseContents, getCourses } from '@webeep/moodle-api';
import { getAuthState } from '../auth.js';
import { type CourseContentsProbe, inspectDetail } from './courses.js';
import { FUNCTIONS_ENV_VAR, isEnvFlagOn, log, readCourseFilter, readEnvText, SEARCH_ENV_VAR } from './env.js';
import { type Outcome, printOutcome, probe, summarizeCourses, summarizeSections } from './inspect.js';
import { inspectSearch } from './search.js';

export { isDiagnoseMode } from './env.js';

/** Esegue la diagnosi e stampa il risultato. Ritorna `true` se tutte le chiamate sono riuscite. */
export const runDiagnosis = async (): Promise<boolean> => {
  const session = getAuthState();
  if (session.status !== 'signed-in') {
    log('sessione: assente o scaduta, fai il login nell\'app e riprova');
    return false;
  }
  log('sessione: ok');

  const inProgressName = 'core_course_get_enrolled_courses_by_timeline_classification [inprogress]';
  const allName = 'core_course_get_enrolled_courses_by_timeline_classification [all]';
  const inProgress = await probe(inProgressName, (client) => getCourses(client, 'inprogress'), summarizeCourses);
  const all = await probe(allName, (client) => getCourses(client, 'all'), summarizeCourses);

  const courses = all.result ?? [];
  const contentProbes: readonly CourseContentsProbe[] = await Promise.all(
    courses.map(async (course, index) => ({
      course,
      outcome: await probe(
        `core_course_get_contents (corso ${index + 1}/${courses.length})`,
        (client) => getCourseContents(client, course.id),
        summarizeSections,
      ),
    })),
  );

  const outcomes: readonly Outcome<unknown>[] = [inProgress, all, ...contentProbes.map(({ outcome }) => outcome)];
  const results = outcomes.map(printOutcome);
  const filter = readCourseFilter();
  const functionsRequested = isEnvFlagOn(FUNCTIONS_ENV_VAR);
  const detailResults =
    filter === undefined && !functionsRequested ? [] : await inspectDetail(contentProbes, filter, functionsRequested);
  const searchText = readEnvText(SEARCH_ENV_VAR);
  const searchResults = searchText === undefined ? [] : await inspectSearch(searchText, all.result);
  const allResults = [...results, ...detailResults, ...searchResults];
  const failed = allResults.filter((ok) => !ok).length;
  log(failed === 0 ? 'esito: tutte le chiamate ok' : `esito: ${failed} chiamate fallite su ${allResults.length}`);
  return failed === 0;
};
