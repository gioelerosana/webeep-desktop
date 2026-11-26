/*
 * Rimozione dei parametri di autenticazione da testo e URL di WeBeep.
 *
 * Il token Moodle non deve arrivare al renderer (AGENTS.md, regola 1): questa funzione
 * va applicata a ogni HTML e URL che esce dal main. È pura: niente Electron, niente rete.
 */

// Parametro `token` o `wstoken` di Moodle, con il separatore che lo apre e l'eventuale `&` (o `&amp;`) che lo segue.
// Accetta: "…/a.pdf?token=abc&forcedownload=1" e "…/a.pdf?x=1&wstoken=abc"; non accetta "…/a.pdf?forcedownload=1".
// Esempio che cambia: "…/a.pdf?token=abc&forcedownload=1" → "…/a.pdf?forcedownload=1".
// https://regex101.com/?regex=%28%5C%3F%7C%26amp%3B%7C%26%29%28%3F%3Awstoken%7Ctoken%29%3D%5B%5E%26%22%5C%27%5Cs%23%3C%3E%5D%2A%28%26amp%3B%7C%26%29%3F&testString=https%3A%2F%2Fwebeep.polimi.it%2Fwebservice%2Fpluginfile.php%2F123%2Fa.pdf%3Ftoken%3Dabc%26forcedownload%3D1%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fwebservice%2Fpluginfile.php%2F123%2Fa.pdf%3Fforcedownload%3D1&flavor=javascript&flags=gi
const AUTH_TOKEN_PARAM = /(\?|&amp;|&)(?:wstoken|token)=[^&"'\s#<>]*(&amp;|&)?/gi;

/**
 * Toglie i parametri di autenticazione da un testo (HTML o URL). Un solo passaggio non basta
 * con token adiacenti (`?token=a&token=b`): il secondo viene visto solo dopo il primo, quindi
 * si ripete finché il testo cambia.
 */
export const stripAuthTokens = (text: string): string => {
  const stripped = text.replace(AUTH_TOKEN_PARAM, (_match: string, lead: string, trail: string | undefined) =>
    trail ? lead : '',
  );
  return stripped === text ? text : stripAuthTokens(stripped);
};
