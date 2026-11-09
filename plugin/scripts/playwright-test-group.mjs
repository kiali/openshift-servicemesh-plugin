#!/usr/bin/env node
/**
 * Run a grep-filtered Playwright suite for Jenkins TEST_TAGS.
 *
 * The config folds PLAYWRIGHT_GREP / PLAYWRIGHT_GREP_INVERT into each suite
 * project's membership rules (project grep replaces the top-level value), so
 * one invocation is enough: the unfiltered setup project runs first as a
 * dependency, then only the suite projects whose tests match the filter.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const playwrightBin = path.join(pluginRoot, 'node_modules', '.bin', 'playwright');

console.log(
  `Running filtered tests (grep=${process.env.PLAYWRIGHT_GREP ?? '<none>'}, grepInvert=${process.env.PLAYWRIGHT_GREP_INVERT ?? '<none>'})...`
);
// Unique blob so Jenkins combine:reports can merge with other suite zips (Cypress results-[hash].xml).
const suiteEnv = { ...process.env, PLAYWRIGHT_BLOB_NAME: process.env.PLAYWRIGHT_BLOB_NAME ?? 'test-group' };
const result = spawnSync(playwrightBin, ['test', '--pass-with-no-tests'], {
  cwd: pluginRoot,
  env: suiteEnv,
  stdio: 'inherit'
});
process.exit(result.status ?? 1);
