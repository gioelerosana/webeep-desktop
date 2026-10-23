import { Input } from '@webeep/ui-kit';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { COURSE_SEARCH_MAX_QUERY_LENGTH } from '../../../../shared/ipc';

const PLACEHOLDER = 'Cerca tra i corsi di WeBeep';

export type SearchFieldProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
};

/** Campo di ricerca in cima alla vista, con il focus già pronto all'apertura. */
export const SearchField = ({ value, onChange }: SearchFieldProps): ReactNode => (
  <Input
    type="search"
    autoFocus
    maxLength={COURSE_SEARCH_MAX_QUERY_LENGTH}
    aria-label={PLACEHOLDER}
    placeholder={PLACEHOLDER}
    leading={<Search />}
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);
