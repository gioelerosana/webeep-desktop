/*
 * Scenari finti degli aggiornamenti per `?update=`: stato iniziale, esito del
 * controllo e avanzamento del download. La macchina a stati vera sta nel main;
 * qui basta imitarne i passaggi per vedere tutte le interfacce.
 */
import type { UpdatePlatform, UpdateState } from '../../../../shared/ipc';
import { mockSearchParams } from './fixtures';

const UPDATE_PARAM = 'update';
export const MOCK_CURRENT_VERSION = '0.0.1';
const MOCK_NEW_VERSION = '0.0.2';
const MOCK_DOWNLOAD_PERCENT = 40;
const UPDATE_CHECK_ERROR_MESSAGE = 'Controllo degli aggiornamenti non riuscito (errore simulato)';
/* Il download finto avanza a passi fissi, come il progresso di electron-updater. */
const DOWNLOAD_STEP_PERCENT = 25;
const DOWNLOAD_STEP_DELAY_MS = 500;
const MOCK_FULL_PERCENT = 100;

/** Scenari dell'aggiornamento per `?update=`: ognuno mostra uno stato diverso dell'interfaccia. */
export type MockUpdateScenario =
  | 'unsupported'
  | 'idle'
  | 'available-win'
  | 'available-linux'
  | 'downloading'
  | 'ready'
  | 'error';

export const MOCK_UPDATE_STATES: Record<MockUpdateScenario, UpdateState> = {
  unsupported: { currentVersion: MOCK_CURRENT_VERSION, platform: 'other', status: 'unsupported' },
  idle: { currentVersion: MOCK_CURRENT_VERSION, platform: 'linux', status: 'idle' },
  'available-win': {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'windows',
    status: 'available',
    version: MOCK_NEW_VERSION,
    mode: 'install',
  },
  'available-linux': {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'linux',
    status: 'available',
    version: MOCK_NEW_VERSION,
    mode: 'manual',
  },
  downloading: {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'windows',
    status: 'downloading',
    version: MOCK_NEW_VERSION,
    percent: MOCK_DOWNLOAD_PERCENT,
  },
  ready: { currentVersion: MOCK_CURRENT_VERSION, platform: 'windows', status: 'ready', version: MOCK_NEW_VERSION },
  error: {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'linux',
    status: 'error',
    message: UPDATE_CHECK_ERROR_MESSAGE,
  },
};

/* Le chiavi di `MOCK_UPDATE_STATES` sono già l'elenco degli scenari: niente seconda lista da tenere allineata. */
const isMockUpdateScenario = (value: string | null): value is MockUpdateScenario =>
  value !== null && Object.hasOwn(MOCK_UPDATE_STATES, value);

const requestedScenario = mockSearchParams.get(UPDATE_PARAM);

/** Stato iniziale scelto da `?update=`; `idle` se il parametro manca o non è uno scenario noto. */
export const initialUpdateState: UpdateState =
  MOCK_UPDATE_STATES[isMockUpdateScenario(requestedScenario) ? requestedScenario : 'idle'];

/** Esito simulato del controllo: su Windows c'è una versione da installare, su Linux solo da segnalare. */
export const updateAvailableAfterCheck = (platform: UpdatePlatform): UpdateState => ({
  currentVersion: MOCK_CURRENT_VERSION,
  platform,
  status: 'available',
  version: MOCK_NEW_VERSION,
  mode: platform === 'windows' ? 'install' : 'manual',
});

/* Avanzamento simulato del download: passi a intervalli fissi, poi `ready`. */
export const simulateDownload = (
  platform: UpdatePlatform,
  version: string,
  applyState: (state: UpdateState) => void,
  percent = 0,
): void => {
  if (percent >= MOCK_FULL_PERCENT) {
    applyState({ currentVersion: MOCK_CURRENT_VERSION, platform, status: 'ready', version });
    return;
  }
  applyState({ currentVersion: MOCK_CURRENT_VERSION, platform, status: 'downloading', version, percent });
  setTimeout(() => simulateDownload(platform, version, applyState, percent + DOWNLOAD_STEP_PERCENT), DOWNLOAD_STEP_DELAY_MS);
};

/* Stessa regola di `isBusy` nel main: con questi stati un nuovo controllo sarebbe inutile o avvierebbe un secondo download. */
const BUSY_UPDATE_STATUSES: readonly UpdateState['status'][] = ['checking', 'downloading', 'ready'];

/* `available` è occupato solo su Windows (download in corso o imminente); su Linux è un avviso e si può ricontrollare. */
export const isUpdateBusy = (current: UpdateState): boolean => {
  if (current.status === 'available') return current.mode === 'install';
  return BUSY_UPDATE_STATUSES.includes(current.status);
};
