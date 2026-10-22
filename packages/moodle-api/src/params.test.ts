import { describe, expect, it } from 'vitest';
import { encodeMoodleParams } from './params.js';

const COURSE_ID = 42;
const FIRST_COURSE_ID = 101;
const SECOND_COURSE_ID = 102;
const LIMIT_VALUE = 5;
const MOODLE_TRUE = '1';
const MOODLE_FALSE = '0';

describe('encodeMoodleParams', () => {
  it('codifica stringhe e numeri come testo', () => {
    const form = encodeMoodleParams({ lang: 'it', courseid: COURSE_ID });

    expect(form.get('lang')).toBe('it');
    expect(form.get('courseid')).toBe(String(COURSE_ID));
  });

  it('codifica i booleani come 1 e 0', () => {
    const form = encodeMoodleParams({ visible: true, hidden: false });

    expect(form.get('visible')).toBe(MOODLE_TRUE);
    expect(form.get('hidden')).toBe(MOODLE_FALSE);
  });

  it('appiattisce gli array con la chiave indicizzata key[i]', () => {
    const form = encodeMoodleParams({ courseids: [FIRST_COURSE_ID, SECOND_COURSE_ID] });

    expect(form.get('courseids[0]')).toBe(String(FIRST_COURSE_ID));
    expect(form.get('courseids[1]')).toBe(String(SECOND_COURSE_ID));
    expect(form.has('courseids')).toBe(false);
  });

  it('appiattisce gli oggetti annidati con la chiave key[a][b]', () => {
    const form = encodeMoodleParams({ options: { name: 'userid', value: COURSE_ID } });

    expect(form.get('options[name]')).toBe('userid');
    expect(form.get('options[value]')).toBe(String(COURSE_ID));
  });

  it('appiattisce un array di oggetti come usa Moodle per le opzioni', () => {
    const form = encodeMoodleParams({ options: [{ name: 'limit', value: LIMIT_VALUE }] });

    expect(form.get('options[0][name]')).toBe('limit');
    expect(form.get('options[0][value]')).toBe(String(LIMIT_VALUE));
  });

  it('omette i valori undefined al primo livello e dentro gli oggetti', () => {
    const form = encodeMoodleParams({
      courseid: COURSE_ID,
      limit: undefined,
      options: { name: 'a', value: undefined },
    });

    expect(form.has('limit')).toBe(false);
    expect(form.has('options[value]')).toBe(false);
    expect(form.get('options[name]')).toBe('a');
  });

  it('restituisce un form vuoto senza parametri', () => {
    expect(encodeMoodleParams({}).toString()).toBe('');
  });

  it('codifica i caratteri speciali dei valori', () => {
    const form = encodeMoodleParams({ query: 'analisi & algebra' });

    expect(form.get('query')).toBe('analisi & algebra');
    expect(form.toString()).not.toContain('analisi & algebra');
  });
});
