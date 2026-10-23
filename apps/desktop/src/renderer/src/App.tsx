/*
 * Radice dell'interfaccia: tema, cancello di login, shell e vista corrente.
 */
import { Spinner } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import type { AuthState } from '../../shared/ipc';
import { CrashNotice } from './components/crash/CrashNotice';
import { AppShell } from './layout/AppShell';
import { TitleBar } from './layout/TitleBar';
import { NavigationProvider, useNavigation, type Route } from './lib/navigation';
import { useAuthState, useSettings } from './lib/queries';
import { useApplyTheme } from './lib/theme';
import { CourseView } from './views/course/CourseView';
import { HomeView } from './views/home/HomeView';
import { LoginView } from './views/login/LoginView';
import { NotificationsView } from './views/notifications/NotificationsView';
import { SearchView } from './views/search/SearchView';
import { SettingsView } from './views/settings/SettingsView';

const assertNever = (value: never): never => {
  throw new Error(`Rotta non gestita: ${JSON.stringify(value)}`);
};

const renderRoute = (route: Route): ReactNode => {
  if (route.name === 'home') return <HomeView />;
  if (route.name === 'course') return <CourseView key={route.courseId} courseId={route.courseId} />;
  if (route.name === 'notifications') return <NotificationsView />;
  if (route.name === 'search') return <SearchView />;
  if (route.name === 'settings') return <SettingsView />;
  return assertNever(route);
};

const AppContent = (): ReactNode => {
  const { route } = useNavigation();
  return <AppShell>{renderRoute(route)}</AppShell>;
};

const FullScreenSpinner = (): ReactNode => (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-5" />
  </div>
);

const renderScreen = (auth: AuthState | undefined): ReactNode => {
  if (!auth) return <FullScreenSpinner />;
  if (auth.status === 'signed-out') return <LoginView />;
  return (
    <NavigationProvider>
      <AppContent />
    </NavigationProvider>
  );
};

/* La barra sta sopra a tutto (anche al login e allo spinner); sotto, il resto occupa l'altezza rimasta. */
export const App = (): ReactNode => {
  const settings = useSettings();
  const auth = useAuthState();
  useApplyTheme(settings.data?.theme ?? 'system');

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <CrashNotice />
      <div className="flex min-h-0 flex-1 flex-col">{renderScreen(auth.data)}</div>
    </div>
  );
};
