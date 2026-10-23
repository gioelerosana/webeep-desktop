import { useCurrentUser } from '../../layout/useCurrentUser';

/**
 * Pagina del corso su WeBeep, da aprire nel browser. Vale anche per i corsi a cui
 * l'utente non è iscritto: l'app non la legge, la apre soltanto. `undefined` senza sessione.
 */
export const useCourseViewUrl = (courseId: number): string | undefined => {
  const user = useCurrentUser();
  return user ? `${user.siteurl}/course/view.php?id=${courseId}` : undefined;
};
