/*
 * HTML della pagina parsato una volta per contenuto: il rendering e il controllo "pagina vuota"
 * usano lo stesso albero, così il DOMParser non parte a ogni render.
 */
import { useMemo } from 'react';
import { parseRichHtml, type RichNode } from '../../components/rich-html/parseRichHtml';
import type { CoursePage } from '../../../../shared/ipc';

export type ParsedPage = {
  readonly intro: readonly RichNode[];
  readonly content: readonly RichNode[];
};

export const useParsedPage = (page: CoursePage): ParsedPage =>
  useMemo(
    () => ({ intro: parseRichHtml(page.introHtml), content: parseRichHtml(page.contentHtml) }),
    [page.introHtml, page.contentHtml],
  );
