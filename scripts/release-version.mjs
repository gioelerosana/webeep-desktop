// Versioni di release nel formato vYY.MAJOR.MINOR (docs/RELEASE.md §Versioni).
//
//   node scripts/release-version.mjs check-title --title "feat(map): …"
//       controlla il titolo di una PR in Conventional Commits e stampa «tipo → peso»
//   node scripts/release-version.mjs commits
//       analizza i commit dall'ultimo tag v* a HEAD e stampa un JSON con
//       {lastTag, bump, included, ignored, nonConforming}
//   node scripts/release-version.mjs next [--bump auto|major|minor] [--date 2026-10-25T…]
//       stampa la versione successiva (senza «v»); senza --bump il tipo viene dai commit
//   node scripts/release-version.mjs set 26.1.0
//       scrive la versione nel campo `version` di tutti i MANIFESTS
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Manifest il cui campo `version` segue la release. `set` li scrive, check-release-version
// li confronta con il tag. Il workflow non aggiorna nient'altro a mano.
export const MANIFESTS = [
  'package.json',
  'apps/desktop/package.json',
  'packages/moodle-api/package.json',
  'packages/ui-kit/package.json',
];

// Tipo Conventional Commits → peso nella prossima release (major, minor, none).
const BUMP_BY_TYPE = {
  feat: 'major',
  fix: 'minor',
  perf: 'minor',
  refactor: 'minor',
  style: 'minor',
  revert: 'minor',
  build: 'minor',
  docs: 'none',
  ci: 'none',
  chore: 'none',
  test: 'none',
};

const BUMP_RANK = { none: 0, minor: 1, major: 2 };
const OVERRIDE_BUMPS = ['auto', 'major', 'minor'];
const SHORT_YEAR_MODULO = 100;
const FIRST_MAJOR_OF_YEAR = 1;

