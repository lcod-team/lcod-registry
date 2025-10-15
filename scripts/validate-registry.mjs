#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const errors = [];

function addError(message) {
  errors.push(message);
}

async function locatePath(name, envVar, fallbacks) {
  if (envVar && envVar.length) {
    const candidate = path.resolve(envVar);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch (_) {
      // ignore
    }
  }
  for (const fallback of fallbacks) {
    const candidate = path.resolve(repoRoot, fallback);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch (_) {
      // ignore
    }
  }
  throw new Error(`Unable to locate ${name}. Tried: ${[envVar, ...fallbacks].filter(Boolean).join(', ')}`);
}

function sha256Base64(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64');
}

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = await fs.readFile(absolutePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse ${relativePath}: ${err.message}`);
  }
}

async function validate() {
  const catalogues = await readJson('catalogues.json');

  if (catalogues.schema !== 'lcod-registry/catalogues@1') {
    addError('catalogues.json: schema must be "lcod-registry/catalogues@1"');
    return;
  }
  if (!Array.isArray(catalogues.catalogues) || catalogues.catalogues.length === 0) {
    addError('catalogues.json: catalogues array must be non-empty');
    return;
  }

  const seenIds = new Set();
  const allowedKinds = new Set(['https', 'http', 'git', 'file']);

  for (const entry of catalogues.catalogues) {
    if (!entry || typeof entry !== 'object') {
      addError('catalogues.json: invalid catalogue entry (not an object)');
      continue;
    }
    const { id, url, kind, checksum, priority } = entry;
    if (typeof id !== 'string' || id.length === 0) {
      addError('catalogues.json: catalogue entry missing id');
      continue;
    }
    if (seenIds.has(id)) {
      addError(`catalogues.json: duplicate catalogue id ${id}`);
      continue;
    }
    seenIds.add(id);

    if (typeof kind !== 'string' || !allowedKinds.has(kind)) {
      addError(`catalogues.json: catalogue ${id} has invalid kind ${kind}`);
    }
    if (typeof url !== 'string' || url.length === 0) {
      addError(`catalogues.json: catalogue ${id} missing url`);
    }
    if (checksum !== undefined) {
      if (typeof checksum !== 'string' || !/^sha256-[A-Za-z0-9+/=_-]+$/.test(checksum)) {
        addError(`catalogues.json: catalogue ${id} has invalid checksum format`);
      }
    }
    if (priority !== undefined && (typeof priority !== 'number' || !Number.isInteger(priority))) {
      addError(`catalogues.json: catalogue ${id} has invalid priority value`);
    }
  }

  if (errors.length > 0) {
    return;
  }

  // Cross-check known catalogue against local components repository for determinism.
  let componentsRoot = null;
  try {
    componentsRoot = await locatePath('lcod-components repository', process.env.COMPONENTS_REPO_PATH, [
      'lcod-components',
      '../lcod-components',
      '../../lcod-components'
    ]);
  } catch (err) {
    addError(err.message);
    return;
  }

  const stdEntry = catalogues.catalogues.find((entry) => entry.id === 'tooling/std');
  if (!stdEntry) {
    addError('catalogues.json: missing tooling/std catalogue entry');
    return;
  }

  const manifestRelative = 'registry/components.std.json';
  const manifestPath = path.join(componentsRoot, manifestRelative);
  let manifestContent;
  try {
    manifestContent = await fs.readFile(manifestPath);
  } catch (err) {
    addError(`Unable to read ${manifestRelative} from components repo: ${err.message}`);
    return;
  }

  const expectedChecksum = `sha256-${sha256Base64(manifestContent)}`;
  if (stdEntry.checksum && stdEntry.checksum !== expectedChecksum) {
    addError(`catalogues.json: checksum mismatch for tooling/std (expected ${expectedChecksum}, found ${stdEntry.checksum})`);
  }

  const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: componentsRoot, encoding: 'utf-8' });
  if (gitResult.status !== 0) {
    addError(`Unable to determine components commit: ${gitResult.stderr || gitResult.stdout}`);
  } else {
    const commit = gitResult.stdout.trim();
    if (stdEntry.commit && stdEntry.commit !== commit) {
      addError(`catalogues.json: commit mismatch for tooling/std (expected ${commit}, found ${stdEntry.commit})`);
    }
    if (typeof stdEntry.url === 'string' && !stdEntry.url.includes(commit)) {
      addError('catalogues.json: tooling/std url should embed the pinned commit');
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
