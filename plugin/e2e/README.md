# Playwright e2e (OSSMC)

Playwright port of the OSSMC Cypress suite (kiali/openshift-servicemesh-plugin cutover, phase 2 of
[kiali#9712](https://github.com/kiali/kiali/issues/9712)). Mirrors the layout and conventions of
`frontend/e2e/` in the [kiali](https://github.com/kiali/kiali) repo: native Playwright Test, Page
Object Models extending `BasePage`, suite membership via `tag` options matched by project `grep`,
`data-test` as `testIdAttribute`.

Layout:

- `global-setup/auth.setup.ts` — OpenShift Console OAuth login (htpasswd IdP), persists
  `storageState` for the suite projects. OSSMC always runs on OpenShift; there is no anonymous
  strategy.
- `tests/` — specs (synced from kiali `frontend/e2e/` plus OSSMC-specific specs)
- `pages/`, `utils/` — page objects and shared helpers

Projects mirror the Cypress run scope `(@core-1 or @core-2 or @ambient or @waypoint or
@waypoint-tracing) and not @skip-ossmc`: each project greps its tag and excludes `@skip-ossmc`.

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
