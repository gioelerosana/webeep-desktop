/*
 * Hook dati del renderer (TanStack Query). Le viste usano SOLO questi hook,
 * mai `invoke` diretto per leggere dati: così cache, chiavi e invalidazioni
 * stanno in un posto solo.
 */
import {
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import {
  COURSE_TIMELINE_CLASSIFICATIONS,
  type CalendarEvent,
  type Course,
  type CourseSearchPage,
  type CourseSearchResult,
  type CourseSection,
  type CourseTimelineClassification,
  type NotificationsPage,
} from '@webeep/moodle-api';
import {
  COURSE_SEARCH_MAX_QUERY_LENGTH,
  COURSE_SEARCH_MIN_QUERY_LENGTH,
  type AuthState,
  type CourseFavouriteRequest,
  type CoursePage,
  type DownloadResult,
  type FileRequest,
  type Settings,
} from '../../../shared/ipc';
import { invoke } from './ipc';

export const queryKeys = {
  auth: ['auth'] as const,
  courses: (classification: CourseTimelineClassification) => ['courses', classification] as const,
  /** Prefisso di tutte le liste di corsi: invalidarlo le aggiorna tutte. */
  coursesRoot: ['courses'] as const,
  courseContents: (courseId: number) => ['course-contents', courseId] as const,
  courseSearch: (query: string) => ['course-search', query] as const,
  coursePage: (courseId: number, moduleId: number) => ['course-page', courseId, moduleId] as const,
  upcomingEvents: ['upcoming-events'] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  /** Chiave del cambio di preferito: serve a `useCourseFavouritePending` per trovare le mutation in corso. */
  courseFavourite: ['course-favourite'] as const,
};

/** Stato di login, aggiornato anche dagli eventi `auth:changed` del main. */
export const useAuthState = (): UseQueryResult<AuthState> => {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      window.webeep.on('auth:changed', (state) => {
        queryClient.setQueryData(queryKeys.auth, state);
        if (state.status === 'signed-out') queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      }),
    [queryClient],
  );
  return useQuery({ queryKey: queryKeys.auth, queryFn: () => invoke('auth:get-state'), staleTime: Infinity });
};

export const useLogin = (): UseMutationResult<AuthState, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke('auth:login'),
    onSuccess: (state) => queryClient.setQueryData(queryKeys.auth, state),
  });
};

export const useLogout = (): UseMutationResult<AuthState, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke('auth:logout'),
    onSuccess: (state) => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth, state);
    },
  });
};

export const useCourses = (classification: CourseTimelineClassification = 'inprogress'): UseQueryResult<readonly Course[]> =>
  useQuery({ queryKey: queryKeys.courses(classification), queryFn: () => invoke('moodle:courses', classification) });

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

export const useCourseContents = (courseId: number): UseQueryResult<readonly CourseSection[]> =>
  useQuery({ queryKey: queryKeys.courseContents(courseId), queryFn: () => invoke('moodle:course-contents', courseId) });

/** Contenuto di una pagina (`mod_page`): l'HTML è una stringa, da mostrare come testo e mai iniettare. */
export const useCoursePage = (courseId: number, moduleId: number): UseQueryResult<CoursePage> =>
  useQuery({
    queryKey: queryKeys.coursePage(courseId, moduleId),
    queryFn: () => invoke('course:page', { courseId, moduleId }),
  });

/**
 * Stato di iscrizione di un corso trovato. `unknown` finché l'elenco dei corsi
 * iscritti non è arrivato: in quel tempo la riga non sa ancora se aprire o espandere.
 */
export type CourseEnrollment = 'enrolled' | 'not-enrolled' | 'unknown';

/** Corso trovato nella ricerca, con il suo stato di iscrizione. */
export type CourseSearchHit = CourseSearchResult & { readonly enrollment: CourseEnrollment };

export type CourseSearchHitsPage = {
  readonly total: number;
  readonly courses: readonly CourseSearchHit[];
};

/*
 * Legge lo stato di iscrizione dall'elenco dei corsi. Se l'elenco fallisce senza
 * dati precedenti, il corso è trattato come non iscritto: la riga si espande e il
 * dettaglio apre la pagina nel browser, che funziona anche per chi è iscritto.
 * Si perde solo il badge "Iscritto", senza bloccare la riga.
 */
