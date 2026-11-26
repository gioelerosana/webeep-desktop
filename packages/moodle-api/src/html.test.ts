import { describe, expect, it } from 'vitest';
import { htmlToText } from './html.js';

describe('htmlToText', () => {
  it('va a capo tra i paragrafi', () => {
    expect(htmlToText('<p>Uno</p><p>Due</p>')).toBe('Uno\nDue');
  });

  it('trasforma <br> in a capo, in ogni forma', () => {
    expect(htmlToText('uno<br>due<BR/>tre')).toBe('uno\ndue\ntre');
  });

  it('mette un punto elenco per ogni voce di lista', () => {
    expect(htmlToText('<ul><li>Primo</li><li>Secondo</li></ul>')).toBe('• Primo\n• Secondo');
  });

  it('separa il contenuto delle celle di una tabella', () => {
    expect(htmlToText('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a b');
  });

  it('decodifica entità con nome, decimali ed esadecimali', () => {
    expect(htmlToText('Tom &amp; Jerry &lt;3 &#39;ok&#39; &#x41; &egrave;')).toBe("Tom & Jerry <3 'ok' A è");
  });

  it('decodifica una sola volta: &amp;lt; resta testo "&lt;"', () => {
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
  });

  it('lascia com\'è un codice numerico fuori dallo spazio Unicode', () => {
    expect(htmlToText('&#99999999;')).toBe('&#99999999;');
  });

  it('elimina script e style insieme al contenuto', () => {
    expect(htmlToText('<script>alert(1)</script><p>Testo</p><style>p{color:red}</style>')).toBe('Testo');
  });

  it('elimina i commenti HTML', () => {
    expect(htmlToText('a<!-- nota -->b')).toBe('ab');
  });

  it('normalizza gli spazi bianchi della sorgente', () => {
    expect(htmlToText('<p>\n   Lezione\n\n   del 4\n</p>')).toBe('Lezione del 4');
  });

  it('toglie i tag inline e lascia il testo', () => {
    expect(htmlToText('<strong>Ciao</strong> <a href="https://webeep.polimi.it">mondo</a>')).toBe('Ciao mondo');
  });

  it('lascia il "<" seguito da spazio come testo', () => {
    expect(htmlToText('a < b & c')).toBe('a < b & c');
  });

  it('restituisce stringa vuota per un frammento senza testo', () => {
    expect(htmlToText('<p>  </p>')).toBe('');
  });
});
