// node --test scripts/release-version.test.mjs (oppure pnpm test:release)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkManifests } from './check-release-version.mjs';
import {
  MANIFESTS,
  analyzeCommits,
  bumpFromCommits,
  checkTitle,
  nextVersion,
  resolveBump,
  versionFromTag,
  writeVersion,
} from './release-version.mjs';

const IN_2026 = new Date('2026-10-31T10:00:00Z');

test('il tipo del titolo decide quanto pesa in una release', () => {
  assert.deepEqual(checkTitle('feat(map): nuova barra'), { type: 'feat', bump: 'major' });
  assert.equal(checkTitle('feat: senza ambito').bump, 'major');
  assert.equal(checkTitle('fix(save): backup duplicati').bump, 'minor');
  assert.equal(checkTitle('perf(layout): stima più rapida').bump, 'minor');
  assert.equal(checkTitle('docs(agents): regole dei tag').bump, 'none');
  assert.equal(checkTitle('ci: cache pnpm').bump, 'none');
  assert.equal(checkTitle('fix(core)!: cambia il formato').bump, 'major');
});

test('titoli non validi sono rifiutati', () => {
  assert.throws(() => checkTitle('Aggiunge la barra'), /Conventional Commits/);
  assert.throws(() => checkTitle('feat:senza spazio'), /Conventional Commits/);
  assert.throws(() => checkTitle('feature(map): x'), /non ammesso/);
  // Un nome di proprietà del prototipo non è un tipo: senza Object.hasOwn passerebbe.
  assert.throws(() => checkTitle('constructor: x'), /non ammesso/);
});

test('almeno un feat tra i commit → major', () => {
  assert.equal(bumpFromCommits(['fix(save): a', 'feat(map): b', 'docs: c']), 'major');
});

test('solo correzioni e simili → minor', () => {
  assert.equal(bumpFromCommits(['fix(save): a', 'docs: c']), 'minor');
  assert.equal(bumpFromCommits(['refactor(core): a']), 'minor');
  assert.equal(bumpFromCommits(['perf: a', 'ci: b']), 'minor');
});

test('solo docs/ci/chore/test o nessun commit → none', () => {
  assert.equal(bumpFromCommits(['docs(agents): a', 'ci: b', 'chore(deps): c', 'test(core): d']), 'none');
  assert.equal(bumpFromCommits([]), 'none');
});

test('un tipo con «!» → major', () => {
  assert.equal(bumpFromCommits(['fix(core)!: cambia il formato']), 'major');
  assert.equal(bumpFromCommits(['docs!: x', 'fix: y']), 'major');
});

test('merge commit e chore(release) sono ignorati', () => {
  const subjects = [
    'Merge pull request #7 from gioelerosana/feat/x',
    "Merge branch 'main' into feat/y",
    'chore(release): v26.2.1',
    'docs: guida',
  ];
  const result = analyzeCommits(subjects);
  assert.equal(result.bump, 'none');
  assert.deepEqual(result.included, ['docs: guida']);
  assert.equal(result.ignored.length, 3);
  assert.deepEqual(result.nonConforming, []);
});

test('un chore(release) con «!» o un merge che cita feat non pesano', () => {
  assert.equal(bumpFromCommits(['chore(release)!: v27', 'Merge pull request #1 from a/feat: x']), 'none');
});

test('subject non conformi sono ignorati e restituiti', () => {
  const result = analyzeCommits(['Aggiunge la barra', 'feature(map): x', 'fix(save): a', '']);
  assert.equal(result.bump, 'minor');
  assert.deepEqual(result.included, ['fix(save): a']);
  assert.deepEqual(result.nonConforming, ['Aggiunge la barra', 'feature(map): x']);
});

test('un subject da squash merge con (#NN) conta', () => {
  assert.equal(bumpFromCommits(['feat(editor): barra flottante (#12)']), 'major');
});

test('da v0.0.2 con feat e fix nel 2026 → 26.1.0', () => {
  const bump = bumpFromCommits(['feat(home): corsi preferiti', 'fix(main): immagini dei corsi']);
  assert.equal(nextVersion(['v0.0.1', 'v0.0.2'], bump, IN_2026), '26.1.0');
});

test('da v26.1.0 con un fix → 26.1.1', () => {
  const bump = bumpFromCommits(['fix(save): backup']);
  assert.equal(nextVersion(['v0.0.2', 'v26.1.0'], bump, IN_2026), '26.1.1');
});

