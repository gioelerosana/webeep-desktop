import { cn } from '@webeep/ui-kit';
import { GraduationCap } from 'lucide-react';
import { useState, type ReactNode } from 'react';

const THUMBNAIL_CLASSES = 'size-10 shrink-0 rounded-md';

export type CourseThumbnailProps = {
  /** Immagine del corso, come URL WeBeep; assente se il corso non ne ha una. */
  readonly imageUrl: string | undefined;
};

/** Immagine del corso passata dal main come `webeep-asset://`; se manca o non carica, un segnaposto. */
export const CourseThumbnail = ({ imageUrl }: CourseThumbnailProps): ReactNode => {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <img
        src={window.webeep.assetUrl(imageUrl)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(THUMBNAIL_CLASSES, 'object-cover')}
      />
    );
  }
  return (
    <span aria-hidden className={cn(THUMBNAIL_CLASSES, 'flex items-center justify-center bg-accent text-muted-foreground')}>
      <GraduationCap className="size-4" />
    </span>
  );
};
