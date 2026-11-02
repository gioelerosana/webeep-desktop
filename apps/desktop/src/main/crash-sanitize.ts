/*
 * Oscuramento dei testi del crash report (la parte di sicurezza).
 *
 * Il report finisce in un'issue pubblica su GitHub: prima di salvarlo ogni testo
 * passa da `sanitizeCrashText`. Non devono uscire token, parametri di query, né
 * il percorso della home dell'utente.
 *
 * Qui stanno anche i limiti di lunghezza e il taglio per caratteri: si taglia
 * per code point, non per unità UTF-16, altrimenti una coppia surrogata spezzata
 * renderebbe il testo illeggibile e farebbe fallire `encodeURIComponent`.
 */
import { homedir } from 'node:os';

const REDACTED = '[rimosso]';
const HOME_PLACEHOLDER = '~';

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_TITLE_MESSAGE_LENGTH = 80;
export const MAX_STACK_LENGTH = 4000;
/* Limiti in code point, come nel renderer che tronca per caratteri: un'emoji vale due unità UTF-16 ma è un solo carattere, e non deve far scartare l'errore. Più lungo di così è anomalo: si rifiuta invece di salvarlo a metà. */
export const MAX_RENDERER_MESSAGE_LENGTH = 2000;
export const MAX_RENDERER_STACK_LENGTH = 20000;
/** Limite prudenziale per l'URL del modulo: oltre, i browser e GitHub possono troncarlo o rifiutarlo. */
export const MAX_ISSUE_URL_LENGTH = 7000;
/** A ogni passo lo stack si accorcia di questa frazione, finché l'URL entra nel limite. */
export const STACK_SHRINK_RATIO = 0.8;

// Parametri di query degli URL: si tiene il percorso e si toglie tutto da `?` in poi.
// Accetta: "https://webeep.polimi.it/mod/page/view.php?id=1&wstoken=abc123" → "https://webeep.polimi.it/mod/page/view.php"
// Non accetta: "https://webeep.polimi.it/course/view.php" (senza `?` non cambia).
// https://regex101.com/?regex=(%5Cbhttps%3F%3A%5C%2F%5C%2F%5B%5E%5Cs'%22%3C%3E%3F%23%5D%2B)%5C%3F%5B%5E%5Cs'%22%3C%3E%23%5D*&testString=errore%20su%20https%3A%2F%2Fwebeep.polimi.it%2Fmod%2Fpage%2Fview.php%3Fid%3D1%26wstoken%3Dabc123%20fine%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fcourse%2Fview.php&flavor=javascript&flags=g
const URL_QUERY = /(\bhttps?:\/\/[^\s'"<>?#]+)\?[^\s'"<>#]*/g;
// Token e parametri sensibili anche fuori da un URL, in forma `chiave=valore` o JSON `"chiave":"valore"`.
// Il valore si oscura, la forma resta: "wstoken=abc" → "wstoken=[rimosso]", "\"token\":\"7\"" → "\"token\":\"[rimosso]\"".
// Accetta: "wstoken=abc", "privatetoken=xyz", "access_token=q", "token=7", "\"wstoken\":\"abc\"".
// Non accetta: "tokenizer=1" e "tokenx":"1" (dopo `token` non c'è `=` né `":"`).
// https://regex101.com/?regex=%5Cb((%3F%3Aaccess_)%3F(%3F%3Awstoken%7Cprivatetoken%7Ctoken))(%22%5Cs*%3A%5Cs*%22%7C%3D)%5B%5E%5Cs%26'%22%3C%3E%5D%2B&testString=wstoken%3Dabc%26privatetoken%3Dxyz%20tokenizer%3D1%20token%3D7%20access_token%3Dzzz%20%7B%22wstoken%22%3A%22abc123%22%2C%22token%22%3A%20%227%22%7D&flavor=javascript&flags=gi
const SECRET_PARAM = /\b((?:access_)?(?:wstoken|privatetoken|token))("\s*:\s*"|=)[^\s&'"<>]+/gi;
// Stringhe esadecimali di almeno 32 caratteri, come il token Moodle (un md5).
// Accetta: "a1b2c3d4e5f60718293a4b5c6d7e8f90" → "[rimosso]". Non accetta: "a1b2c3" (troppo corta).
// https://regex101.com/?regex=%5B0-9a-f%5D%7B32%2C%7D&testString=a1b2c3d4e5f60718293a4b5c6d7e8f90%20e%20poi%20a1b2c3&flavor=javascript&flags=gi
const LONG_HEX = /[0-9a-f]{32,}/gi;

export const countCodePoints = (text: string): number => Array.from(text).length;

/* La home è un percorso lungo e personale: se è vuota, `split('')` spezzerebbe ogni carattere, quindi non si tocca. */
const hideHomeDirectory = (text: string): string => {
  const home = homedir();
  return home ? text.split(home).join(HOME_PLACEHOLDER) : text;
};

/** Oscura token, parametri di query e percorso della home. Funzione pura: stesso input, stesso output. */
export const sanitizeCrashText = (text: string): string =>
  hideHomeDirectory(text)
    .replace(URL_QUERY, '$1')
    .replace(SECRET_PARAM, `$1$2${REDACTED}`)
    .replace(LONG_HEX, REDACTED);

/* Si taglia per caratteri, non per unità di codice: un taglio dentro una coppia surrogata renderebbe il testo illeggibile e farebbe fallire `encodeURIComponent`. */
export const truncate = (text: string, maxLength: number): string => {
  const characters = Array.from(text);
  return characters.length > maxLength ? characters.slice(0, maxLength).join('') : text;
};
