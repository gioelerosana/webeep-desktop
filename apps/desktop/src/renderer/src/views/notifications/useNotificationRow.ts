/*
 * Stato e azioni di una notifica espandibile: corpo da mostrare, contesto del modulo
 * per aprire la risorsa dentro il corso, e i comandi del pannello. Le viste rendono
 * soltanto; qui sta la logica, uguale per la pagina Notifiche e per la Home.
 */
import type { MoodleNotification } from '@webeep/moodle-api';
import { useId, useMemo, useState } from 'react';
import { useNavigation } from '../../lib/navigation';
import {
  extractCourseModuleId,
  notificationDestination,
  notificationDestinationLabel,
  selectNotificationContent,
  type NotificationContent,
} from '../../lib/notificationContext';
import { openExternal, useCourseModule, useMarkNotificationRead } from '../../lib/queries';

export type NotificationRowModel = {
  readonly isOpen: boolean;
  readonly toggle: () => void;
  /** Id del pannello: lo usa il bottone con `aria-controls`. */
  readonly panelId: string;
  readonly content: NotificationContent;
  readonly isUnread: boolean;
  readonly destinationLabel: string;
  readonly isMarkingRead: boolean;
  readonly isResolvingContext: boolean;
  readonly canOpenInCourse: boolean;
  readonly canOpenOnWebeep: boolean;
  readonly markAsRead: () => void;
  readonly openInCourse: () => void;
  readonly openOnWebeep: () => void;
};

/**
 * Apre il link nel browser e poi segna la notifica come letta: se il main rifiuta
 * l'apertura, la notifica resta non letta e l'errore finisce in console.
 */
const openUrlAndMarkRead = async (url: string, markAsRead: () => void): Promise<void> => {
  try {
    await openExternal(url);
  } catch (error) {
    console.error('Impossibile aprire il link della notifica', error);
    return;
  }
  markAsRead();
};

export const useNotificationRow = (notification: MoodleNotification): NotificationRowModel => {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `${useId()}-panel`;
  const { navigate } = useNavigation();
  const markRead = useMarkNotificationRead();
  const cmid = extractCourseModuleId(notification.contexturl);
  // Il contesto si chiede solo a pannello aperto: una lista chiusa di notifiche non fa chiamate.
  const context = useCourseModule(isOpen ? cmid : null);
  const courseId = context.data?.course ?? null;
  const contextUrl = notification.contexturl ?? null;
  const isUnread = !notification.read;
  // Memoizzato sull'identità della notifica: la vista che lo riceve riusa i nodi già letti.
  const content = useMemo(() => selectNotificationContent(notification), [notification]);

  const markAsRead = (): void => {
    if (isUnread) markRead.mutate(notification.id);
  };

  return {
    isOpen,
    toggle: () => setIsOpen((open) => !open),
    panelId,
    content,
    isUnread,
    destinationLabel: notificationDestinationLabel(notificationDestination(notification.component)),
    isMarkingRead: markRead.isPending,
    isResolvingContext: isOpen && cmid !== null && context.isPending,
    canOpenInCourse: cmid !== null && courseId !== null,
    canOpenOnWebeep: contextUrl !== null,
    markAsRead,
    // Come "apri su WeBeep": la notifica letta nel corso non deve restare nel badge dei non letti.
    openInCourse: () => {
      if (cmid === null || courseId === null) return;
      navigate({ name: 'course', courseId, moduleId: cmid });
      markAsRead();
    },
    openOnWebeep: () => {
      if (contextUrl !== null) void openUrlAndMarkRead(contextUrl, markAsRead);
    },
  };
};
