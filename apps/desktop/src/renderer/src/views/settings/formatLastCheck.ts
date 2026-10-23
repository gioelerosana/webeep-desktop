const LOCALE = 'it-IT';

const lastCheckFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Istante ISO 8601 dell'ultimo controllo, in formato breve: "4 nov, 14:30". */
export const formatLastCheck = (isoDate: string): string => lastCheckFormatter.format(new Date(isoDate));
