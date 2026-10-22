import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { AUTH_FILE } from './e2e/utils/auth';

// This repo always runs the suite against the OSSMC console plugin: activate
// the vendored kiali OSSMC branches (test skips and UI differences such as
// /projects detail links). Must be set before the specs are imported.
process.env.PLAYWRIGHT_OSSMC = 'true';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:9000';
const isCI = !!process.env.CI;

/** Jenkins / local video override: on | off | retain-on-failure (default). */
const videoMode = (process.env.PLAYWRIGHT_VIDEO ?? 'retain-on-failure') as 'on' | 'off' | 'retain-on-failure';

/**
 * Yarn scripts set PLAYWRIGHT_BLOB_NAME per suite so chained Jenkins runs
 * (run:junit / run:ambient:junit) keep one zip and one junit XML each — same
 * idea as Cypress results-[hash].xml. combine:reports then jrm-merges the XMLs
 * (and optionally merge-reports the blobs). Never overwrite a shared
 * junit-results.xml across suites or Jenkins only sees the last suite.
 */
const suiteReportName = process.env.PLAYWRIGHT_BLOB_NAME ?? 'results';
const junitOutputFile = `playwright/results/junit-${suiteReportName}.xml`;
const emitBlob = isCI || !!process.env.PLAYWRIGHT_BLOB_NAME;

const reporters: ReporterDescription[] = [
  ['list'],
  ...(emitBlob
    ? ([
        [
          'blob',
          {
            fileName: `${suiteReportName}.zip`,
            outputDir: 'playwright/blob-report'
          }
        ]
      ] as ReporterDescription[])
    : ([['html', { open: 'never', outputFolder: 'playwright/report' }]] as ReporterDescription[])),
  ['junit', { outputFile: junitOutputFile }]
];

/**
 * Projects mirror the Cypress run scope: (@core-1 or @core-2 or @ambient or
 * @waypoint or @waypoint-tracing) and not @skip-ossmc. Suite membership is
 * controlled by Playwright test tags (e.g. `{ tag: '@core-1' }`); every
 * project excludes @skip-ossmc. Overlapping tags use negative lookaheads
 * (e.g. @waypoint vs @waypoint-tracing).
 */
export default defineConfig({
  // Specs live in the vendored kiali tree (e2e/tests) and OSSMC-specific specs
  // (e2e/ossmc). Setup files are matched per-project via testMatch/testDir.
  testDir: './e2e',
  // Failure artifacts (screenshots, videos, traces) under playwright/ like Cypress outputs.
  outputDir: 'playwright/test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  // Jenkins shared runners have limited CPU/memory; cap at 2 to avoid OOM and
  // flaky timeouts under contention. Local runs use Playwright's cpu/2 default.
  workers: isCI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 40_000
  },
  reporter: reporters,
  grep: process.env.PLAYWRIGHT_GREP ? new RegExp(process.env.PLAYWRIGHT_GREP) : undefined,
  grepInvert: process.env.PLAYWRIGHT_GREP_INVERT ? new RegExp(process.env.PLAYWRIGHT_GREP_INVERT) : undefined,
  use: {
    baseURL,
    // OpenShift routes / CRC often use custom or self-signed certs
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1' || baseURL.startsWith('https://'),
    // Kiali interactive elements use data-test (not Playwright's default data-testid)
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: videoMode,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 40_000,
    navigationTimeout: 90_000
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      testDir: './e2e/global-setup'
    },
    {
      name: 'core-1',
      grep: /@core-1/,
      grepInvert: /@skip-ossmc/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    },
    {
      name: 'core-2',
      grep: /@core-2/,
      grepInvert: /@skip-ossmc/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    },
    {
      name: 'ambient',
      grep: /@ambient(?!-)/,
      grepInvert: /@skip-ossmc/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    },
    {
      name: 'waypoint',
      grep: /@waypoint(?!-)/,
      grepInvert: /@skip-ossmc/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    },
    {
      name: 'waypoint-tracing',
      grep: /@waypoint-tracing/,
      grepInvert: /@skip-ossmc/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    }
  ]
});
