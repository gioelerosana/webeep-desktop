# Funzioni Moodle usate

Endpoint: `POST https://webeep.polimi.it/webservice/rest/server.php`, form
urlencoded con `wstoken`, `wsfunction`, `moodlewsrestformat=json` e i parametri
appiattiti (`options[0][name]=…`, vedi `encodeMoodleParams`). Gli errori
arrivano con HTTP 200 e corpo `{ exception, errorcode, message }`.

Servizio: `moodle_mobile_app` (quello dell'app ufficiale). Elenco completo
delle funzioni disponibili:
[docs.moodle.org/dev/Web service API functions](https://moodledev.io/docs/apis/subsystems/external/functions).

| Funzione | Wrapper (`@webeep/moodle-api`) | Uso |
|---|---|---|
| `tool_mobile_get_public_config` (AJAX senza login) | `getPublicConfig` | verifica servizio mobile e tipo di login |
| `core_webservice_get_site_info` | `getSiteInfo` | utente corrente, verifica token |
| `core_course_get_enrolled_courses_by_timeline_classification` | `getCourses` | corsi (in corso, passati, futuri, preferiti) |
| `core_course_get_contents` | `getCourseContents` | sezioni, moduli, file di un corso |
| `core_calendar_get_action_events_by_timesort` | `getUpcomingEvents` | scadenze (sequenza temporale) |
| `message_popup_get_popup_notifications` | `getNotifications` | notifiche |
| `core_message_mark_notification_read` | `markNotificationRead` | segna una notifica come letta |
| `mod_page_get_pages_by_courses` | `getPages` | pagine (`mod_page`) di uno o più corsi: HTML e file allegati |

## Candidate per le prossime feature

| Funzione | Feature |
|---|---|
| `core_course_get_updates_since`, `core_course_check_updates` | badge "novità" per corso, sync incrementale |
| `mod_forum_get_forum_discussions`, `mod_forum_get_discussion_posts` | avvisi e forum |
| `mod_assign_get_assignments`, `mod_assign_get_submission_status` | stato consegne |
| `gradereport_user_get_grade_items` | voti |
| `core_calendar_get_calendar_monthly_view` | calendario mensile |
| `core_course_search_courses` | ricerca corsi |
| `core_files_get_files` | cartelle (`mod_folder`) |

## Aggiungere una funzione

1. schema zod in `src/schemas.ts` (permissivo sugli opzionali);
2. wrapper in `src/endpoints.ts` ed export in `src/index.ts`;
3. test in `src/*.test.ts` con `fetch` finto;
4. riga in questa tabella;
5. se serve al renderer: canale in `apps/desktop/src/shared/ipc.ts`, handler in
   `src/main/handlers.ts`, hook in `src/renderer/src/lib/queries.ts`, dati
   finti in `mock-bridge.ts`.
