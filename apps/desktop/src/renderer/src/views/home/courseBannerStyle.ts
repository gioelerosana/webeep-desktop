/*
 * Immagine di copertina di un corso. Moodle manda due forme: il file caricato dal docente
 * (URL pluginfile di WeBeep, da servire via `webeep-asset://` perché serve il token) oppure
 * un SVG generato da Moodle per i corsi senza immagine (data URI). L'SVG dentro un <img> non
 * esegue script e la CSP consente `data:` per le immagini, quindi lo si usa così com'è.
 */

const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;';
const DATA_URI_PREFIX = 'data:';

/*
 * Sfondi di ripiego dai token del design system. Un corso ne pesca sempre lo stesso in base
 * al proprio id, così la Home non cambia colore a ogni caricamento.
 */
const FALLBACK_GRADIENTS = [
  'bg-linear-to-br from-primary/30 to-info/10',
  'bg-linear-to-br from-info/25 to-accent',
  'bg-linear-to-br from-muted-foreground/20 to-accent',
] as const;

/** Sorgente per l'`<img>` della copertina, o `undefined` se il corso non ha un'immagine utilizzabile. */
export const bannerSourceOf = (
  courseimage: string | undefined,
  assetUrlOf: (fileUrl: string) => string,
): string | undefined => {
  if (!courseimage) return undefined;
  if (courseimage.startsWith(SVG_DATA_URI_PREFIX)) return courseimage;
  // Gli altri data URI (raster inline) non si accettano: il main li rifiuterebbe comunque.
  if (courseimage.startsWith(DATA_URI_PREFIX)) return undefined;
  return assetUrlOf(courseimage);
};

/** Classi dello sfondo di ripiego del corso. */
export const fallbackGradientOf = (courseId: number): string => {
  const index = courseId % FALLBACK_GRADIENTS.length;
  return FALLBACK_GRADIENTS[index] ?? FALLBACK_GRADIENTS[0];
};
