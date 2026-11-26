/*
 * Pagine del corso (`mod_page`) per la vista di lettura.
 *
 * Il token Moodle non esce da qui: l'HTML e gli URL dei file che tornano al renderer
 * non devono contenere `token` o `wstoken`. L'HTML resta una stringa: il renderer non
 * lo inietta mai, lo interpreta con una whitelist.
 */
import { getPages, toCoursePage } from '@webeep/moodle-api';
import { z } from 'zod';
import type { CoursePage, CoursePageRequest } from '../shared/ipc.js';
import { withClient } from './auth.js';

const INVALID_REQUEST_MESSAGE = 'Richiesta di pagina non valida';
const PAGE_NOT_FOUND_MESSAGE = 'Pagina non trovata in questo corso';

/** Il modulo richiesto non è una pagina del corso, o l'input non è valido. */
export class InvalidPageRequestError extends Error {
  override readonly name = 'InvalidPageRequestError';
}

const pageRequestSchema = z.object({
  courseId: z.number().int().positive(),
  moduleId: z.number().int().positive(),
});

/** Chiamato dal canale `course:page`: gli argomenti arrivano dal renderer non tipizzati, quindi si validano qui. */
export const getCoursePage = async (request: CoursePageRequest): Promise<CoursePage> => {
  const parsed = pageRequestSchema.safeParse(request);
  if (!parsed.success) throw new InvalidPageRequestError(INVALID_REQUEST_MESSAGE);
  const { courseId, moduleId } = parsed.data;
  const pages = await withClient((client) => getPages(client, [courseId]));
  const page = pages.find((item) => item.coursemodule === moduleId);
  if (!page) throw new InvalidPageRequestError(PAGE_NOT_FOUND_MESSAGE);
  return toCoursePage(page);
};
