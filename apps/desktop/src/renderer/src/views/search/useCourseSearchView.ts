import { useMemo, useState } from 'react';
import { COURSE_SEARCH_MIN_QUERY_LENGTH } from '../../../../shared/ipc';
import { useCourseSearch, type CourseSearchHit } from '../../lib/queries';
import { useDebouncedValue } from './useDebouncedValue';

/** Pausa di digitazione prima di cercare: evita una richiesta a ogni tasto. */
const SEARCH_DEBOUNCE_MS = 300;

/** Cosa mostra la vista: una sola fase alla volta, così ogni stato ha il suo rendering. */
export type SearchPhase = 'idle' | 'loading' | 'error' | 'empty' | 'results';

export type CourseSearchView = {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly phase: SearchPhase;
  readonly courses: readonly CourseSearchHit[];
  /** Risultati totali su tutte le pagine, non solo quelli caricati. */
  readonly total: number;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** La pagina successiva è fallita: i risultati già caricati restano visibili. */
  readonly isNextPageError: boolean;
  readonly loadMore: () => void;
  /** Riprova la ricerca quando non ci sono risultati da mostrare. */
  readonly retry: () => void;
};

type PhaseInput = {
  readonly searchable: boolean;
  readonly hasData: boolean;
  readonly isError: boolean;
  readonly total: number;
};

const searchPhaseOf = ({ searchable, hasData, isError, total }: PhaseInput): SearchPhase => {
  if (!searchable) return 'idle';
  if (!hasData) return isError ? 'error' : 'loading';
  if (total === 0) return 'empty';
  return 'results';
};

/** Stato della ricerca: testo digitato, query con debounce, pagine e fase da mostrare. */
export const useCourseSearchView = (): CourseSearchView => {
  const [text, setText] = useState('');
  const debouncedText = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  const search = useCourseSearch(debouncedText);

  const pages = search.data?.pages;
  const courses = useMemo(() => (pages ?? []).flatMap((page) => page.courses), [pages]);
  const total = pages?.[0]?.total ?? 0;
  const phase = searchPhaseOf({
    searchable: debouncedText.trim().length >= COURSE_SEARCH_MIN_QUERY_LENGTH,
    hasData: pages !== undefined,
    isError: search.isError,
    total,
  });

  return {
    text,
    setText,
    phase,
    courses,
    total,
    hasNextPage: search.hasNextPage,
    isFetchingNextPage: search.isFetchingNextPage,
    isNextPageError: search.isFetchNextPageError,
    loadMore: () => void search.fetchNextPage(),
    retry: () => void search.refetch(),
  };
};
