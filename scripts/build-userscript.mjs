import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const outputDir = path.join(rootDir, 'dist');

await mkdir(outputDir, { recursive: true });

const userscriptHeader = `// ==UserScript==
// @name         Qobuz + Tidal on RYM Charts
// @namespace    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @version      ${packageJson.version}
// @description  Hide Rate Your Music chart results that do not include a Qobuz or Tidal link.
// @author       ${packageJson.author}
// @match        https://rateyourmusic.com/charts/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @supportURL   https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/issues
// @downloadURL  https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js
// @updateURL    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js
// ==/UserScript==`;

await build({
  entryPoints: [path.join(rootDir, 'src', 'userscript.js')],
  outfile: path.join(outputDir, 'qobuz-on-rym-charts.user.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  legalComments: 'none',
  banner: {
    js: userscriptHeader,
  },
});
