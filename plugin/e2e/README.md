# Playwright e2e (OSSMC)

Playwright port of the OSSMC Cypress suite (kiali/openshift-servicemesh-plugin cutover, phase 2 of
[kiali#9712](https://github.com/kiali/kiali/issues/9712)). Mirrors the layout and conventions of
`frontend/e2e/` in the [kiali](https://github.com/kiali/kiali) repo: native Playwright Test, Page
Object Models extending `BasePage`, suite membership via `tag` options matched by project `grep`,
`data-test` as `testIdAttribute`.

Layout:

- `tests/`, `pages/`, `utils/`, `fixtures/` — **vendored from kiali `frontend/e2e/`**; never modify
  them here. Synced by `hack/copy-frontend-src-to-ossmc.sh` (from the kiali repo):
  ```bash
  hack/copy-frontend-src-to-ossmc.sh --source-ref epic/playwright-migration --skip-branch
  ```
  The sync rewrites two kiali-isms for this repo: the ESM `import.meta.url` dirname helper becomes
  the `__dirname` CJS global (the plugin package is CommonJS), and `utils/demoApps.ts` points at
  `_output/kiali/hack/istio` (kiali hack scripts land there via `hack/download-hack-scripts.sh`).
  The sync also replaces `utils/kialiUrl.ts` with a re-export of the OSSMC-owned URL adapter,
  which translates standalone `/console/` paths to Console plugin routes, including native
  Kubernetes resource tabs. Kiali `/api` paths are routed through the Console service proxy
  at `/api/proxy/plugin/ossmconsole/kiali/api`; existing proxy URLs pass through unchanged.
- `global-setup/auth.setup.ts` — OSSMC-owned. OpenShift Console OAuth login (htpasswd IdP),
  persists `storageState` for the suite projects. OSSMC always runs on OpenShift; there is no
  anonymous strategy.
- `ossmc/` — OSSMC-owned specs and helpers (Console login, sidebar navigation).
- `tsconfig.json` — typechecks only the OSSMC-owned files that do not import the vendored
  tree (`global-setup/`, `ossmc/utils/`). The vendored tree — and the `ossmc/` specs, pages
  and fixtures that import it — is excluded because kiali does not typecheck `frontend/e2e`
  either (it has latent type errors; Playwright transpiles without typechecking).

Projects mirror the Cypress run scope `(@core-1 or @core-2 or @ambient or @waypoint or
@waypoint-tracing) and not @skip-ossmc`: each project greps its tag and excludes `@skip-ossmc`.

`playwright.config.ts` sets `PLAYWRIGHT_OSSMC=true` before the specs load: the vendored kiali
tree branches on it for OSSMC-only UI differences (e.g. `/projects` detail links) and for the
tests that are skipped in OSSMC mode.

## Running

Point the suite at an OpenShift Console serving the plugin (e.g. `make start` + `make start-console`,
default `http://localhost:9000`), then:

```bash
cd plugin
yarn playwright:install          # once, after yarn install
yarn playwright:run              # core-1 + core-2
yarn playwright:run:ambient:junit # ambient + waypoint + waypoint-tracing
yarn playwright:ui               # interactive
```

Environment variables:

| Variable                                     | Default                 | Purpose                                                             |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`                        | `http://localhost:9000` | Console URL                                                         |
| `PLAYWRIGHT_USERNAME` / `USERNAME`           | `jenkins`               | Console login user                                                  |
| `PLAYWRIGHT_PASSWD` / `PASSWD`               | —                       | Console login password (required)                                   |
| `PLAYWRIGHT_AUTH_PROVIDER` / `AUTH_PROVIDER` | —                       | OAuth IdP to select when several are configured                     |
| `PLAYWRIGHT_IGNORE_HTTPS_ERRORS`             | auto for `https://`     | Accept self-signed console certs                                    |
| `PLAYWRIGHT_GREP` / `PLAYWRIGHT_GREP_INVERT` | —                       | Jenkins TEST_TAGS filtering (see `playwright:run:test-group:junit`) |
| `PLAYWRIGHT_BLOB_NAME`                       | `results`               | Per-suite blob/junit name for chained CI runs                       |

Use `yarn playwright:install` — not `yarn playwright install`.

URL adaptation checks, including a direct API request against a local test server, run without
a cluster or browser:

```bash
yarn test:e2e:routes
```

These checks use a `.unit.ts` suffix so Playwright does not collect them as browser tests.
