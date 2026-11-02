/*
 * Variabili d'ambiente e funzioni web service della modalità diagnostica
 * (`WEBEEP_DIAGNOSE=1`, script `pnpm diagnose`).
 *
 * Qui stanno anche `log` e `redactTokens`: ogni riga stampata passa da lì, così
 * nessun parametro `token=` può uscire, qualunque sia la sua origine.
 */
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';

export const WEBEEP_ORIGIN = new URL(WEBEEP_SITE_URL).origin;

const DIAGNOSE_ENV_VAR = 'WEBEEP_DIAGNOSE';
const DIAGNOSE_ENABLED_VALUE = '1';
const COURSE_FILTER_ENV_VAR = 'WEBEEP_DIAGNOSE_COURSE';
export const FUNCTIONS_ENV_VAR = 'WEBEEP_DIAGNOSE_FUNCTIONS';
export const FORUM_POSTS_ENV_VAR = 'WEBEEP_DIAGNOSE_FORUM_POSTS';
export const SEARCH_ENV_VAR = 'WEBEEP_DIAGNOSE_SEARCH';

export const SITE_INFO_WS = 'core_webservice_get_site_info';
export const SITE_FUNCTIONS_KEY = 'functions';
export const SITE_FUNCTION_NAME_KEY = 'name';
export const SEARCH_WS = 'core_course_search_courses';
export const ENROL_METHODS_WS = 'core_enrol_get_course_enrolment_methods';
export const USERS_COURSES_WS = 'core_enrol_get_users_courses';

const LOG_PREFIX = '[diagnosi]';
const REDACTED_TOKEN = 'token=<oscurato>';

/**
 * Parametro `token=` (anche dentro `wstoken=`) in query o in testo, qualunque sia la maiuscolatura.
 * Passa: "https://webeep.polimi.it/x?id=1&token=abc". Non passa: "https://webeep.polimi.it/x?id=1".
 * https://regex101.com/?regex=token%3D%5B%5E%26%5Cs%5D*&testString=https%3A%2F%2Fwebeep.polimi.it%2Fx%3Fid%3D1%26token%3Dabc&flags=gi&flavor=javascript
 */
const TOKEN_PARAM_PATTERN = /token=[^&\s]*/gi;

/** Funzioni che l'app potrebbe usare per risorse, link, cartelle, pagine e libri: il sito le dichiara o no. */
export const REQUIRED_WS_FUNCTIONS: readonly string[] = [
  'mod_page_get_pages_by_courses',
  'mod_book_get_books_by_courses',
  'mod_resource_get_resources_by_courses',
  'mod_url_get_urls_by_courses',
  'mod_folder_get_folders_by_courses',
  'core_course_get_module',
  'core_course_get_course_module',
];

/** Aree di funzionalità da esaminare nell'elenco dichiarato dal sito (`WEBEEP_DIAGNOSE_FUNCTIONS`). */
export const FUNCTION_PREFIXES: readonly string[] = [
  'mod_forum_',
  'mod_assign_',
  'gradereport_',
  'core_grades_',
  'core_completion_',
  'mod_quiz_',
  'mod_book_',
  'mod_folder_',
  'mod_resource_',
  'mod_url_',
  'mod_label_',
  'core_calendar_',
  'core_message_',
  'message_',
  'core_course_',
  'mod_lti_',
  'mod_choice_',
  'mod_feedback_',
  'core_block_',
  'tool_mobile_',
  'core_user_',
  'mod_zoom',
  'mod_kalvidres',
];

export const isEnvFlagOn = (name: string): boolean => process.env[name] === DIAGNOSE_ENABLED_VALUE;

export const isDiagnoseMode = (): boolean => isEnvFlagOn(DIAGNOSE_ENV_VAR);

/** Rete di sicurezza: nessuna riga di log esce con un parametro token, qualunque sia la sua origine. */
const redactTokens = (text: string): string => text.replace(TOKEN_PARAM_PATTERN, REDACTED_TOKEN);

export const log = (line: string): void => {
  console.log(`${LOG_PREFIX} ${redactTokens(line)}`);
};

/** Valore di una variabile d'ambiente; vuoto o solo spazi equivale a non impostata. */
export const readEnvText = (name: string): string | undefined => {
  const value = process.env[name]?.trim() ?? '';
  return value === '' ? undefined : value;
};

export const readCourseFilter = (): string | undefined => readEnvText(COURSE_FILTER_ENV_VAR);
