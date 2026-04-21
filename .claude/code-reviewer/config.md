---
format_version: 1
base_branch: main
languages:
  - typescript
  - tsx
  - scss
key_paths:
  - plugin/src/openshift/
  - plugin/cypress/
  - plugin/mock-server/
vendored_paths:
  - plugin/src/kiali/
  - plugin/cypress/integration/kiali/
---

# Project Context — OpenShift Service Mesh Console Plugin (OSSMC)

OSSMC is an OpenShift Console dynamic plugin that integrates Kiali's service mesh observability UI into the OpenShift web console. It is built with React 17, TypeScript, Redux, and PatternFly v6.

## Architecture

- **`plugin/src/openshift/`** — OSSMC-specific integration code (routes, components, console extensions). This is the primary review target.
- **`plugin/src/kiali/`** — Vendored copy of the Kiali UI from `kiali/kiali`. Synced via `hack/copy-frontend-src-to-ossmc.sh`. **Not subject to style review.**
- **`plugin/cypress/integration/kiali/`** — Vendored Cypress tests copied from `kiali/kiali`. **Not subject to style or testing review.** Only `plugin/cypress/integration/openshift/` contains OSSMC-specific E2E tests.
- **`plugin/cypress/`** — E2E tests using Cypress + Cucumber BDD.
- **`plugin/mock-server/`** — Express mock server using MSW handlers for local development.

## Build & Tooling

- **Package manager**: Yarn 4.12.0 (via corepack)
- **Node**: >= 24
- **Bundler**: Webpack 5
- **Linting**: ESLint (only `src/openshift`), Prettier (pre-commit hook via `pretty-quick`)
- **CI**: GitHub Actions (`.github/workflows/ci.yaml`)

## Key Conventions

- ESLint and style review apply only to `plugin/src/openshift/`
- `data-test` attributes are used for Cypress selectors
- API calls route through the OpenShift Console service proxy
- Version tracked in root `Makefile` (`VERSION` variable)

## Code Reviewer Plugin

The review pipeline is powered by the [code-reviewer plugin](https://github.com/openshift-service-mesh/ci-utils/tree/main/plugins/code-reviewer) from `openshift-service-mesh/ci-utils`. See [AGENTS.md](../../AGENTS.md) for installation and usage instructions.
