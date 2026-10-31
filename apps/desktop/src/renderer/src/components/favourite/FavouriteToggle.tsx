/*
 * Pulsante a stella per mettere o togliere un corso dai preferiti di WeBeep. Il colore
 * `warning` è lo stesso della stella in sidebar. Il nome accessibile è fisso ("preferito")
 * e lo stato lo dice `aria-pressed`; il tooltip (`title`) dice l'azione che il click compie.
 */
import { Button, cn, type ButtonSize } from '@webeep/ui-kit';
import { Star } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useFavouriteToggle } from './useFavouriteToggle';

export type FavouriteToggleProps = {
  readonly courseId: number;
  readonly isFavourite: boolean;
  readonly size?: ButtonSize;
};

const ACCESSIBLE_NAME = 'preferito';
const ADD_ACTION = 'aggiungi ai preferiti';
const REMOVE_ACTION = 'togli dai preferiti';
const ERROR_TEXT = 'Impossibile aggiornare i preferiti';

export const FavouriteToggle = ({ courseId, isFavourite, size = 'icon' }: FavouriteToggleProps): ReactNode => {
  const { pending, failed, toggle } = useFavouriteToggle(courseId, isFavourite);
  const action = isFavourite ? REMOVE_ACTION : ADD_ACTION;

  // Oggi la stella non sta mai dentro un elemento cliccabile: nella Home è accanto al titolo
  // della riga, in pagina corso sta tra le azioni. Lo stop resta come protezione per chi la
  // mette dentro un contenitore cliccabile, così il click non apre anche quello.
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    toggle();
  };

  // La variante ghost impone il tono dell'icona sul solo `svg`: per la stella piena va sovrascritto lì.
  return (
    <>
      <Button
        variant="ghost"
        size={size}
        aria-label={ACCESSIBLE_NAME}
        title={action}
        aria-pressed={isFavourite}
        disabled={pending}
        className={cn(isFavourite && '[&_svg]:text-warning-foreground')}
        icon={<Star aria-hidden fill={isFavourite ? 'currentColor' : 'none'} />}
        onClick={handleClick}
      />
      {failed ? (
        <p role="alert" className="shrink-0 text-xs text-error-foreground">
          {ERROR_TEXT}
        </p>
      ) : null}
    </>
  );
};
