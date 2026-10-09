import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Repository development tooling only: install the reviewed dependency-free
// archive without asking npm to resolve controller/runtime dependencies.
const root = fileURLToPath(new URL('..', import.meta.url));
function statIfPresent(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
function checkOwnedDirectory(path) {
  const stat = statIfPresent(path);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Preserve non-directory or symlinked tooling path: ${path}`);
  return stat;
}
const args = process.argv.slice(2);
if (args.length !== 1) throw new Error('Use npm run attribution:install -- PATH_TO_REVIEWED_ARCHIVE');
const release = JSON.parse(readFileSync(resolve(root, '.attribution-release.json'), 'utf8'));
if (release.package !== '@foss-earth/ci' || release.schemaVersion !== 1) throw new Error('Invalid common release descriptor');
const bytes = readFileSync(resolve(args[0]));
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (bytes.length !== release.sizeBytes || sha256 !== release.artifactSha256) throw new Error('Archive differs from the reviewed common pin');

// This exact archive's paths/types were reviewed with its digest. Retain a
// byte-stable copy and all installation material in owner scratch storage.
const scratch = resolve(root, 'build');
const modules = resolve(root, 'node_modules');
const namespace = resolve(modules, '@foss-earth');
const installed = resolve(namespace, 'ci');
for (const path of [root, scratch, modules, namespace, installed]) checkOwnedDirectory(path);
if (!statIfPresent(scratch)) mkdirSync(scratch);
const staging = mkdtempSync(resolve(scratch, `attribution-install-${new Date().toISOString().slice(0, 10)}-`));
const archive = resolve(staging, 'reviewed.tgz');
writeFileSync(archive, bytes, { flag: 'wx' });
execFileSync('tar', ['-xzf', archive, '-C', staging], { stdio: 'pipe' });
const artifact = resolve(staging, 'package');
const manifest = JSON.parse(readFileSync(resolve(artifact, 'package.json'), 'utf8'));
if (manifest.name !== release.package || manifest.version !== release.version) throw new Error('Archive package identity differs from the reviewed pin');
const { verifyReleaseIntegrity } = await import(pathToFileURL(resolve(artifact, 'src/conformance.mjs')).href);
verifyReleaseIntegrity(artifact, release);

if (statIfPresent(installed)) {
  // Refuse to overwrite another installation, including neighboring symlinks.
  verifyReleaseIntegrity(installed, release);
} else {
  if (!checkOwnedDirectory(modules)) mkdirSync(modules);
  if (!checkOwnedDirectory(namespace)) mkdirSync(namespace);
  renameSync(artifact, installed);
}
console.log(JSON.stringify({ installed, staging, revision: release.revision, artifactSha256: sha256, sizeBytes: bytes.length }));
