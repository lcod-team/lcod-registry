#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const errors = [];

const addError = (message) => {
  errors.push(message);
};

const readJson = async (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    return { path: absolutePath, value: JSON.parse(content) };
  } catch (err) {
    throw new Error(`Failed to read ${relativePath}: ${err.message}`);
  }
};

const manifestPathFor = (pkgId, version) => {
  return `packages/${pkgId.replace('lcod://', '').replace(/\\/g, '/')}/${version}/manifest.json`;
};

const toPosix = (segment) => segment.replace(/\\/g, '/');

const compareSemverDesc = (prev, current) => {
  const parse = (value) => value.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const a = parse(prev);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av !== bv) return av > bv;
    } else {
      const as = String(av);
      const bs = String(bv);
      if (as !== bs) return as > bs;
    }
  }
  return true;
};

async function validate() {
  const { value: catalog } = await readJson('catalog.json');

  if (!Array.isArray(catalog.packages)) {
    addError('catalog.json: "packages" must be an array');
    return;
  }

  const seenPackageIds = new Set();

  for (const pkg of catalog.packages) {
    if (!pkg || typeof pkg !== 'object') {
      addError('catalog.json: invalid package entry (not an object)');
      continue;
    }
    const pkgId = pkg.id;
    if (typeof pkgId !== 'string' || pkgId.length === 0) {
      addError('catalog.json: package entry missing "id"');
      continue;
    }
    if (seenPackageIds.has(pkgId)) {
      addError(`catalog.json: duplicate package id ${pkgId}`);
      continue;
    }
    seenPackageIds.add(pkgId);

    if (typeof pkg.versionsPath !== 'string' || pkg.versionsPath.length === 0) {
      addError(`catalog.json: ${pkgId} missing "versionsPath"`);
      continue;
    }

    let versions;
    try {
      ({ value: versions } = await readJson(pkg.versionsPath));
    } catch (err) {
      addError(err.message);
      continue;
    }

    if (versions.id !== pkgId) {
      addError(`${pkg.versionsPath}: id mismatch (expected ${pkgId}, found ${versions.id})`);
    }

    if (!Array.isArray(versions.versions) || versions.versions.length === 0) {
      addError(`${pkg.versionsPath}: versions array must be non-empty`);
      continue;
    }

    let previousVersion = null;
    const seenVersions = new Set();

    for (const entry of versions.versions) {
      if (!entry || typeof entry !== 'object') {
        addError(`${pkg.versionsPath}: invalid version entry (not an object)`);
        continue;
      }
      const version = entry.version;
      if (typeof version !== 'string' || version.length === 0) {
        addError(`${pkg.versionsPath}: entry missing "version"`);
        continue;
      }
      if (seenVersions.has(version)) {
        addError(`${pkg.versionsPath}: duplicate version ${version}`);
      }
      seenVersions.add(version);

      if (previousVersion && !compareSemverDesc(previousVersion, version)) {
        addError(`${pkg.versionsPath}: versions must be ordered newest to oldest (found ${previousVersion} before ${version})`);
      }
      previousVersion = version;

      const manifestRelative = entry.manifest || manifestPathFor(pkgId.replace('lcod://', ''), version);
      if (typeof manifestRelative !== 'string' || manifestRelative.length === 0) {
        addError(`${pkg.versionsPath}: ${version} missing "manifest" field`);
        continue;
      }

      let manifest;
      try {
        ({ value: manifest } = await readJson(manifestRelative));
      } catch (err) {
        addError(err.message);
        continue;
      }

      const expectedId = `${pkgId}@${version}`;
      if (manifest.id !== expectedId) {
        addError(`${manifestRelative}: id mismatch (expected ${expectedId}, found ${manifest.id})`);
      }
      if (!manifest.source || typeof manifest.source !== 'object') {
        addError(`${manifestRelative}: missing source metadata`);
      } else {
        if (manifest.source.commit === 'SPEC_COMMIT_PLACEHOLDER') {
          addError(`${manifestRelative}: source.commit must not be SPEC_COMMIT_PLACEHOLDER`);
        }
      }
      if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
        addError(`${manifestRelative}: files array must be non-empty`);
      } else {
        for (const fileEntry of manifest.files) {
          if (!fileEntry || typeof fileEntry.path !== 'string') {
            addError(`${manifestRelative}: invalid file entry (missing path)`);
            continue;
          }
          if (typeof fileEntry.sha256 !== 'string' || fileEntry.sha256.length === 0) {
            addError(`${manifestRelative}: file ${fileEntry.path} missing sha256`);
          }
        }
      }
    }
  }
}

(async () => {
  try {
    await validate();
  } catch (err) {
    addError(err instanceof Error ? err.message : String(err));
  }

  if (errors.length > 0) {
    console.error('Registry validation failed:');
    for (const message of errors) {
      console.error(`- ${message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Registry validation passed.');
  }
})();
