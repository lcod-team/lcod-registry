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

async function validate() {
  const jsonlPath = path.join(repoRoot, 'catalogues.jsonl');
  let jsonlContent;
  try {
    jsonlContent = await fs.readFile(jsonlPath, 'utf-8');
  } catch (err) {
    addError(`Unable to read catalogues.jsonl: ${err.message}`);
    return;
  }

  const lines = jsonlContent.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    addError('catalogues.jsonl: file is empty');
    return;
  }

  let header;
  try {
    header = JSON.parse(lines[0]);
  } catch (err) {
    addError(`catalogues.jsonl: failed to parse header: ${err.message}`);
    return;
  }
  if (header.type !== 'manifest' || header.schema !== 'lcod-manifest/list@1') {
    addError('catalogues.jsonl: header must declare type "manifest" and schema "lcod-manifest/list@1"');
  }

  const entries = [];
  const seenIds = new Set();
  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      addError(`catalogues.jsonl: failed to parse line ${index + 1}: ${err.message}`);
      continue;
    }
    if (!parsed || typeof parsed !== 'object') {
      addError(`catalogues.jsonl: entry at line ${index + 1} is not an object`);
      continue;
    }
    const { id, url } = parsed;
    if (typeof id !== 'string' || !id.length) {
      addError(`catalogues.jsonl: entry at line ${index + 1} missing id`);
      continue;
    }
    if (seenIds.has(id)) {
      addError(`catalogues.jsonl: duplicate entry id ${id}`);
      continue;
    }
    seenIds.add(id);
    if (typeof url !== 'string' || !url.length) {
      addError(`catalogues.jsonl: entry ${id} missing url`);
      continue;
    }
    entries.push(parsed);
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

  const stdEntry = entries.find((entry) => entry.id === 'tooling/std');
  if (!stdEntry) {
    addError('catalogues.jsonl: missing tooling/std entry');
    return;
  }

  const manifestRelative = 'registry/components.std.jsonl';
  const manifestPath = path.join(componentsRoot, manifestRelative);
  let manifestContent;
  try {
    manifestContent = await fs.readFile(manifestPath);
  } catch (err) {
    addError(`Unable to read ${manifestRelative} from components repo: ${err.message}`);
    return;
  }

  const expectedChecksum = `sha256-${sha256Base64(manifestContent)}`;
  const metadata = stdEntry.metadata || {};
  if (metadata.checksum && metadata.checksum !== expectedChecksum) {
    addError(`catalogues.jsonl: metadata.checksum mismatch for tooling/std (expected ${expectedChecksum}, found ${metadata.checksum})`);
  }

  const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: componentsRoot, encoding: 'utf-8' });
  if (gitResult.status !== 0) {
    addError(`Unable to determine components commit: ${gitResult.stderr || gitResult.stdout}`);
  } else {
    const commit = gitResult.stdout.trim();
    if (metadata.commit && metadata.commit !== commit) {
      addError(`catalogues.jsonl: metadata.commit mismatch for tooling/std (expected ${commit}, found ${metadata.commit})`);
    }
    if (typeof stdEntry.url === 'string' && !stdEntry.url.includes(commit)) {
      addError('catalogues.jsonl: tooling/std url should embed the pinned commit');
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
