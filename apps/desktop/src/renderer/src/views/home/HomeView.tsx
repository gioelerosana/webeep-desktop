import type { ReactNode } from 'react';
import { Page, PageHeader } from '../../layout/Page';
import { useAuthState } from '../../lib/queries';
import { FavouriteCourses } from './FavouriteCourses';
import { formatToday, greetingTitle } from './greeting';
import { RecentNotifications } from './RecentNotifications';
import { UpcomingDeadlines } from './UpcomingDeadlines';

/* Ordine dall'alto: le notifiche sono la sezione principale, poi le scadenze (se ci sono), infine i preferiti. */
export const HomeView = (): ReactNode => {
  const auth = useAuthState();
  const firstname = auth.data?.status === 'signed-in' ? auth.data.user.firstname : undefined;
  return (
    <Page>
      <PageHeader title={greetingTitle(firstname)} description={formatToday(Date.now())} />
      <RecentNotifications />
      <UpcomingDeadlines />
      <FavouriteCourses />
    </Page>
  );
};