test('da v26.1.3 con un feat → 26.2.0', () => {
  const bump = bumpFromCommits(['feat(map): nuova barra']);
  assert.equal(nextVersion(['v26.1.0', 'v26.1.3'], bump, IN_2026), '26.2.0');
});

test('solo docs o chore → nessuna release', () => {
  const bump = bumpFromCommits(['docs(release): guida', 'chore(deps): aggiorna']);
  assert.equal(bump, 'none');
  assert.throws(() => nextVersion(['v26.1.0'], bump, IN_2026), /non valido/);
});

test('versione successiva nello stesso anno', () => {
  const tags = ['v0.0.1', 'v0.0.2', 'v26.1.0', 'v26.2.0', 'v26.2.1', 'v26.10.0'];
  assert.equal(nextVersion(tags, 'major', IN_2026), '26.11.0');
  assert.equal(nextVersion(tags, 'minor', IN_2026), '26.10.1');
  assert.equal(nextVersion(['v26.3.4'], 'minor', IN_2026), '26.3.5');
});

test('cambio anno → 27.1.0, qualunque sia il tipo', () => {
  const nextYear = new Date('2027-01-02T00:00:00Z');
  assert.equal(nextVersion(['v26.4.2'], 'major', nextYear), '27.1.0');
  assert.equal(nextVersion(['v26.4.2'], 'minor', nextYear), '27.1.0');
});

test("la prima release dell'anno è YY.1.0", () => {
  const tags = ['v0.0.1', 'v0.0.2', 'v26.4.2'];
  assert.equal(nextVersion(tags, 'major', new Date('2026-01-01T00:00:00Z')), '26.5.0');
  assert.equal(nextVersion(['v0.0.2'], 'minor', IN_2026), '26.1.0');
  assert.equal(nextVersion([], 'major', IN_2026), '26.1.0');
});

test('bump none non produce una versione', () => {
  assert.throws(() => nextVersion([], 'none'), /non valido/);
});

test('--bump forza il tipo; auto usa quello dei commit', () => {
  assert.equal(resolveBump('major', 'none'), 'major');
  assert.equal(resolveBump('minor', 'major'), 'minor');
  assert.equal(resolveBump('auto', 'minor'), 'minor');
  assert.throws(() => resolveBump('patch', 'minor'), /non valido/);
  // Forzare una release da commit solo docs: il tipo è quello scelto a mano.
  const forced = resolveBump('minor', bumpFromCommits(['docs: guida']));
  assert.equal(nextVersion(['v26.1.0'], forced, IN_2026), '26.1.1');
});

test('dal tag si ricava la versione solo se il formato è vYY.MAJOR.MINOR', () => {
  assert.equal(versionFromTag('v26.1.0'), '26.1.0');
  assert.equal(versionFromTag('26.1.0'), null);
  assert.equal(versionFromTag('v26.1.0-rc1'), null);
});

/** Crea in una cartella temporanea i manifest del workspace con la versione data. */
function makeWorkspace(version) {
  const dir = mkdtempSync(join(tmpdir(), 'release-version-'));
  MANIFESTS.forEach((file) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), manifestText(version));
  });
  return dir;
}

// Un manifest con un campo `version` annidato: non deve essere toccato.
function manifestText(version) {
  return `{\n  "name": "x",\n  "version": "${version}",\n  "scripts": {\n    "version": "non toccare"\n  }\n}\n`;
}

test('set scrive tutti i manifest preservando formattazione e newline finale', () => {
  const dir = makeWorkspace('0.0.2');
  try {
    writeVersion('26.1.0', dir);
    MANIFESTS.forEach((file) => {
      assert.equal(readFileSync(join(dir, file), 'utf-8'), manifestText('26.1.0'), file);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('set rifiuta una versione con la «v» e non tocca nessun file', () => {
  const dir = makeWorkspace('0.0.2');
  try {
    assert.throws(() => writeVersion('v26.1.0', dir), /non valida/);
    assert.equal(readFileSync(join(dir, MANIFESTS[0]), 'utf-8'), manifestText('0.0.2'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-release-version: elenca i manifest disallineati dal tag', () => {
  const dir = makeWorkspace('0.0.2');
  try {
    assert.deepEqual(checkManifests('0.0.2', dir), []);
    assert.equal(checkManifests('26.1.0', dir).length, MANIFESTS.length);
    writeVersion('26.1.0', dir);
    assert.deepEqual(checkManifests('26.1.0', dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
