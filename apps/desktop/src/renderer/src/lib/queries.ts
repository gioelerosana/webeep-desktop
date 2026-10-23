/*
 * Hook dati del renderer (TanStack Query). Le viste usano SOLO questi hook,
 * mai `invoke` diretto per leggere dati: così cache, chiavi e invalidazioni
 * stanno in un posto solo.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import type {
  CalendarEvent,
  Course,
  CourseSearchPage,
  CourseSearchResult,
  CourseSection,
  CourseTimelineClassification,
  NotificationsPage,
} from '@webeep/moodle-api';
import {
  COURSE_SEARCH_MAX_QUERY_LENGTH,
  COURSE_SEARCH_MIN_QUERY_LENGTH,
  type AuthState,
  type CoursePage,
  type DownloadResult,
  type FileRequest,
  type Settings,
} from '../../../shared/ipc';
import { invoke } from './ipc';

export const queryKeys = {
  auth: ['auth'] as const,
  courses: (classification: CourseTimelineClassification) => ['courses', classification] as const,
  courseContents: (courseId: number) => ['course-contents', courseId] as const,
  courseSearch: (query: string) => ['course-search', query] as const,
  coursePage: (courseId: number, moduleId: number) => ['course-page', courseId, moduleId] as const,
  upcomingEvents: ['upcoming-events'] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
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

export const useCourseContents = (courseId: number): UseQueryResult<readonly CourseSection[]> =>
  useQuery({ queryKey: queryKeys.courseContents(courseId), queryFn: () => invoke('moodle:course-contents', courseId) });

/** Contenuto di una pagina (`mod_page`): l'HTML è una stringa, da mostrare come testo e mai iniettare. */
export const useCoursePage = (courseId: number, moduleId: number): UseQueryResult<CoursePage> =>
  useQuery({
    queryKey: queryKeys.coursePage(courseId, moduleId),
    queryFn: () => invoke('course:page', { courseId, moduleId }),
  });

/** Corso trovato nella ricerca. `enrolled` dice se è tra i corsi a cui l'utente è iscritto. */
export type CourseSearchHit = CourseSearchResult & { readonly enrolled: boolean };

export type CourseSearchHitsPage = {
  readonly total: number;
  readonly courses: readonly CourseSearchHit[];
};

const useEnrolledCourseIds = (): ReadonlySet<number> => {
  const allCourses = useCourses('all');
  return useMemo(() => new Set((allCourses.data ?? []).map((course) => course.id)), [allCourses.data]);
};

const isSearchableQuery = (query: string): boolean =>
  query.length >= COURSE_SEARCH_MIN_QUERY_LENGTH && query.length <= COURSE_SEARCH_MAX_QUERY_LENGTH;

/**
 * Ricerca nel catalogo, a pagine (il main ne decide la dimensione). Il testo è
 * pulito con `trim` e la query parte solo se la lunghezza è valida: il debounce
 * sta nella vista, non qui. I risultati sono arricchiti con `enrolled` quando
 * arriva l'elenco dei corsi iscritti.
 */
export const useCourseSearch = (query: string): UseInfiniteQueryResult<InfiniteData<CourseSearchHitsPage>, Error> => {
  const normalizedQuery = query.trim();
  const enrolledIds = useEnrolledCourseIds();
  const markEnrolled = useCallback(
    (data: InfiniteData<CourseSearchPage>): InfiniteData<CourseSearchHitsPage> => ({
      pageParams: data.pageParams,
      pages: data.pages.map((page) => ({
        total: page.total,
        courses: page.courses.map((course) => ({ ...course, enrolled: enrolledIds.has(course.id) })),
      })),
    }),
    [enrolledIds],
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
    select: markEnrolled,
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
