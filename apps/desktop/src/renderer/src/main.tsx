import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CrashBoundary } from './components/crash/CrashBoundary';
import { installRendererErrorListeners } from './components/crash/installRendererErrorListeners';
import { installHttpBridgeIfNeeded } from './lib/http-bridge';
import { isIpcError } from './lib/ipc';
import './styles.css';

const STALE_TIME_MS = 60_000;
const MAX_RETRIES = 2;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      refetchOnWindowFocus: false,
      // Un errore di autenticazione non si risolve riprovando: il main ha già chiuso la sessione.
      retry: (failureCount, error) => !(isIpcError(error) && error.kind === 'auth') && failureCount < MAX_RETRIES,
    },
  },
});

// Solo in dev e solo nel browser (fuori da Electron): dati finti per lavorare sull'interfaccia.
if (import.meta.env.DEV) {
  const { installMockBridgeIfNeeded } = await import('./lib/mock-bridge');
  installMockBridgeIfNeeded();
} else {
  // Build fuori da Electron (modalità web): l'interfaccia parla con le API HTTP del main. In Electron il preload c'è già.
  installHttpBridgeIfNeeded();
}

// Dopo il bridge: il listener chiama `window.webeep`. Nel browser non registra nulla.
installRendererErrorListeners();

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root mancante in index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CrashBoundary>
        <App />
      </CrashBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
