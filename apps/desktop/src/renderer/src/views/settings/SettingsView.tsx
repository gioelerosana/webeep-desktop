import type { ReactNode } from 'react';
import { PageHeader, Page } from '../../layout/Page';
import { AboutCard } from './AboutCard';
import { AccountCard } from './AccountCard';
import { AppearanceCard } from './AppearanceCard';
import { DownloadCard } from './DownloadCard';
import { FeedbackCard } from './FeedbackCard';
import { UpdatesCard } from './UpdatesCard';

export const SettingsView = (): ReactNode => (
  <Page>
    <PageHeader title="Impostazioni" />
    <AppearanceCard />
    <DownloadCard />
    <UpdatesCard />
    <AccountCard />
    <FeedbackCard />
    <AboutCard />
  </Page>
);
