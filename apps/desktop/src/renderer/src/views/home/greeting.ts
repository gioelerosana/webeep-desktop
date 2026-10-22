/*
 * Testi di testata della Home: saluto e data di oggi. Funzioni pure, così il
 * rendering non fa calcoli di formato.
 */

const LOCALE = 'it-IT';
const todayFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** "mercoledì 22 ottobre" */
export const formatToday = (nowMs: number): string => todayFormatter.format(nowMs);

/** "Ciao, Giulia", oppure "Ciao" finché il nome non è noto. */
export const greetingTitle = (firstname: string | undefined): string => (firstname ? `Ciao, ${firstname}` : 'Ciao');
