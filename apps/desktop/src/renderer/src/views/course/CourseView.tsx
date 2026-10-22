import type { ReactNode } from 'react';

export type CourseViewProps = { readonly courseId: number };

// SEGNAPOSTO: da implementare (vedi TODO.md).
export const CourseView = ({ courseId }: CourseViewProps): ReactNode => (
  <div className="p-6 text-sm text-muted-foreground">Corso {courseId}</div>
);
