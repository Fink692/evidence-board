import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const workspace = resolve(process.cwd());
const target = resolve(workspace, 'dist');
if (dirname(target) !== workspace || JSON.parse(readFileSync(resolve(workspace, 'package.json'), 'utf8')).name !== 'evidence-board') throw new Error('Refusing to clean a directory outside the Evidence Board build.');
console.log(`Cleaning generated output: ${target}`);
rmSync(target, { recursive: true, force: true });
