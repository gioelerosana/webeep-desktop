/*
 * Preferiti dei corsi: aggiornamento ottimistico delle liste in cache, stato del
 * cambio in corso e memoria dell'ultimo errore. Stanno qui, e non in `queries.ts`,
 * per tenere insieme tutta la logica della stella senza allungare il file degli hook.
 */
import { useMutation, useMutationState, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { COURSE_TIMELINE_CLASSIFICATIONS, type Course, type CourseTimelineClassification } from '@webeep/moodle-api';
import type { CourseFavouriteRequest } from '../../../shared/ipc';
import { invoke } from './ipc';
import { queryKeys } from './queryKeys';

/** Una lista di corsi in cache, com'era prima di un cambio di preferito. */
type CachedCourses = {
  readonly classification: CourseTimelineClassification;
  readonly courses: readonly Course[] | undefined;
};

type CourseFavouriteSnapshot = { readonly previous: readonly CachedCourses[] };

/*
 * Come cambia una lista in cache quando un corso passa o esce dai preferiti. Nella lista
 * "preferiti" il corso entra o esce; nelle altre resta, col flag aggiornato. `knownCourse`
 * (il corso preso da un'altra lista) serve per aggiungerlo ai preferiti.
 */
const applyFavouriteToList = (
  classification: CourseTimelineClassification,
  courses: readonly Course[],
  request: CourseFavouriteRequest,
  knownCourse: Course | undefined,
): readonly Course[] => {
  const { courseId, favourite } = request;
  if (classification !== 'favourites') {
    return courses.map((course) => (course.id === courseId ? { ...course, isfavourite: favourite } : course));
  }
  if (!favourite) return courses.filter((course) => course.id !== courseId);
  const alreadyListed = courses.some((course) => course.id === courseId);
  if (alreadyListed || !knownCourse) return courses;
  return [...courses, { ...knownCourse, isfavourite: true }];
};

/**
 * Mette o toglie un corso dai preferiti. Le liste in cache cambiano subito (aggiornamento
 * ottimistico); se il main rifiuta, tornano come prima. A fine chiamata si rilegge tutto
 * da WeBeep, così l'ordine e il contenuto sono quelli veri.
 */
export const useSetCourseFavourite = (): UseMutationResult<null, Error, CourseFavouriteRequest, CourseFavouriteSnapshot> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.courseFavourite,
    mutationFn: (request: CourseFavouriteRequest) => invoke('moodle:set-course-favourite', request),
    onMutate: async (request) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.coursesRoot });
      const previous = COURSE_TIMELINE_CLASSIFICATIONS.map((classification) => ({
        classification,
        courses: queryClient.getQueryData<readonly Course[]>(queryKeys.courses(classification)),
      }));
      const knownCourse = previous
        .flatMap(({ courses }) => courses ?? [])
        .find((course) => course.id === request.courseId);
      previous.forEach(({ classification, courses }) => {
        if (!courses) return;
        queryClient.setQueryData(
          queryKeys.courses(classification),
          applyFavouriteToList(classification, courses, request, knownCourse),
        );
      });
      return { previous };
    },
    onError: (_error, _request, snapshot) => {
      snapshot?.previous.forEach(({ classification, courses }) => {
        if (courses) queryClient.setQueryData(queryKeys.courses(classification), courses);
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.coursesRoot }),
  });
};

const isFavouriteRequestFor = (variables: unknown, courseId: number): boolean =>
  typeof variables === 'object' && variables !== null && 'courseId' in variables && variables.courseId === courseId;

/** Vero mentre il cambio di preferito di quel corso è in corso: per disabilitare il pulsante della stella. */
export const useCourseFavouritePending = (courseId: number): boolean => {
  const pendingVariables = useMutationState({
    filters: { mutationKey: queryKeys.courseFavourite, status: 'pending' },
    select: (mutation) => mutation.state.variables,
  });
  return pendingVariables.some((variables) => isFavouriteRequestFor(variables, courseId));
};

/*
 * Per quanto un errore di cambio preferito resta da mostrare quando la stella viene rimontata
 * (es. la riga torna nella Home dopo il rollback). La cache delle mutation tiene l'esito per
 * 5 minuti: senza questo limite un errore vecchio riapparirebbe.
 */
const FAVOURITE_ERROR_VISIBLE_MS = 30_000;

type FavouriteAttempt = {
  readonly variables: unknown;
  readonly failed: boolean;
  readonly submittedAt: number;
};

/*
 * Vero se l'ultimo tentativo su quel corso è fallito da poco. Conta solo l'ultima mutation: un
 * tentativo riuscito dopo quello fallito spegne l'errore. Si legge dalla cache delle mutation e
 * non dallo stato locale, perché nella Home la riga esce dalla lista durante il cambio e rientra
 * come componente nuovo.
 */
export const useCourseFavouriteFailed = (courseId: number): boolean => {
  const attempts = useMutationState({
    filters: { mutationKey: queryKeys.courseFavourite },
    select: (mutation): FavouriteAttempt => ({
      variables: mutation.state.variables,
      failed: mutation.state.status === 'error',
      submittedAt: mutation.state.submittedAt,
    }),
  });
  const latest = attempts
    .filter((attempt) => isFavouriteRequestFor(attempt.variables, courseId))
    .reduce<FavouriteAttempt | undefined>(
      (newest, attempt) => (newest === undefined || attempt.submittedAt >= newest.submittedAt ? attempt : newest),
      undefined,
    );
  return latest !== undefined && latest.failed && Date.now() - latest.submittedAt < FAVOURITE_ERROR_VISIBLE_MS;
};
