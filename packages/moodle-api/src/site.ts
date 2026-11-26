/*
 * Il sito di WeBeep: l'unico host a cui l'app parla e da cui accetta file.
 * Sta in un modulo a parte perché `files.ts` lo usa e `index.ts` lo riesporta (niente import circolari).
 */
export const WEBEEP_SITE_URL = 'https://webeep.polimi.it';
