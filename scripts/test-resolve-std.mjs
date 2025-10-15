#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const kernelRoot = process.env.KERNEL_REPO_PATH
  ? path.resolve(process.env.KERNEL_REPO_PATH)
  : path.resolve(repoRoot, '../lcod-kernel-js');
const runComposePath = path.join(kernelRoot, 'bin', 'run-compose.mjs');

const child = spawn(
  'node',
  [runComposePath, '--compose', path.join(repoRoot, 'scripts', 'tests', 'resolve-std.lcp.yaml')],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      LCOD_REGISTRY_ROOT: repoRoot
    },
    stdio: 'inherit'
  }
);

child.on('exit', (code) => {
  process.exit(code);
});
