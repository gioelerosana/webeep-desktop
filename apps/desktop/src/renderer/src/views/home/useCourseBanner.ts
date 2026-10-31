import { useState } from 'react';
import { bannerSourceOf } from './courseBanner';

export type CourseBannerState = {
  /** Sorgente dell'immagine; `undefined` quando va mostrato il ripiego. */
  readonly src: string | undefined;
  readonly onError: () => void;
};

/*
 * Se l'immagine non si carica, si ricorda la sorgente che ha fallito: il ripiego resta finché
 * la sorgente non cambia, senza bisogno di azzerare lo stato a mano.
 */
export const useCourseBanner = (courseimage: string | undefined): CourseBannerState => {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const source = bannerSourceOf(courseimage, (fileUrl) => window.webeep.assetUrl(fileUrl));
  const src = source === undefined || source === failedSrc ? undefined : source;
  return { src, onError: () => setFailedSrc(source) };
};
