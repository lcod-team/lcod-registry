#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

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

async function writeIfChanged(relativePath, content) {
  const absolutePath = path.join(repoRoot, relativePath);
  let previous = null;
  try {
    previous = await fs.readFile(absolutePath, 'utf-8');
  } catch (_) {
    // missing file is fine
  }
  if (previous === content) {
    return false;
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');
  return true;
}

(async () => {
  try {
    const componentsRoot = await locatePath('lcod-components repository', process.env.COMPONENTS_REPO_PATH, [
      '../lcod-components',
      '../../lcod-components'
    ]);

    const manifestRelative = 'registry/components.std.json';
    const manifestPath = path.join(componentsRoot, manifestRelative);
    const manifestContent = await fs.readFile(manifestPath);
    const checksum = `sha256-${sha256Base64(manifestContent)}`;

    const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: componentsRoot, encoding: 'utf-8' });
    if (gitResult.status !== 0) {
      throw new Error(`Unable to determine components commit: ${gitResult.stderr || gitResult.stdout}`);
    }
    const commit = gitResult.stdout.trim();

    const urlPath = manifestRelative.replace(/\\/g, '/');
    const rawUrl = `https://raw.githubusercontent.com/lcod-team/lcod-components/${commit}/${urlPath}`;

    const payload = {
      schema: 'lcod-registry/catalogues@1',
      catalogues: [
        {
          id: 'tooling/std',
          description: 'Standard tooling catalogue exported from lcod-components.',
          kind: 'https',
          url: rawUrl,
          commit,
          checksum,
          priority: 50,
          metadata: {
            sourceRepo: 'https://github.com/lcod-team/lcod-components',
            manifestPath: urlPath
          }
        }
      ]
    };

    const nextContent = `${JSON.stringify(payload, null, 2)}\n`;
    const changed = await writeIfChanged('catalogues.json', nextContent);
    console.log(changed ? 'catalogues.json updated' : 'catalogues.json up-to-date');
  } catch (err) {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exitCode = 1;
  }
})();
