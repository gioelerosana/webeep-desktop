import type { ReactNode } from 'react';
import { RichHtml } from '../../components/rich-html/RichHtml';
import type { RichNode } from '../../components/rich-html/parseRichHtml';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';

export type SectionSummaryProps = {
  readonly nodes: readonly RichNode[];
  readonly renderLink: RichLinkRenderer;
};

/** Sommario di sezione: HTML di WeBeep in tono secondario, dentro la card della sezione. */
export const SectionSummary = ({ nodes, renderLink }: SectionSummaryProps): ReactNode => (
  <div className="px-4 py-3">
    <RichHtml nodes={nodes} renderLink={renderLink} className="text-muted-foreground" />
  </div>
);
