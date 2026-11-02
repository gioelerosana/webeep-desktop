import { formatDateTimeFromIso } from '../../lib/format';

/** Istante ISO 8601 dell'ultimo controllo, in formato breve: "4 nov, 14:30". */
export const formatLastCheck = (isoDate: string): string => formatDateTimeFromIso(isoDate);
