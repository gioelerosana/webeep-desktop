import { cn } from '@webeep/ui-kit';
import { useState, type ReactNode } from 'react';

/** Quante parole del nome entrano nelle iniziali. */
const INITIALS_MAX_WORDS = 2;
const AVATAR_CLASSES = 'size-7 shrink-0 rounded-full';

const initialsOf = (fullname: string): string =>
  fullname
    .split(' ')
    .filter(Boolean)
    .slice(0, INITIALS_MAX_WORDS)
    .map((word) => word.charAt(0).toLocaleUpperCase('it-IT'))
    .join('');

export type UserAvatarProps = {
  readonly fullname: string;
  /** URL di WeBeep dell'immagine profilo; vuoto se l'utente non ne ha una. */
  readonly pictureUrl: string;
};

/** Foto profilo passata dal main come `webeep-asset://`; se manca o non carica, le iniziali. */
export const UserAvatar = ({ fullname, pictureUrl }: UserAvatarProps): ReactNode => {
  const [failed, setFailed] = useState(false);
  if (pictureUrl && !failed) {
    return (
      <img
        src={window.webeep.assetUrl(pictureUrl)}
        alt=""
        onError={() => setFailed(true)}
        className={cn(AVATAR_CLASSES, 'object-cover')}
      />
    );
  }
  return (
    <span aria-hidden className={cn(AVATAR_CLASSES, 'flex items-center justify-center bg-accent text-2xs font-medium')}>
      {initialsOf(fullname)}
    </span>
  );
};
