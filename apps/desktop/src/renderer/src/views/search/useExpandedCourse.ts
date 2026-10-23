import { useCallback, useState } from 'react';

export type ExpandedCourse = {
  readonly expandedCourseId: number | undefined;
  readonly toggleCourse: (courseId: number) => void;
};

/** Il dettaglio di un corso non iscritto è uno alla volta: aprirne un altro chiude il precedente. */
export const useExpandedCourse = (): ExpandedCourse => {
  const [expandedCourseId, setExpandedCourseId] = useState<number | undefined>(undefined);

  const toggleCourse = useCallback(
    (courseId: number): void => setExpandedCourseId((current) => (current === courseId ? undefined : courseId)),
    [],
  );

  return { expandedCourseId, toggleCourse };
};
