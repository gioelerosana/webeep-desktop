import { Box, File as PageIcon, FileCheck, FileText, Folder, Link, ListChecks, MessagesSquare, type LucideIcon } from 'lucide-react';
import { LABEL_MODNAME } from './courseContent';

const MODULE_ICONS: ReadonlyMap<string, LucideIcon> = new Map<string, LucideIcon>([
  ['resource', FileText],
  ['folder', Folder],
  ['url', Link],
  ['forum', MessagesSquare],
  ['assign', FileCheck],
  ['quiz', ListChecks],
  ['page', PageIcon],
]);

/** Icona di un tipo di modulo Moodle; le etichette non ne hanno. */
export const moduleIcon = (modname: string): LucideIcon | undefined => {
  if (modname === LABEL_MODNAME) return undefined;
  return MODULE_ICONS.get(modname) ?? Box;
};
