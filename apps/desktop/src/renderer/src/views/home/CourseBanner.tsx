import type { ReactNode } from 'react';
import { CourseBannerFallback } from './CourseBannerFallback';
import { useCourseBanner } from './useCourseBanner';

export type CourseBannerProps = {
  readonly courseId: number;
  /** `courseimage` di Moodle: URL pluginfile di WeBeep, SVG generato da Moodle, o assente. */
  readonly courseimage: string | undefined;
};

/* Banner 16:9 della card corso. Il titolo sta accanto, quindi l'immagine è decorativa (`alt` vuoto). */
export const CourseBanner = ({ courseId, courseimage }: CourseBannerProps): ReactNode => {
  const { src, onError } = useCourseBanner(courseimage);
  return (
    <span className="block aspect-video w-full overflow-hidden bg-accent">
      {src === undefined ? (
        <CourseBannerFallback courseId={courseId} />
      ) : (
        <img src={src} alt="" loading="lazy" onError={onError} className="size-full object-cover" />
      )}
    </span>
  );
};