const useEnrollmentOf = (): ((courseId: number) => CourseEnrollment) => {
  const allCourses = useCourses('all');
  const enrolledIds = useMemo(() => new Set((allCourses.data ?? []).map((course) => course.id)), [allCourses.data]);
  return useCallback(
    (courseId: number): CourseEnrollment => {
      if (allCourses.data) return enrolledIds.has(courseId) ? 'enrolled' : 'not-enrolled';
      return allCourses.isError ? 'not-enrolled' : 'unknown';
    },
    [allCourses.data, allCourses.isError, enrolledIds],
  );
};

const isSearchableQuery = (query: string): boolean =>
  query.length >= COURSE_SEARCH_MIN_QUERY_LENGTH && query.length <= COURSE_SEARCH_MAX_QUERY_LENGTH;

/**
 * Ricerca nel catalogo, a pagine (il main ne decide la dimensione). Il testo è
 * pulito con `trim` e la query parte solo se la lunghezza è valida: il debounce
 * sta nella vista, non qui. I risultati sono arricchiti con `enrollment`; finché
 * l'elenco dei corsi iscritti non arriva, lo stato è `unknown`.
 */
export const useCourseSearch = (query: string): UseInfiniteQueryResult<InfiniteData<CourseSearchHitsPage>, Error> => {
  const normalizedQuery = query.trim();
  const enrollmentOf = useEnrollmentOf();
  const markEnrollment = useCallback(
    (data: InfiniteData<CourseSearchPage>): InfiniteData<CourseSearchHitsPage> => ({
      pageParams: data.pageParams,
      pages: data.pages.map((page) => ({
        total: page.total,
        courses: page.courses.map((course) => ({ ...course, enrollment: enrollmentOf(course.id) })),
      })),
    }),
    [enrollmentOf],
  );
  return useInfiniteQuery({
    queryKey: queryKeys.courseSearch(normalizedQuery),
    queryFn: ({ pageParam }) => invoke('moodle:searchCourses', { query: normalizedQuery, page: pageParam }),
    initialPageParam: 0,
    // Si va avanti finché i risultati caricati non raggiungono il totale; una pagina vuota ferma il giro.
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((count, page) => count + page.courses.length, 0);
      return lastPage.courses.length > 0 && loadedCount < lastPage.total ? allPages.length : undefined;
    },
    select: markEnrollment,
    enabled: isSearchableQuery(normalizedQuery),
  });
};

export const useUpcomingEvents = (): UseQueryResult<readonly CalendarEvent[]> =>
  useQuery({ queryKey: queryKeys.upcomingEvents, queryFn: () => invoke('moodle:upcoming-events') });

export const useNotifications = (): UseQueryResult<NotificationsPage> =>
  useQuery({ queryKey: queryKeys.notifications, queryFn: () => invoke('moodle:notifications') });

export const useMarkNotificationRead = (): UseMutationResult<null, Error, number> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => invoke('moodle:mark-notification-read', notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

/** Invalida l'elenco: il contatore dei non letti (sidebar, intestazione) arriva con lo stesso dato. */
export const useMarkAllNotificationsRead = (): UseMutationResult<null, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke('moodle:mark-all-notifications-read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useOpenFile = (): UseMutationResult<null, Error, FileRequest> =>
  useMutation({ mutationFn: (file: FileRequest) => invoke('files:open', file) });

export const useDownloadFile = (): UseMutationResult<DownloadResult, Error, FileRequest> =>
  useMutation({ mutationFn: (file: FileRequest) => invoke('files:download', file) });

export const useSettings = (): UseQueryResult<Settings> =>
  useQuery({ queryKey: queryKeys.settings, queryFn: () => invoke('settings:get'), staleTime: Infinity });

export const useUpdateSettings = (): UseMutationResult<Settings, Error, Partial<Settings>> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => invoke('settings:update', patch),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
};

/** Azioni senza dati in cache: chiamale direttamente. */
export const openExternal = (url: string): Promise<null> => invoke('shell:open-external', url);
export const revealFile = (path: string): Promise<null> => invoke('files:reveal', path);
export const chooseDownloadDir = (): Promise<string | null> => invoke('settings:choose-download-dir');
