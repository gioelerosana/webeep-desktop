/*
 * Link dentro l'HTML di una pagina: da URL a ciò che fa l'app (file, pagina del
 * corso, link esterno). Logica pura, senza React, così si verifica senza componenti.
 */
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { fileNameOf, isWebeepPluginFile, parseHttpUrl, WEBEEP_HOST } from '../../components/rich-html/richUrl';
import { isCourseFile, PAGE_MODNAME, RESOURCE_MODNAME, type DownloadableFile, type ModuleLocation } from './courseContent';

export type PageLinkTarget =
  | { readonly kind: 'file'; readonly file: DownloadableFile; readonly sectionName: string }
  | { readonly kind: 'page'; readonly moduleId: number }
  | { readonly kind: 'external'; readonly url: string };

const MODULE_PATH_ROOT = 'mod';
const MODULE_VIEW_SCRIPT = 'view.php';
const MODULE_ID_PARAM = 'id';

/** URL della pagina sul sito: quello che Moodle manda, o quello costruito dall'id se manca. */
export const pageBrowserUrl = (moduleId: number, moduleUrl: string | undefined): string =>
  moduleUrl ?? `${WEBEEP_SITE_URL}/mod/page/view.php?id=${moduleId}`;

/**
 * Id del modulo da un link `…/mod/<tipo>/view.php?id=N` di WeBeep; `undefined` per ogni altro URL.
 * Il segmento `<tipo>` non serve: il modulo si cerca per id e il suo tipo viene dal corso.
 */
const moduleIdOf = (url: URL): number | undefined => {
  const [, root, , script, ...extra] = url.pathname.split('/');
  const isModuleView = url.hostname === WEBEEP_HOST && root === MODULE_PATH_ROOT && script === MODULE_VIEW_SCRIPT && extra.length === 0;
  if (!isModuleView) return undefined;
  const id = Number(url.searchParams.get(MODULE_ID_PARAM));
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

/**
 * Cosa fa un link http(s) dentro una pagina:
 * - file di WeBeep (`pluginfile.php`): apre il file;
 * - modulo del corso: una pagina si apre nell'app, una risorsa apre il suo file;
 * - tutto il resto: browser di sistema.
 */
export const resolvePageLink = (href: string, locations: readonly ModuleLocation[], currentSectionName: string): PageLinkTarget => {
  const url = parseHttpUrl(href);
  if (url === undefined) return { kind: 'external', url: href };

  if (isWebeepPluginFile(url)) {
    return { kind: 'file', file: { fileurl: url.href, filename: fileNameOf(url) }, sectionName: currentSectionName };
  }

  const moduleId = moduleIdOf(url);
  const location = moduleId === undefined ? undefined : locations.find((candidate) => candidate.module.id === moduleId);
  if (location === undefined) return { kind: 'external', url: url.href };

  if (location.module.modname === PAGE_MODNAME) return { kind: 'page', moduleId: location.module.id };

  const resourceFile = location.module.modname === RESOURCE_MODNAME ? location.module.contents.filter(isCourseFile).at(0) : undefined;
  if (resourceFile !== undefined) return { kind: 'file', file: resourceFile, sectionName: location.sectionName };

  return { kind: 'external', url: url.href };
};

export const findModuleLocation = (locations: readonly ModuleLocation[], moduleId: number): ModuleLocation | undefined =>
  locations.find((location) => location.module.id === moduleId);
