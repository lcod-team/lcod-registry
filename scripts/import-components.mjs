#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseId(rawId) {
  if (!rawId || typeof rawId !== 'string' || !rawId.startsWith('lcod://')) {
    throw new Error(`Invalid component id: ${rawId}`);
  }
  const [base, version] = rawId.split('@');
  if (!version) {
    throw new Error(`Missing version in id: ${rawId}`);
  }
  const pathSegments = base.replace('lcod://', '').split('/');
  return {
    idWithoutVersion: base,
    version,
    pathSegments
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  const content = await fs.readFile(file, 'utf-8');
  return JSON.parse(content);
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function collectFiles(rootDir, relativeDir = '') {
  const absolute = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryRel = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(rootDir, entryRel);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const fullPath = path.join(rootDir, entryRel);
      const data = await fs.readFile(fullPath);
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      files.push({
        path: entryRel.replace(/\\/g, '/'),
        sha256,
        size: data.length
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const componentsRootEnv = process.env.COMPONENTS_REPO_PATH;
  const componentsRoot = componentsRootEnv
    ? path.resolve(componentsRootEnv)
    : path.resolve(repoRoot, '../lcod-components');
  const manifestPath = path.join(componentsRoot, 'registry', 'components.std.json');
  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const componentsManifest = JSON.parse(manifestContent);
  if (!Array.isArray(componentsManifest) || componentsManifest.length === 0) {
    console.log('No components found in manifest.');
    return;
  }

  const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: componentsRoot, encoding: 'utf-8' });
  if (gitResult.status !== 0) {
    throw new Error(`Unable to determine components commit: ${gitResult.stderr}`);
  }
  const commit = gitResult.stdout.trim();

  const dateResult = spawnSync('git', ['show', '-s', '--format=%cI', commit], { cwd: componentsRoot, encoding: 'utf-8' });
  const publishedAt = dateResult.status === 0 ? dateResult.stdout.trim() : new Date().toISOString();

  const catalogPath = path.join(repoRoot, 'catalog.json');
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf-8'));
  const packages = Array.isArray(catalog.packages) ? catalog.packages.slice() : [];
  const packageIndex = new Map(packages.map((pkg) => [pkg.id, pkg]));

  for (const entry of componentsManifest) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.composePath !== 'string') {
      continue;
    }
    const { idWithoutVersion, version, pathSegments } = parseId(entry.id);
    const composeDir = path.dirname(entry.composePath);
    const componentDir = path.join(componentsRoot, composeDir);
    const relativeSourcePath = composeDir.replace(/\\/g, '/');

    const files = await collectFiles(componentDir);
    const manifest = {
      schema: 'lcod-registry/manifest@1',
      id: `${idWithoutVersion}@${version}`,
      publishedAt,
      source: {
        type: 'git',
        url: 'https://github.com/lcod-team/lcod-components',
        commit,
        path: relativeSourcePath
      },
      files: files.map((file) => ({
        path: path.posix.join(relativeSourcePath, file.path),
        sha256: file.sha256,
        size: file.size
      })),
      dependencies: []
    };

    const versionsPathSegments = pathSegments.slice();
    const packageDir = path.join(repoRoot, 'packages', ...versionsPathSegments);
    const versionDir = path.join(packageDir, version);
    await ensureDir(versionDir);
    const manifestFilePath = path.join(versionDir, 'manifest.json');
    await writeJson(manifestFilePath, manifest);

    const versionsFilePath = path.join(packageDir, 'versions.json');
    let versionsData;
    try {
      versionsData = await readJson(versionsFilePath);
    } catch (_) {
      versionsData = {
        schema: 'lcod-registry/versions@1',
        id: idWithoutVersion,
        versions: []
      };
    }
    if (!Array.isArray(versionsData.versions)) {
      versionsData.versions = [];
    }
    const manifestRelative = path.relative(repoRoot, manifestFilePath).replace(/\\/g, '/');
    const existing = versionsData.versions.find((item) => item.version === version);
    if (existing) {
      existing.manifest = manifestRelative;
    } else {
      versionsData.versions.push({ version, manifest: manifestRelative });
    }
    versionsData.versions.sort((a, b) => (a.version < b.version ? 1 : a.version > b.version ? -1 : 0));
    await writeJson(versionsFilePath, versionsData);

    const catalogEntry = {
      id: idWithoutVersion,
      registryId: 'official',
      versionsPath: path.relative(repoRoot, versionsFilePath).replace(/\\/g, '/')
    };
    if (!packageIndex.has(idWithoutVersion)) {
      packages.push(catalogEntry);
      packageIndex.set(idWithoutVersion, catalogEntry);
    }
  }

  catalog.packages = packages.sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(catalogPath, catalog);
  console.log(`Imported ${componentsManifest.length} components from ${manifestPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
