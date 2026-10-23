/*
 * Navigazione interna: una union discriminata di rotte in un context.
 * Niente router esterno: le viste sono poche e lo stato è tutto locale.
 * Per aggiungere una vista: nuova variante di `Route`, poi un case in
 * `AppContent` (App.tsx); il controllo finale con `assertNever` segnala i casi mancanti.
 */
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'course'; readonly courseId: number }
  | { readonly name: 'notifications' }
  | { readonly name: 'search' }
  | { readonly name: 'settings' };

type NavigationContextValue = {
  readonly route: Route;
  readonly navigate: (route: Route) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider = ({ children }: { readonly children: ReactNode }): ReactNode => {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const value = useMemo(() => ({ route, navigate: setRoute }), [route]);
  return <NavigationContext value={value}>{children}</NavigationContext>;
};

export const useNavigation = (): NavigationContextValue => {
  const context = use(NavigationContext);
  if (!context) throw new Error('useNavigation va usato dentro <NavigationProvider>');
  return context;
};
