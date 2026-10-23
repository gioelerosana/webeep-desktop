/*
 * Testi dell'avviso di crash: etichette dei tipi e data. Stanno qui e non nel
 * componente perché la mappa `Record<CrashKind, …>` obbliga a coprire ogni tipo.
 */
import type { CrashKind } from '../../../../shared/ipc';

export const CRASH_KIND_LABELS: Record<CrashKind, string> = {
  'main-exception': 'errore del processo principale',
  'unhandled-rejection': 'operazione non gestita',
  'renderer-gone': 'interfaccia terminata',
  'child-process-gone': 'processo di supporto terminato',
  'renderer-error': "errore dell'interfaccia",
};

const LOCALE = 'it-IT';

const occurredAtFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "4 nov, 14:30": l'istante arriva come ISO 8601 dal main. */
export const formatOccurredAt = (occurredAt: string): string => occurredAtFormatter.format(new Date(occurredAt));
