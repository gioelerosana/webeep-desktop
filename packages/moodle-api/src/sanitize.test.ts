import { describe, expect, it } from 'vitest';
import { stripAuthTokens } from './sanitize.js';

const SITE_FILE = 'https://webeep.polimi.it/webservice/pluginfile.php/1/mod_page/content/3/a.pdf';
const TOKEN = 'segreto-123';

describe('stripAuthTokens', () => {
  it('toglie il token dalla query e lascia gli altri parametri', () => {
    expect(stripAuthTokens(`${SITE_FILE}?token=${TOKEN}&forcedownload=1`)).toBe(`${SITE_FILE}?forcedownload=1`);
  });

  it('toglie anche wstoken, in fondo alla query', () => {
    expect(stripAuthTokens(`${SITE_FILE}?x=1&wstoken=${TOKEN}`)).toBe(`${SITE_FILE}?x=1`);
  });

  it('toglie il token dentro HTML, con &amp; come separatore', () => {
    const html = `<a href="${SITE_FILE}?token=${TOKEN}&amp;forcedownload=1">scarica</a>`;
    expect(stripAuthTokens(html)).toBe(`<a href="${SITE_FILE}?forcedownload=1">scarica</a>`);
  });

  it('toglie token adiacenti con un solo passaggio di chiamata', () => {
    expect(stripAuthTokens(`${SITE_FILE}?token=a&token=b&forcedownload=1`)).toBe(`${SITE_FILE}?forcedownload=1`);
  });

  it('non tocca un URL senza token', () => {
    const url = `${SITE_FILE}?forcedownload=1`;
    expect(stripAuthTokens(url)).toBe(url);
  });

  it('non tocca un parametro che solo finisce come token', () => {
    const url = `${SITE_FILE}?mytoken=1`;
    expect(stripAuthTokens(url)).toBe(url);
  });

  it('non lascia il valore del token nel testo', () => {
    expect(stripAuthTokens(`<img src="${SITE_FILE}?token=${TOKEN}">`)).not.toContain(TOKEN);
  });
});
