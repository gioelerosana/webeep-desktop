/*
 * Codifica dei parametri nel formato form di Moodle.
 *
 * Il REST server di Moodle non accetta JSON in ingresso: vuole
 * `application/x-www-form-urlencoded` con array e oggetti appiattiti in
 * chiavi tipo `options[0][name]=x`.
 */

export type MoodleParamValue =
  | string
  | number
  | boolean
  | readonly MoodleParamValue[]
  | { readonly [key: string]: MoodleParamValue | undefined };

export type MoodleParams = { readonly [key: string]: MoodleParamValue | undefined };

const appendValue = (form: URLSearchParams, key: string, value: MoodleParamValue | undefined): void => {
  if (value === undefined) return;
  if (typeof value === 'boolean') {
    form.append(key, value ? '1' : '0');
    return;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    form.append(key, String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item: MoodleParamValue, index) => appendValue(form, `${key}[${index}]`, item));
    return;
  }
  Object.entries(value).forEach(([childKey, child]) => appendValue(form, `${key}[${childKey}]`, child));
};

export const encodeMoodleParams = (params: MoodleParams): URLSearchParams => {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => appendValue(form, key, value));
  return form;
};
