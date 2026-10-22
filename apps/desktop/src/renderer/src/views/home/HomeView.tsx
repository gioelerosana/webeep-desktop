import type { ReactNode } from 'react';
import { Page, PageHeader } from '../../layout/Page';
import { useAuthState } from '../../lib/queries';
import { formatToday, greetingTitle } from './greeting';
import { RecentNotifications } from './RecentNotifications';
import { UpcomingDeadlines } from './UpcomingDeadlines';

export const HomeView = (): ReactNode => {
  const auth = useAuthState();
  const firstname = auth.data?.status === 'signed-in' ? auth.data.user.firstname : undefined;
  return (
    <Page>
      <PageHeader title={greetingTitle(firstname)} description={formatToday(Date.now())} />
      <UpcomingDeadlines />
      <RecentNotifications />
    </Page>
  );
};
