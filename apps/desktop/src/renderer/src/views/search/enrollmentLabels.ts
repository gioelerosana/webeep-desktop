/*
 * Metodi di iscrizione Moodle tradotti per l'interfaccia. I metodi sconosciuti
 * non si mostrano: meglio nessuna etichetta che una sigla tecnica.
 */
const ENROLLMENT_LABELS: ReadonlyMap<string, string> = new Map<string, string>([
  ['self', 'Autoiscrizione disponibile'],
  ['manual', 'Iscrizione gestita dal docente'],
  ['cohort', 'Iscrizione per coorte'],
  ['guest', 'Accesso come ospite'],
]);

/** "self" → "Autoiscrizione disponibile"; i metodi senza etichetta sono scartati. */
export const enrollmentLabelsOf = (methods: readonly string[]): readonly string[] =>
  methods.flatMap((method) => {
    const label = ENROLLMENT_LABELS.get(method);
    return label ? [label] : [];
  });
