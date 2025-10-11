#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

async function importModule(root, relative) {
  const target = path.join(root, relative);
  return import(pathToFileURL(target));
}

(async () => {
  try {
    const specRoot = await locatePath('lcod-spec repository', process.env.SPEC_REPO_PATH, [
      '../lcod-spec',
      '../../lcod-spec'
    ]);
    const kernelRoot = await locatePath('lcod-kernel-js repository', process.env.KERNEL_REPO_PATH, [
      '../lcod-kernel-js',
      '../../lcod-kernel-js'
    ]);

    process.env.SPEC_REPO_PATH = specRoot;

    const { Registry, Context } = await importModule(kernelRoot, 'src/registry.js');
    const { registerNodeCore, registerNodeResolverAxioms } = await importModule(kernelRoot, 'src/core/index.js');
    const { registerDemoAxioms } = await importModule(kernelRoot, 'src/axioms.js');
    const { registerFlowPrimitives } = await importModule(kernelRoot, 'src/flow/register.js');
    const { registerTooling } = await importModule(kernelRoot, 'src/tooling/index.js');
    const { registerRegistryComponents } = await importModule(kernelRoot, 'src/tooling/registry-components.js');

    const baseRegistry = registerTooling(
      registerFlowPrimitives(
        registerDemoAxioms(
          registerNodeResolverAxioms(
            registerNodeCore(new Registry())
          )
        )
      )
    );
    await registerRegistryComponents(baseRegistry);

    const ctx = new Context(baseRegistry);
    const { packagesJsonl, registryJson, warnings } = await ctx.call(
      'lcod://tooling/registry/catalog/generate@0.1.0',
      {
        rootPath: repoRoot,
        catalogPath: 'catalog.json'
      }
    );

    if (Array.isArray(warnings) && warnings.length > 0) {
      console.error('Registry generation produced warnings:');
      for (const warning of warnings) {
        console.error(`- ${warning}`);
      }
      process.exitCode = 1;
      return;
    }

    const writeIfChanged = async (target, content) => {
      const absolute = path.join(repoRoot, target);
      let previous = null;
      try {
        previous = await fs.readFile(absolute, 'utf-8');
      } catch (_) {
        // missing file
      }
      if (previous === content) {
        return false;
      }
      await fs.writeFile(absolute, content, 'utf-8');
      return true;
    };

    const registryContent = `${JSON.stringify(registryJson, null, 2)}\n`;
    const jsonlChanged = await writeIfChanged('packages.jsonl', packagesJsonl);
    const registryChanged = await writeIfChanged('registry.json', registryContent);

    const summary = [];
    if (jsonlChanged) summary.push('packages.jsonl updated');
    if (registryChanged) summary.push('registry.json updated');
    if (!summary.length) summary.push('catalog up-to-date');

    console.log(summary.join('; '));
  } catch (err) {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exitCode = 1;
  }
})();
