import type { ReactNode } from 'react';
import { PageHeader, Page } from '../../layout/Page';
import { AboutCard } from './AboutCard';
import { AccountCard } from './AccountCard';
import { AppearanceCard } from './AppearanceCard';
import { DownloadCard } from './DownloadCard';

export const SettingsView = (): ReactNode => (
  <Page>
    <PageHeader title="Impostazioni" />
    <AppearanceCard />
    <DownloadCard />
    <AccountCard />
    <AboutCard />
  </Page>
);
