#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sha256Base64(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64');
}

async function locateComponentsRoot() {
  const envPath = process.env.COMPONENTS_REPO_PATH;
  const candidates = [
    envPath,
    path.resolve(repoRoot, 'lcod-components'),
    path.resolve(repoRoot, '../lcod-components'),
    path.resolve(repoRoot, '../../lcod-components')
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return path.resolve(candidate);
    } catch (_) {
      // ignore
    }
  }
  throw new Error('Unable to locate lcod-components repository. Provide COMPONENTS_REPO_PATH.');
}

(async () => {
  try {
    const jsonlContent = await fs.readFile(path.join(repoRoot, 'catalogues.jsonl'), 'utf-8');
    const lines = jsonlContent.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length < 2) {
      throw new Error('catalogues.jsonl missing entries');
    }

    const stdEntry = lines
      .slice(1)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          throw new Error(`catalogues.jsonl invalid JSON on line ${index + 2}: ${err.message}`);
        }
      })
      .find((entry) => entry && entry.id === 'tooling/std');

    if (!stdEntry) {
      throw new Error('catalogues.jsonl: tooling/std entry missing');
    }
    if (typeof stdEntry.url !== 'string' || !stdEntry.url.length) {
      throw new Error('catalogues.jsonl: tooling/std entry missing url');
    }

    const componentsRoot = await locateComponentsRoot();
    const manifestRelative = 'registry/components.std.jsonl';
    const manifestPath = path.join(componentsRoot, manifestRelative);
    const manifestContent = await fs.readFile(manifestPath);
    const expectedChecksum = `sha256-${sha256Base64(manifestContent)}`;
    const metadata = stdEntry.metadata || {};
    if (metadata.checksum !== expectedChecksum) {
      throw new Error(`Checksum mismatch. Expected ${expectedChecksum}, found ${metadata.checksum}`);
    }

    const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: componentsRoot, encoding: 'utf-8' });
    if (gitResult.status !== 0) {
      throw new Error(`Unable to read components commit: ${gitResult.stderr || gitResult.stdout}`);
    }
    const commit = gitResult.stdout.trim();
    if (metadata.commit !== commit) {
      throw new Error(`Commit mismatch. Expected ${commit}, found ${metadata.commit}`);
    }
    if (!stdEntry.url.includes(commit)) {
      throw new Error('catalogues.jsonl: tooling/std url must embed the pinned commit');
    }

    console.log('Tooling/std catalogue pointer verified successfully.');
  } catch (err) {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  }
})();
