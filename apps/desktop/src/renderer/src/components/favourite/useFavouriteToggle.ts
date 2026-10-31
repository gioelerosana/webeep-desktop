import { useCourseFavouriteFailed, useCourseFavouritePending, useSetCourseFavourite } from '../../lib/queries';

export type FavouriteToggleState = {
  /** Il cambio è in corso per questo corso: il pulsante si disabilita. */
  readonly pending: boolean;
  /** L'ultimo tentativo per questo corso è fallito da poco (il preferito è già tornato com'era). */
  readonly failed: boolean;
  readonly toggle: () => void;
};

/*
 * Stato e azione del pulsante preferito di un corso. Il click vale come azione esplicita
 * dell'utente (regola 8 di AGENTS.md): niente dialogo di conferma, perché il cambio è
 * reversibile con un altro click.
 */
export const useFavouriteToggle = (courseId: number, isFavourite: boolean): FavouriteToggleState => {
  const setFavourite = useSetCourseFavourite();
  const pending = useCourseFavouritePending(courseId);
  const failed = useCourseFavouriteFailed(courseId);
  const toggle = (): void => setFavourite.mutate({ courseId, favourite: !isFavourite });
  return { pending, failed, toggle };
};
