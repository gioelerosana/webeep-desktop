import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildLaunchUrl, createPassport, LaunchTokenError, parseLaunchCallback } from './auth.js';

const SITE_URL = 'https://webeep.polimi.it';
const PASSPORT = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
const OTHER_PASSPORT = '0123456789abcdef0123456789abcdef';
const TOKEN = 'token-di-prova';
const PRIVATE_TOKEN = 'private-di-prova';
const SERVICE = 'moodle_mobile_app';
const URL_SCHEME = 'moodlemobile';
const LAUNCH_PATHNAME = '/admin/tool/mobile/launch.php';
const PASSPORT_LENGTH = 32;
const HEX_DIGITS = '0123456789abcdef';
const GENERATED_PASSPORTS_COUNT = 3;
const SIGNATURE_SEPARATOR = ':::';
const FOREIGN_CALLBACK = 'https://webeep.polimi.it/?token=non-moodle';
const PADDING_MARKER = '%3D';

/** La firma che Moodle mette in testa al payload: md5(wwwroot + passport). */
const signatureOf = (siteUrl: string, passport: string): string =>
  createHash('md5').update(`${siteUrl}${passport}`).digest('hex');

const signedPayload = (passport: string, token: string, privateToken?: string): string => {
  const head = `${signatureOf(SITE_URL, passport)}${SIGNATURE_SEPARATOR}${token}`;
  return privateToken === undefined ? head : `${head}${SIGNATURE_SEPARATOR}${privateToken}`;
};

/** Costruisce il redirect `moodlemobile://token=<base64 url-encoded>` come lo manda Moodle. */
const callbackFor = (payload: string): string =>
  `${URL_SCHEME}://token=${encodeURIComponent(Buffer.from(payload, 'utf8').toString('base64'))}`;

describe('createPassport', () => {
  it('restituisce una stringa esadecimale di 32 caratteri', () => {
    const passport = createPassport();

    expect(passport).toHaveLength(PASSPORT_LENGTH);
    expect([...passport].every((char) => HEX_DIGITS.includes(char))).toBe(true);
  });

  it('restituisce un valore diverso a ogni chiamata', () => {
    const passports = Array.from({ length: GENERATED_PASSPORTS_COUNT }, () => createPassport());

    expect(new Set(passports).size).toBe(GENERATED_PASSPORTS_COUNT);
  });
});

describe('buildLaunchUrl', () => {
  it('punta a launch.php con service, passport e urlscheme', () => {
    const url = new URL(buildLaunchUrl(SITE_URL, PASSPORT));

    expect(url.origin).toBe(SITE_URL);
    expect(url.pathname).toBe(LAUNCH_PATHNAME);
    expect(url.searchParams.get('service')).toBe(SERVICE);
    expect(url.searchParams.get('passport')).toBe(PASSPORT);
    expect(url.searchParams.get('urlscheme')).toBe(URL_SCHEME);
  });
});

describe('parseLaunchCallback', () => {
  it('estrae token e privateToken dal callback', () => {
    const callback = callbackFor(signedPayload(PASSPORT, TOKEN, PRIVATE_TOKEN));

    expect(parseLaunchCallback(callback, SITE_URL, PASSPORT)).toEqual({
      token: TOKEN,
      privateToken: PRIVATE_TOKEN,
    });
  });

  it('senza privatetoken restituisce privateToken undefined', () => {
    const callback = callbackFor(signedPayload(PASSPORT, TOKEN));

    expect(parseLaunchCallback(callback, SITE_URL, PASSPORT)).toEqual({
      token: TOKEN,
      privateToken: undefined,
    });
  });

  it('gestisce il base64 con il padding codificato come %3D', () => {
    // Questo payload produce il padding "==" in base64: serve a provare la decodifica dei caratteri URL-encoded.
    const callback = callbackFor(signedPayload(PASSPORT, TOKEN));

    expect(callback).toContain(PADDING_MARKER);
    expect(parseLaunchCallback(callback, SITE_URL, PASSPORT).token).toBe(TOKEN);
  });

  it('con un passport diverso lancia LaunchTokenError', () => {
    const callback = callbackFor(signedPayload(OTHER_PASSPORT, TOKEN, PRIVATE_TOKEN));

    expect(() => parseLaunchCallback(callback, SITE_URL, PASSPORT)).toThrow(LaunchTokenError);
  });

  it('con un URL che non è moodlemobile lancia LaunchTokenError', () => {
    expect(() => parseLaunchCallback(FOREIGN_CALLBACK, SITE_URL, PASSPORT)).toThrow(LaunchTokenError);
  });

  it('senza token nel payload lancia LaunchTokenError', () => {
    const callback = callbackFor(`${signatureOf(SITE_URL, PASSPORT)}${SIGNATURE_SEPARATOR}`);

    expect(() => parseLaunchCallback(callback, SITE_URL, PASSPORT)).toThrow(LaunchTokenError);
  });
});
