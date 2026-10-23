import type { ReactNode } from 'react';
import { Page, PageHeader } from '../../layout/Page';
import { useNavigation } from '../../lib/navigation';
import { SearchBody } from './SearchBody';
import { SearchField } from './SearchField';
import { useCourseSearchView } from './useCourseSearchView';

/** Cerca tra tutti i corsi di WeBeep: iscritti (si aprono) e non iscritti (si consultano, mai iscrizione automatica). */
export const SearchView = (): ReactNode => {
  const search = useCourseSearchView();
  const { navigate } = useNavigation();

  return (
    <Page>
      <PageHeader title="Cerca corsi" />
      <SearchField value={search.text} onChange={search.setText} />
      <SearchBody search={search} onOpenCourse={(courseId) => navigate({ name: 'course', courseId })} />
    </Page>
  );
};
