/*
 * Riconoscimento degli URL dentro l'HTML di WeBeep. Href e src relativi (`/mod/…`,
 * `../file.pdf`, `//host/…`) si risolvono rispetto al sito; dopo la risoluzione vale
 * solo http(s): `javascript:`, `data:` e `mailto:` non diventano link.
 */
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';

export const WEBEEP_HOST = new URL(WEBEEP_SITE_URL).hostname;
const PLUGINFILE_SEGMENT = 'pluginfile.php';
const FALLBACK_FILE_NAME = 'file';
const HTTP_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/**
 * URL http(s) assoluto risolto rispetto al sito WeBeep, oppure `undefined`.
 * `new URL` normalizza schema e spazi: `  JavaScript:…` arriva come `javascript:` e viene scartato.
 */
export const parseHttpUrl = (href: string): URL | undefined => {
  try {
    const url = new URL(href, WEBEEP_SITE_URL);
    return HTTP_PROTOCOLS.includes(url.protocol) ? url : undefined;
  } catch {
    // Un `href` che il parser non accetta (es. con `[` non chiuso) non è un link: il chiamante lo mostra come testo.
    return undefined;
  }
};

/** File protetto di WeBeep: il percorso ha il segmento `pluginfile.php` (anche `/webservice/pluginfile.php/…`). */
export const isWebeepPluginFile = (url: URL): boolean =>
  url.hostname === WEBEEP_HOST && url.pathname.split('/').includes(PLUGINFILE_SEGMENT);

/** Un segmento di percorso con `%20` e simili: se la codifica è rotta si mostra il segmento così com'è. */
const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/** Nome del file dall'ultimo segmento del percorso decodificato: "/…/Lezione%201.pdf" → "Lezione 1.pdf". */
export const fileNameOf = (url: URL): string => {
  const decoded = decodeSegment(url.pathname.split('/').at(-1) ?? '');
  return decoded === '' ? FALLBACK_FILE_NAME : decoded;
};
