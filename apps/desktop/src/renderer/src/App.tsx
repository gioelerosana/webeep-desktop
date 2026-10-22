/*
 * Radice dell'interfaccia: tema, cancello di login, shell e vista corrente.
 */
import { Spinner } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { AppShell } from './layout/AppShell';
import { NavigationProvider, useNavigation, type Route } from './lib/navigation';
import { useAuthState, useSettings } from './lib/queries';
import { useApplyTheme } from './lib/theme';
import { CourseView } from './views/course/CourseView';
import { HomeView } from './views/home/HomeView';
import { LoginView } from './views/login/LoginView';
import { NotificationsView } from './views/notifications/NotificationsView';
import { SettingsView } from './views/settings/SettingsView';

const assertNever = (value: never): never => {
  throw new Error(`Rotta non gestita: ${JSON.stringify(value)}`);
};

const renderRoute = (route: Route): ReactNode => {
  switch (route.name) {
    case 'home':
      return <HomeView />;
    case 'course':
      return <CourseView key={route.courseId} courseId={route.courseId} />;
    case 'notifications':
      return <NotificationsView />;
    case 'settings':
      return <SettingsView />;
    default:
      return assertNever(route);
  }
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

export const App = (): ReactNode => {
  const settings = useSettings();
  const auth = useAuthState();
  useApplyTheme(settings.data?.theme ?? 'system');

  if (!auth.data) return <FullScreenSpinner />;
  if (auth.data.status === 'signed-out') return <LoginView />;
  return (
    <NavigationProvider>
      <AppContent />
    </NavigationProvider>
  );
};
