// Verifica che il tag di release e la `version` dei manifest del workspace coincidano,
// prima di compilare artefatti con un nome sbagliato.
//
//   node scripts/check-release-version.mjs v26.1.0
//
// Il tag deve essere vYY.MAJOR.MINOR (docs/RELEASE.md). Se un manifest ha un'altra
// versione, il programma le elenca tutte e termina con errore.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFESTS, versionFromTag } from './release-version.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readManifestVersion(file, dir) {
  try {
    const manifest = JSON.parse(readFileSync(resolve(dir, file), 'utf-8'));
    return String(manifest.version ?? '(manca)');
  } catch (err) {
    // Il messaggio di JSON.parse non dice quale file è rotto: lo si aggiunge qui.
    throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

/** Elenca i manifest la cui `version` non è quella attesa. Lista vuota = tutto allineato. */
export function checkManifests(expected, dir = REPO_ROOT) {
  return MANIFESTS.flatMap((file) => {
    const version = readManifestVersion(file, dir);
    return version === expected ? [] : [`${file}: version ${version}, atteso ${expected}`];
  });
}

function main(args) {
  const tag = args[0] ?? '';
  const expected = versionFromTag(tag);
  if (expected === null) {
    throw new Error(`Tag "${tag}" non valido: atteso vYY.MAJOR.MINOR (es. v26.1.0).`);
  }
  const errors = checkManifests(expected);
  if (errors.length > 0) {
    throw new Error([
      `La versione non coincide con il tag ${tag}:`,
      ...errors.map((error) => `  - ${error}`),
      `Allinea i manifest con "node scripts/release-version.mjs set ${expected}" e rifai il tag (docs/RELEASE.md).`,
    ].join('\n'));
  }
  return `OK: tag ${tag} coerente con ${MANIFESTS.length} manifest (${expected}).`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
