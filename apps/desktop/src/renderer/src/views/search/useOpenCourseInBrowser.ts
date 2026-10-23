import { useState } from 'react';
import { openExternal } from '../../lib/queries';

export type OpenCourseInBrowser = {
  readonly openInBrowser: () => void;
  /** L'ultimo tentativo è fallito: la vista mostra un messaggio finché l'utente non riprova. */
  readonly isError: boolean;
};

/*
 * Apre la pagina del corso nel browser. L'errore non si perde: resta in vista
 * e finisce in console, come nelle notifiche, per poterlo diagnosticare.
 */
export const useOpenCourseInBrowser = (courseUrl: string | undefined): OpenCourseInBrowser => {
  const [isError, setIsError] = useState(false);

  const open = async (url: string): Promise<void> => {
    try {
      await openExternal(url);
      setIsError(false);
    } catch (error) {
      console.error('Impossibile aprire la pagina del corso', error);
      setIsError(true);
    }
  };

  return {
    openInBrowser: () => {
      if (courseUrl) void open(courseUrl);
    },
    isError,
  };
};
