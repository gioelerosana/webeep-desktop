import type { ReactNode } from 'react';
import { isWebeepPluginFile, parseHttpUrl } from './richUrl';

export type RichImageProps = {
  readonly src: string | undefined;
  readonly alt: string | undefined;
};

/** Solo le immagini dei file di WeBeep si caricano (via `webeep-asset://`); le altre diventano il testo alternativo. */
export const RichImage = ({ src, alt }: RichImageProps): ReactNode => {
  const url = src === undefined ? undefined : parseHttpUrl(src);
  if (url !== undefined && isWebeepPluginFile(url)) {
    return <img src={window.webeep.assetUrl(url.href)} alt={alt ?? ''} loading="lazy" className="my-3 h-auto max-w-full rounded-lg" />;
  }
  return alt ? <span className="text-muted-foreground">{alt}</span> : null;
};
