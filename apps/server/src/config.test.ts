import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, type EnvRecord } from './config.js';

const SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
const ISSUER = 'https://auth.example.it/application/o/webeep/';
const CLIENT_ID = 'client-di-prova';
const CLIENT_SECRET = 'segreto-di-prova-non-stampare';

const validEnv = (): EnvRecord => ({
  WEBEEP_PUBLIC_URL: 'https://server.example.it',
  WEBEEP_SECRET_KEY: SECRET_KEY,
  WEBEEP_OIDC_ISSUER: ISSUER,
  WEBEEP_OIDC_CLIENT_ID: CLIENT_ID,
  WEBEEP_OIDC_CLIENT_SECRET: CLIENT_SECRET,
});

/** Righe dell'errore di configurazione, o null se la configurazione è valida. */
const errorLines = (env: EnvRecord): readonly string[] | null => {
  try {
    loadConfig(env);
    return null;
  } catch (error) {
    if (error instanceof ConfigError) return error.lines;
    throw error;
  }
};

describe('configurazione v2 (login Authentik)', () => {
  it('legge le variabili OIDC e usa il gruppo predefinito webeep', () => {
    const config = loadConfig(validEnv());
    expect(config.oidc).toEqual({
      issuer: 'https://auth.example.it/application/o/webeep',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      allowedGroup: 'webeep',
    });
  });

  it('usa il gruppo indicato in WEBEEP_OIDC_ALLOWED_GROUP', () => {
    const config = loadConfig({ ...validEnv(), WEBEEP_OIDC_ALLOWED_GROUP: 'altro-gruppo' });
    expect(config.oidc.allowedGroup).toBe('altro-gruppo');
  });

  it('non richiede più la password admin né la chiave di accoppiamento', () => {
    expect(errorLines(validEnv())).toBeNull();
  });

  it('un issuer http è rifiutato, con la sola indicazione della variabile', () => {
    const lines = errorLines({ ...validEnv(), WEBEEP_OIDC_ISSUER: 'http://auth.example.it/application/o/webeep/' });
    expect(lines).toEqual(['WEBEEP_OIDC_ISSUER: deve essere un URL https assoluto, senza query né frammento']);
  });

  it('un issuer con query o frammento è rifiutato', () => {
    expect(errorLines({ ...validEnv(), WEBEEP_OIDC_ISSUER: 'https://auth.example.it/o/webeep?x=1' })).toHaveLength(1);
    expect(errorLines({ ...validEnv(), WEBEEP_OIDC_ISSUER: 'https://auth.example.it/o/webeep#x' })).toHaveLength(1);
  });

  it('client ID, segreto e gruppo vuoti sono rifiutati', () => {
    const lines = errorLines({
      ...validEnv(),
      WEBEEP_OIDC_CLIENT_ID: '',
      WEBEEP_OIDC_CLIENT_SECRET: '',
      WEBEEP_OIDC_ALLOWED_GROUP: '',
    });
    expect(lines).toEqual([
      'WEBEEP_OIDC_CLIENT_ID: deve essere una stringa non vuota',
      'WEBEEP_OIDC_CLIENT_SECRET: deve essere una stringa non vuota',
      'WEBEEP_OIDC_ALLOWED_GROUP: deve essere una stringa non vuota',
    ]);
  });

  it('le righe di errore non contengono mai i valori ricevuti', () => {
    const lines = errorLines({ ...validEnv(), WEBEEP_OIDC_ISSUER: 'http://auth.example.it/?segreto=valore' });
    expect(lines?.join('\n')).not.toContain('segreto');
    expect(lines?.join('\n')).not.toContain(CLIENT_SECRET);
  });
});
