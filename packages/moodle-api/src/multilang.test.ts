import { describe, expect, it } from 'vitest';
import { resolveMultilang, resolveMultilangDeep } from './multilang.js';
import multilangFixture from './__fixtures__/multilang.json';

const REQUESTED_LANG = 'it';
const OTHER_LANG_TEXT = '{mlang other}Fallback{mlang}{mlang it}Avvisi{mlang}';
const NESTED_ITALIAN_TITLE = 'Bacheca';
const NESTED_ENGLISH_TITLE = 'Board';
const NESTED_MULTILANG_TITLE = `{mlang it}${NESTED_ITALIAN_TITLE}{mlang}{mlang en}${NESTED_ENGLISH_TITLE}{mlang}`;
const NESTED_SPAN_TITLE = `<span lang="en" class="multilang">${NESTED_ENGLISH_TITLE}</span><span lang="it" class="multilang">${NESTED_ITALIAN_TITLE}</span>`;
const NESTED_FILE_URL = 'https://webeep.polimi.it/webservice/pluginfile.php/1/mod_page/content/3/programma.pdf';
const NESTED_COURSE_ID = 101;
const PLAIN_NUMBER = 42;

describe('resolveMultilang', () => {
  it.each(multilangFixture.cases)('$name', ({ input, lang, expected }) => {
    expect(resolveMultilang(input, lang)).toBe(expected);
  });

  it('senza marcatori restituisce la stringa identica', () => {
    const plain = `Nessun marcatore qui: solo testo, numeri ${PLAIN_NUMBER} e {parentesi} graffe.`;

    expect(resolveMultilang(plain, REQUESTED_LANG)).toBe(plain);
  });

  it('se la lingua richiesta manca e c\'è un blocco other, prende other', () => {
    expect(resolveMultilang(OTHER_LANG_TEXT, 'en')).toBe('Fallback');
  });
});

describe('resolveMultilangDeep', () => {
  it('risolve le stringhe a ogni profondità e lascia intatti gli altri valori', () => {
    const response = {
      courses: [
        {
          id: NESTED_COURSE_ID,
          title: NESTED_MULTILANG_TITLE,
          pages: [{ name: NESTED_SPAN_TITLE, fileurl: NESTED_FILE_URL, hidden: false, size: null }],
        },
      ],
      warnings: [],
    };

    expect(resolveMultilangDeep(response, REQUESTED_LANG)).toEqual({
      courses: [
        {
          id: NESTED_COURSE_ID,
          title: NESTED_ITALIAN_TITLE,
          pages: [{ name: NESTED_ITALIAN_TITLE, fileurl: NESTED_FILE_URL, hidden: false, size: null }],
        },
      ],
      warnings: [],
    });
  });

  it('non tocca i valori che non sono stringhe o contenitori', () => {
    expect(resolveMultilangDeep(PLAIN_NUMBER, REQUESTED_LANG)).toBe(PLAIN_NUMBER);
    expect(resolveMultilangDeep(null, REQUESTED_LANG)).toBeNull();
    expect(resolveMultilangDeep(true, REQUESTED_LANG)).toBe(true);
  });
});