// Accetta "feat(map): nuova barra", "fix!: x", "docs: guida".
// Rifiuta "feat:senza spazio" (manca lo spazio dopo i due punti) e "Aggiunge la barra".
const TITLE_RE = /^([a-z]+)(\([^)]+\))?(!)?: \S/;
// Tag di versione. Accetta "v26.1.0"; rifiuta "26.1.0", "v26.1" e "v26.1.0-rc1".
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
// Versione senza «v». Accetta "26.1.0"; rifiuta "v26.1.0" e "26.1".
const VERSION_RE = /^\d+\.\d+\.\d+$/;
// Campo `version` di primo livello di un package.json, con indentazione a due spazi.
// Accetta `  "version": "0.0.2",`; rifiuta `    "version": "x"` dentro un oggetto annidato.
const MANIFEST_VERSION_RE = /^(  "version": ")[^"]*(")/m;
// Subject dei merge commit. Accetta "Merge pull request #7 from a/feat-x";
// rifiuta "feat: Merge pull request …" (non inizia con «Merge»).
const MERGE_RE = /^Merge (pull request|branch|remote-tracking branch|tag) /;
// Commit della release automatica. Accetta "chore(release): v26.1.0";
// rifiuta "chore(deps): aggiorna lockfile".
const RELEASE_COMMIT_RE = /^chore\(release\)!?: /;

/** Legge il titolo come Conventional Commits. Restituisce null se il formato o il tipo non sono ammessi. */
function parseTitle(title) {
  const match = TITLE_RE.exec(title);
  if (!match) return null;
  const [, type, , breaking] = match;
  // Object.hasOwn: senza, un tipo come «constructor» troverebbe una proprietà del prototipo.
  if (!Object.hasOwn(BUMP_BY_TYPE, type)) return null;
  return { type, bump: breaking ? 'major' : BUMP_BY_TYPE[type] };
}

/** Controlla un titolo in Conventional Commits e dice quanto pesa in una release. */
export function checkTitle(title) {
  const parsed = parseTitle(title);
  if (parsed) return parsed;
  const match = TITLE_RE.exec(title);
  if (!match) {
    throw new Error(`Titolo "${title}" non in formato Conventional Commits: atteso "tipo(ambito): descrizione", es. "feat(map): …".`);
  }
  throw new Error(`Tipo "${match[1]}" non ammesso nel titolo: usa ${Object.keys(BUMP_BY_TYPE).join(', ')}.`);
}

/**
 * Classifica i subject dei commit dall'ultimo tag. I merge commit e i `chore(release): …`
 * non contano. I subject non conformi sono ignorati ma restituiti, perché il riepilogo
 * del run li elenchi: così si vede subito un commit che la release non ha contato.
 */
export function analyzeCommits(subjects) {
  const included = [];
  const ignored = [];
  const nonConforming = [];
  let bump = 'none';
  subjects.forEach((raw) => {
    const subject = raw.trim();
    if (!subject) return;
    if (MERGE_RE.test(subject) || RELEASE_COMMIT_RE.test(subject)) {
      ignored.push(subject);
      return;
    }
    const parsed = parseTitle(subject);
    if (!parsed) {
      nonConforming.push(subject);
      return;
    }
    included.push(subject);
    if (BUMP_RANK[parsed.bump] > BUMP_RANK[bump]) bump = parsed.bump;
  });
  return { bump, included, ignored, nonConforming };
}

/** Release che i commit giustificano: major, minor o none. */
export function bumpFromCommits(subjects) {
  return analyzeCommits(subjects).bump;
}

/** Il tipo finale: `auto` prende quello dei commit, `major` e `minor` lo forzano. */
export function resolveBump(override, detected) {
  if (override === 'auto') return detected;
  if (override === 'major' || override === 'minor') return override;
  throw new Error(`--bump "${override}" non valido: atteso ${OVERRIDE_BUMPS.join(', ')}.`);
}

// Il contatore più alto tra i tag dell'anno YY, come [MAJOR, MINOR]; null se non ce ne sono.
function latestCountersOfYear(tags, yy) {
  return tags
    .map((tag) => TAG_RE.exec(tag.trim()))
    .filter((match) => match !== null && Number(match[1]) === yy)
    .map((match) => [Number(match[2]), Number(match[3])])
    .reduce((best, counters) => {
      if (best === null) return counters;
      if (counters[0] > best[0] || (counters[0] === best[0] && counters[1] > best[1])) return counters;
      return best;
    }, null);
}

/** Versione successiva: YY dalla data UTC, contatori dai tag dello stesso anno. */
export function nextVersion(tags, bump, date = new Date()) {
  if (bump !== 'major' && bump !== 'minor') {
    throw new Error(`Bump "${bump}" non valido: atteso major o minor.`);
  }
  const yy = date.getUTCFullYear() % SHORT_YEAR_MODULO;
  const latest = latestCountersOfYear(tags, yy);
  // La prima release di un anno è sempre YY.1.0, qualunque sia il tipo. I tag di anni
  // precedenti (anche v0.0.2) non contano.
  if (latest === null) return `${yy}.${FIRST_MAJOR_OF_YEAR}.0`;
  if (bump === 'major') return `${yy}.${latest[0] + 1}.0`;
  return `${yy}.${latest[0]}.${latest[1] + 1}`;
}

/** Dal tag «v26.1.0» la versione «26.1.0»; null se il nome non ha il formato di release. */
export function versionFromTag(tag) {
  const match = TAG_RE.exec(tag);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

// Riga `"version"` di un manifest. Il file viene validato come JSON prima di scrivere.
function replaceManifestVersion(file, text, version) {
  if (!MANIFEST_VERSION_RE.test(text)) {
    throw new Error(`${file}: campo "version" di primo livello non trovato (atteso indentazione a due spazi).`);
  }
  // Funzione e non stringa: con `$1` seguito da una cifra, la stringa sarebbe ambigua.
  const updated = text.replace(MANIFEST_VERSION_RE, (_match, head, tail) => `${head}${version}${tail}`);
  if (JSON.parse(updated).version !== version) {
    throw new Error(`${file}: scrittura della versione non riuscita.`);
  }
  return updated;
}

/**
 * Scrive la versione in tutti i MANIFESTS. Prima calcola e valida tutti i file, poi scrive:
 * se un manifest è anomalo, nessuno viene toccato a metà.
 */
export function writeVersion(version, dir = REPO_ROOT) {
  if (!VERSION_RE.test(version)) {
    throw new Error(`Versione "${version}" non valida: attesa YY.MAJOR.MINOR senza «v».`);
  }
  const updates = MANIFESTS.map((file) => {
    const path = resolve(dir, file);
    const text = readFileSync(path, 'utf-8');
    return { path, updated: replaceManifestVersion(file, text, version) };
  });
  updates.forEach(({ path, updated }) => writeFileSync(path, updated));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    // LC_ALL=C: il messaggio «No names found» di git è riconosciuto solo in inglese.
    env: { ...process.env, LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Ultimo tag di versione raggiungibile da HEAD. Se non c'è nessun tag, git risponde
// «No names found»: allora si analizza tutta la storia. Ogni altro errore si rilancia.
function lastReleaseTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']).trim();
  } catch (err) {
    const stderr = String(err?.stderr ?? '');
    if (stderr.includes('No names found')) return null;
    throw err;
  }
}

function releaseCommits() {
  const lastTag = lastReleaseTag();
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const subjects = git(['log', '--format=%s', range]).split('\n');
  return { lastTag, ...analyzeCommits(subjects) };
}

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined) throw new Error(`--${name} richiede un valore.`);
  return value;
}

function checkTitleCommand(args) {
  const { type, bump } = checkTitle(option(args, 'title') ?? '');
  return `${type} → ${bump}`;
}

function nextCommand(args) {
  const raw = option(args, 'date');
  const date = raw === undefined ? new Date() : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Data "${raw}" non valida.`);
  const bump = resolveBump(option(args, 'bump') ?? 'auto', releaseCommits().bump);
  if (bump === 'none') {
    throw new Error('Niente da rilasciare: dall\'ultimo tag ci sono solo commit docs/ci/chore/test, o nessuno. Per forzare una release usa --bump major o minor.');
  }
  return nextVersion(git(['tag', '--list', 'v*']).split('\n'), bump, date);
}

function setCommand(args) {
  const version = args[0] ?? '';
  writeVersion(version);
  return `Versione impostata: ${version}`;
}

const COMMANDS = {
  'check-title': checkTitleCommand,
  commits: () => JSON.stringify(releaseCommits()),
  next: nextCommand,
  set: setCommand,
};

function main(args) {
  const [command, ...rest] = args;
  if (!command || !Object.hasOwn(COMMANDS, command)) {
    throw new Error(`Uso: release-version.mjs ${Object.keys(COMMANDS).join('|')} (vedi l'intestazione del file).`);
  }
  return COMMANDS[command](rest);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
