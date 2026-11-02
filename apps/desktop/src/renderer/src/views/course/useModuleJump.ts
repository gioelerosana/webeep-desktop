/*
 * Reazione al modulo indicato da una notifica: la pagina del corso resta la stessa
 * rotta, qui si decide se aprire la pagina del modulo o evidenziarlo nella sezione
 * che lo contiene. Sta fuori dalla vista perché è logica con stato, non rendering.
 */
import type { CourseSection } from '@webeep/moodle-api';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PAGE_MODNAME } from './courseContent';

/** Per quanto resta acceso l'anello sul modulo arrivato da una notifica. */
const HIGHLIGHT_DURATION_MS = 2400;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Lo scroll porta la riga a metà dello spazio visibile, non al bordo. */
const SCROLL_BLOCK = 'center';

/** Dove porta il modulo di una notifica: nessuna parte, una pagina da aprire, un modulo da mostrare. */
export type ModuleJump =
  | { readonly kind: 'none' }
  | { readonly kind: 'page'; readonly moduleId: number }
  | { readonly kind: 'module'; readonly moduleId: number; readonly sectionId: number };

const NO_JUMP: ModuleJump = { kind: 'none' };

const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * Modulo indicato dalla notifica, cercato nei contenuti del corso: se il modulo
 * non c'è più (notifica vecchia) o è nascosto, la pagina corso si apre normale.
 */
export const findModuleJump = (sections: readonly CourseSection[], moduleId: number | undefined): ModuleJump => {
  if (moduleId === undefined) return NO_JUMP;
  const section = sections.find(
    (candidate) => candidate.uservisible && candidate.modules.some((module) => module.id === moduleId),
  );
  const module = section?.modules.find((candidate) => candidate.id === moduleId);
  if (section === undefined || module === undefined || !module.uservisible) return NO_JUMP;
  if (module.modname === PAGE_MODNAME) return { kind: 'page', moduleId: module.id };
  return { kind: 'module', moduleId: module.id, sectionId: section.id };
};

export type ModuleJumpState = {
  /** Sezione da aprire subito: quella che contiene il modulo della notifica. */
  readonly defaultExpandedSectionId: number | undefined;
  /** Modulo con l'anello acceso, per qualche istante. */
  readonly highlightedModuleId: number | undefined;
  /** Riga del modulo evidenziato: serve a portarla in vista. */
  readonly highlightedRowRef: RefObject<HTMLDivElement | null>;
};

/**
 * Reazione al modulo di una notifica. La pagina si apre una volta sola per
 * modulo: tornando indietro non si riapre. Per gli altri moduli si espande la
 * sezione (già in fase di render, così la riga esiste) e la si porta in vista.
 */
export const useModuleJump = (
  sections: readonly CourseSection[],
  moduleId: number | undefined,
  onOpenPage: (moduleId: number) => void,
): ModuleJumpState => {
  const jump = useMemo(() => findModuleJump(sections, moduleId), [sections, moduleId]);
  const [highlightedModuleId, setHighlightedModuleId] = useState<number | undefined>(undefined);
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);
  const settledModuleId = useRef<number | undefined>(undefined);

  useEffect(() => {
    // I contenuti arrivano dopo il primo render: finché non si conosce il modulo non si decide nulla.
    if (jump.kind === 'none' || settledModuleId.current === jump.moduleId) return;
    settledModuleId.current = jump.moduleId;
    if (jump.kind === 'page') {
      onOpenPage(jump.moduleId);
      return;
    }
    setHighlightedModuleId(jump.moduleId);
  }, [jump, onOpenPage]);

  useEffect(() => {
    if (highlightedModuleId === undefined) return;
    const row = highlightedRowRef.current;
    row?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: SCROLL_BLOCK });
    const timer = window.setTimeout(() => setHighlightedModuleId(undefined), HIGHLIGHT_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedModuleId]);

  return {
    defaultExpandedSectionId: jump.kind === 'module' ? jump.sectionId : undefined,
    highlightedModuleId,
    highlightedRowRef,
  };
};
