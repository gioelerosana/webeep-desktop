/*
 * Configurazione del backend keyring su Linux per `safeStorage`.
 *
 * Su Linux Chromium sceglie il backend in base a `XDG_CURRENT_DESKTOP`
 * (ricadendo su `basic_text` sui window manager non riconosciuti come
 * Hyprland, oppure su KWallet su KDE invece del Secret Service standard).
 *
 * Impostando `--password-store=gnome-libsecret` prima di `app.whenReady()`
 * (prima che `os_crypt` venga inizializzato), Chromium usa `libsecret`, cioè
 * l'API standard freedesktop.org Secret Service su D-Bus
 * (`org.freedesktop.secrets`), affidandosi al provider registrato nel sistema
 * (gnome-keyring, KeePassXC, KWallet con Secret Service, oo7, ecc.) senza
 * dipendere dal desktop environment.
 */
import { app } from 'electron';

const PASSWORD_STORE_SWITCH = 'password-store';
const SECRET_SERVICE_BACKEND = 'gnome-libsecret';

export const configureLinuxKeyring = (): void => {
  if (process.platform !== 'linux') return;
  if (app.commandLine.hasSwitch(PASSWORD_STORE_SWITCH)) return;

  app.commandLine.appendSwitch(PASSWORD_STORE_SWITCH, SECRET_SERVICE_BACKEND);
};
