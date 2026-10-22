/*
 * Protocollo `webeep-asset://` per immagini e file mostrati nel renderer
 * (copertine dei corsi, avatar, icone dei moduli).
 *
 * Il renderer non ha il token: chiede `webeep-asset://file/?url=<fileurl>` e
 * qui lo si risolve contro WeBeep aggiungendo il token. Si servono solo URL di
 * WeBeep, così il protocollo non diventa un proxy verso host arbitrari.
 */
import { protocol } from 'electron';
import { authenticatedFileUrl, WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { ASSET_SCHEME } from '../shared/ipc.js';
import { getActiveToken } from './auth.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const PLUGINFILE_MARKER = 'pluginfile.php';

/** Va chiamata prima di `app.ready`. */
export const registerAssetScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
};

const resolveTarget = (requestUrl: string): URL | undefined => {
  const raw = new URL(requestUrl).searchParams.get('url');
  if (!raw) return undefined;
  const target = new URL(raw);
  return target.origin === new URL(WEBEEP_SITE_URL).origin ? target : undefined;
};

export const handleAssetProtocol = (): void => {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const target = resolveTarget(request.url);
    if (!target) return new Response('URL non ammesso', { status: HTTP_FORBIDDEN });
    try {
      // I file protetti (pluginfile) vogliono il token; le immagini pubbliche (icone del tema) no.
      const url = target.pathname.includes(PLUGINFILE_MARKER)
        ? authenticatedFileUrl(target.toString(), getActiveToken())
        : target.toString();
      return await fetch(url);
    } catch {
      // Sessione assente o rete giù: l'<img> mostrerà il suo fallback.
      return new Response('Asset non disponibile', { status: HTTP_BAD_REQUEST });
    }
  });
};
