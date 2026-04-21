# AI Agent Development Guide for OSSMC

This guide provides coding standards, development workflows, and common commands for AI agents and developers contributing to the OpenShift Service Mesh Console Plugin (OSSMC).

## Table of Contents

- [Quick Reference](#quick-reference)
- [Repository Structure](#repository-structure)
- [Code Quality Standards](#code-quality-standards)
- [Building and Testing](#building-and-testing)
- [Development Workflows](#development-workflows)
- [File Protection Rules](#file-protection-rules)
- [Common Patterns and Best Practices](#common-patterns-and-best-practices)
- [Writing New E2E Tests](#writing-new-e2e-tests)
- [Troubleshooting](#troubleshooting)
- [Code Reviewer Plugin](#code-reviewer-plugin)
- [Quick Command Reference](#quick-command-reference)
- [Important Reminders](#important-reminders)
- [Additional Resources](#additional-resources)

---

## Quick Reference

### Essential Commands

```bash
# Prepare dev environment (requires oc login + Kiali in cluster)
make prepare-dev-env -e KIALI_URL=route

# Run locally (two terminals)
cd plugin && yarn start           # Plugin dev server on http://localhost:9001
cd plugin && yarn start-console   # Console on http://localhost:9000

# Run with mock server (three terminals, no cluster needed)
cd plugin && yarn mock-server     # Mock API on http://localhost:3001
cd plugin && yarn start           # Plugin dev server
cd plugin && yarn start-console   # Console

# Build plugin
cd plugin && yarn install && yarn build

# Build container image
make build-plugin-image

# Deploy to cluster (uses quay.io latest image)
oc login
make deploy-plugin enable-plugin

# Lint and format
cd plugin && yarn lint            # ESLint (src/openshift only)
cd plugin && yarn prettier        # Prettier

# Run Cypress E2E tests
cd plugin && yarn cypress         # Interactive (GUI)
cd plugin && yarn cypress:run     # Headless (smoke + core)
```

### Prerequisites

- **Node.js** >= 24 with **corepack** enabled (`corepack enable`)
- **Yarn** 4.12.0 (managed via corepack, pinned in `plugin/package.json`)
- **OpenShift** cluster with Service Mesh or Istio (for cluster-connected dev)
- **Kiali Server** deployed in the cluster
- `oc` CLI on PATH
- `podman` or `docker` on PATH (set `DORP=docker` if using Docker)

---

## Repository Structure

```
openshift-servicemesh-plugin/
├── AGENTS.md                    # This file
├── Makefile                     # Root Makefile (VERSION, includes make/*.mk)
├── README.md                    # User-facing dev guide
├── .github/workflows/           # CI, release, nightly, test image workflows
├── .claude/code-reviewer/       # Claude code-reviewer config + reference docs
├── .cursor/code-reviewer/       # Cursor code-reviewer config + reference docs
├── deploy/docker/               # Dockerfiles (Cypress test image)
├── hack/                        # Automation scripts
│   ├── copy-frontend-src-to-ossmc.sh   # Sync Kiali UI to plugin/src/kiali/
│   ├── download-hack-scripts.sh        # Download Kiali hack/istio scripts
│   └── update-version-string.sh        # Bump version across files
├── make/                        # Included Makefiles
│   ├── Makefile.plugin.mk       # Plugin build, deploy, dev-env targets
│   ├── Makefile.cluster.mk      # Cluster image push targets
│   └── Makefile.container.mk    # Cypress test image build
└── plugin/                      # Main application
    ├── package.json             # Dependencies, scripts, engine constraints
    ├── tsconfig.json            # TypeScript config with path aliases
    ├── webpack.config.ts        # Webpack 5 config
    ├── cypress.config.ts        # Cypress E2E config
    ├── console-extensions.ts    # OpenShift Console extension points
    ├── plugin-metadata.ts       # Plugin version metadata
    ├── manifest.yaml            # K8s deployment manifest
    ├── .eslintrc                # ESLint rules (src/openshift only)
    ├── .prettierrc.json         # Prettier config
    ├── .editorconfig            # EditorConfig
    ├── src/
    │   ├── openshift/           # ★ OSSMC-specific code (review target)
    │   │   ├── components/      # KialiContainer, KialiController, ErrorPage
    │   │   ├── pages/           # GraphPage, OverviewPage, IstioConfigListPage, MeshPage
    │   │   ├── styles/          # GlobalStyle, variables.module.scss
    │   │   ├── utils/           # IstioResources, KialiIntegration, Reducer
    │   │   └── i18n.ts          # i18n initialization
    │   └── kiali/               # ⚠ Vendored from kiali/kiali (DO NOT EDIT)
    ├── cypress/                 # E2E tests
    │   └── integration/
    │       ├── openshift/       # ★ OSSMC-specific E2E tests
    │       └── kiali/           # ⚠ Vendored from kiali/kiali (DO NOT EDIT)
    └── mock-server/             # Express mock API using MSW handlers
```

### Key Boundaries

- **`plugin/src/openshift/`** — OSSMC-specific integration code. This is the primary development and review target.
- **`plugin/src/kiali/`** — Vendored copy of the Kiali UI. Synced via `hack/copy-frontend-src-to-ossmc.sh`. **Do not edit directly** — changes belong in the [kiali/kiali](https://github.com/kiali/kiali) repo.
- **`plugin/cypress/integration/kiali/`** — Vendored Cypress tests from kiali/kiali. **Do not edit directly.**
- **`plugin/cypress/integration/openshift/`** — OSSMC-specific E2E tests.

---

## Code Quality Standards

### TypeScript

#### General Rules

1. **Strict mode** is enabled (`strict: true`), but `noImplicitAny` is `false`
2. **Explicit return types** required on functions (`@typescript-eslint/explicit-function-return-type`)
3. **No inferrable type annotations** — don't annotate types the compiler can infer
4. **Interface/type literal members sorted alphabetically** (`@typescript-eslint/member-ordering`)
5. **No `var`** — use `const`/`let` (`no-var: error`)
6. **Template literals** over string concatenation (`prefer-template: error`)
7. **Arrow functions** over function expressions in callbacks (`prefer-arrow-callback: error`)
8. **Comments explain "why", not "what"** — no comments that restate the code

#### Naming Conventions

- **PascalCase**: Components, types, interfaces, enums, classes (`KialiController`, `PluginConfig`)
- **camelCase**: Variables, functions, properties (`pluginConfig`, `handleGraphRoute`)
- **UPPER_SNAKE_CASE**: Stable constants and enum values (`ANONYMOUS_USER`, `API_PROXY`)
- **File names**: PascalCase for components and types (`KialiController.tsx`), camelCase for utilities

```typescript
enum DisplayMode {
  LARGE,
  SMALL
}
```

#### Event Handler Naming

- Handler methods on a component: `handle` + event name (`handleClick`, `handleChange`, `handleSubmit`)
- Callback props passed to a component: `on` + event name (`onSelect`, `onChange`, `onClose`)
- Use present tense, avoid clashing with native events

```typescript
type Props = {
  onChange: (val: string) => void;
};

const MyComponent: React.FC<Props> = ({ onChange }) => {
  const handleChange = (val: string): void => {
    onChange(val);
  };
  return <Item onClick={() => handleChange(item.name)} />;
};
```

#### Export Conventions

- **Page components** use default exports (required by OpenShift Console dynamic plugin SDK for lazy loading)
- **Shared components and utilities** use named exports

```typescript
// Page component — default export for console-extensions.ts
const GraphPage: React.FC = () => { ... };
export default GraphPage;

// Shared component — named export
export const KialiController: React.FC<Props> = ({ ... }) => { ... };
```

#### Import Ordering

Organize imports in three groups separated by blank lines:

```typescript
// 1. External packages
import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { Page } from '@patternfly/react-core';

// 2. Path aliases (kiali internals)
import { store } from 'store/ConfigStore';
import { KialiAppState } from 'store/Store';

// 3. Relative imports (within src/openshift/)
import { refForKialiIstio } from './IstioResources';
```

- Use `import * as React from 'react'` (namespace import)
- Use path aliases from `tsconfig.json` for kiali internals, not deep relative paths
- Use relative imports within `src/openshift/`
- OpenShift Console SDK: `import { ... } from '@openshift-console/dynamic-plugin-sdk'`

#### Component Patterns

- **Page components**: Functional `React.FC`, hooks (`useLocation`, `useNavigate`), default export
- **Shared components**: Named export, can be class or functional
- **Redux**: Class components use `connect()` + `mapDispatchToProps`; functional components use `store.getState()` or hooks
- **Props**: Defined adjacent to the component, named `{ComponentName}Props` or `{ComponentName}ReduxProps`
- **Testing hooks**: Use `data-test` attributes on interactive elements for Cypress selectors

#### Styling

- CSS-in-JS via `typestyle`: `kialiStyle()` for style objects, `cssRule()` for global overrides
- SCSS modules for CSS variables only (`variables.module.scss`)
- PatternFly v6 classes: `pf-v6-c-*`
- Style constants as named exports: `export const globalStyle = kialiStyle({...})`

### Formatting

Prettier and EditorConfig enforce formatting automatically via a pre-commit hook (`pretty-quick --staged`).

- **Print width**: 120 characters
- **Quotes**: Single quotes
- **Trailing commas**: None
- **Arrow parens**: Avoid when possible
- **Indentation**: 2 spaces
- **Final newline**: Required
- **Trailing whitespace**: Trimmed (except `.md` files)

### Linting

ESLint is configured to lint only `src/openshift/`:

```bash
cd plugin && yarn lint
```

The `src/kiali/` directory is explicitly excluded from linting and pre-commit hooks.

---

## Building and Testing

### Build Commands

```bash
# Full plugin build
cd plugin && yarn install && yarn build

# Development build
cd plugin && yarn build:dev

# Container image build
make build-plugin-image                                    # Default tag: dev
make -e CONTAINER_VERSION=v1.0.0 build-plugin-image        # Custom tag
make -e CONTAINER_VERSION=v1.0.0 build-push-plugin-multi-arch  # Multi-arch + push
```

### Testing

#### Unit Tests

```bash
# Jest tests (framework: Jest + Enzyme)
# Test files: __tests__/ directories co-located with source
# Naming: *.test.ts (logic), *.test.tsx (components)
```

#### E2E Tests (Cypress + Cucumber)

```bash
# Interactive mode
cd plugin && yarn cypress

# Headless (smoke first, then core-1/core-2)
cd plugin && yarn cypress:run

# With JUnit reporter (for CI)
cd plugin && yarn cypress:run:junit

# Ambient mesh tests
cd plugin && yarn cypress:run:ambient
```

**Cypress tags:**

| Tag | Description |
|-----|-------------|
| `@ossmc` | OSSMC-specific tests |
| `@smoke` | Smoke suite (runs first) |
| `@core-1`, `@core-2` | Core test groups |
| `@skip-ossmc` | Tests to skip in OSSMC context |
| `@bookinfo-app` | Requires bookinfo sample app deployed |
| `@ambient`, `@waypoint` | Ambient mesh tests |
| `@selected` | Manual selection for debugging (temporary, remove before committing) |

**Cypress environment variables:**

```bash
export CYPRESS_BASE_URL=http://localhost:9000     # Console URL (default)
export CYPRESS_OSSMC=true                         # Enabled by default in cypress.config.ts
```

### Cluster Deploy

```bash
# Quick deploy (quay latest image, requires oc login)
make deploy-plugin enable-plugin

# Undeploy
make undeploy-plugin

# Build + push dev image to cluster registry
make cluster-push

# Check cluster status (registry info, login commands)
make cluster-status
```

---

## Development Workflows

### Local Development (with Kiali in cluster)

Requires an OpenShift cluster with Kiali deployed. Kiali must use `auth.strategy: anonymous` for local dev.

```bash
# 1. Prepare environment (sets API_PROXY, installs deps)
make prepare-dev-env -e KIALI_URL=route
# Or with explicit URL:
make prepare-dev-env -e KIALI_URL=https://<kiali-host>

# 2. Start plugin dev server (terminal 1)
cd plugin && yarn start

# 3. Start console bridge (terminal 2)
cd plugin && yarn start-console
```

Open http://localhost:9000 in your browser. You may need to disable CORS (Chrome flag or extension).

### Local Development (with Mock Server, no cluster)

No cluster required. Uses MSW handlers to mock the Kiali API.

```bash
# 1. Set API_PROXY in plugin/.env.development:
#    API_PROXY=http://localhost:3001

# 2. Start mock server (terminal 1)
cd plugin && yarn mock-server

# 3. Start plugin dev server (terminal 2)
cd plugin && yarn start

# 4. Start console bridge (terminal 3)
cd plugin && yarn start-console
```

**Mock server configuration:**
- Port: `MOCK_SERVER_PORT` env var (default: 3001)
- Scenario: `REACT_APP_MOCK_SCENARIO` env var (default: `healthy`)
- Handlers: `plugin/src/kiali/mocks/handlers/`
- Scenarios: `plugin/src/kiali/mocks/scenarios.ts`

### Syncing Kiali Frontend

When the upstream Kiali UI changes need to be pulled into OSSMC:

```bash
# Sync from kiali/kiali (default: master branch)
hack/copy-frontend-src-to-ossmc.sh

# Sync from a specific branch or ref
hack/copy-frontend-src-to-ossmc.sh --source-ref v2.25.0
```

This copies `frontend/src` → `plugin/src/kiali/`, locales, and Cypress tests → `plugin/cypress/integration/kiali/`.

### Version Bumping

```bash
# Update version across Makefile, package.json, plugin-metadata.ts
hack/update-version-string.sh v2.27.0
```

---

## File Protection Rules

### Never Edit These Paths

| Path | Reason |
|------|--------|
| `plugin/src/kiali/` | Vendored from kiali/kiali. Changes belong upstream. |
| `plugin/cypress/integration/kiali/` | Vendored Cypress tests from kiali/kiali. |
| `_output/` | Build artifacts and generated files. |
| `plugin/dist/` | Build output. |
| `plugin/node_modules/` | Dependencies managed by Yarn. |

### Modify with Caution

| Path | Notes |
|------|-------|
| `plugin/console-extensions.ts` | Console extension registration — affects all plugin routes. |
| `plugin/plugin-metadata.ts` | Plugin version — updated by `hack/update-version-string.sh`. |
| `plugin/manifest.yaml` | K8s deployment — affects cluster deploys. |
| `.github/workflows/` | CI/CD pipelines — test changes carefully. |

---

## Common Patterns and Best Practices

### Adding a New Page

1. Create the page component in `plugin/src/openshift/pages/` (functional `React.FC`, default export)
2. Register the route in `plugin/console-extensions.ts`
3. Add `data-test` attributes on key elements for Cypress
4. Add i18n strings to `plugin/src/openshift/locales/*/translation.json`

### Adding a New Component

1. Create in `plugin/src/openshift/components/`
2. Use PatternFly v6 components where possible
3. Style with `kialiStyle()` from typestyle
4. Use `data-test` attributes for testability

### API Calls

All API calls to Kiali go through the vendored `Api.ts` service:

- Use existing functions from `plugin/src/kiali/services/Api.ts` when possible
- API calls route through the OpenShift Console service proxy (`API_PROXY` prefix)
- New mutating calls must use `newRequest()` to ensure CSRF headers are included
- Error handling via `getErrorString()` / `getErrorDetail()`

### Working with Redux

- Store setup: `plugin/src/kiali/store/ConfigStore.ts`
- Actions: `plugin/src/kiali/actions/`
- Reducers: `plugin/src/kiali/reducers/`
- OSSMC-specific reducer: `plugin/src/openshift/utils/Reducer.ts`

**Type-safe Redux props:**

Separate `ReduxProps` from component-specific props. Sort fields alphabetically.

```typescript
type ReduxProps = {
  activeClusters: MeshCluster[];
  duration: DurationInSeconds;
  refreshInterval: IntervalInMilliseconds;
};

type MyComponentProps = ReduxProps & {
  title: string;
};
```

### i18n

Always use the `t()` function for translatable strings. Import from the OSSMC i18n module, **not** directly from `i18next`:

```typescript
// Correct — OSSMC i18n
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
const label = t('Traffic Graph');

// Wrong — direct i18next import
import { t } from 'i18next';
```

- OSSMC translations: `plugin/src/openshift/locales/`
- Kiali translations: `plugin/src/kiali/locales/` (vendored)
- Extract new strings: `cd plugin && yarn i18n`

---

## Writing New E2E Tests

OSSMC-specific E2E tests live in `plugin/cypress/integration/openshift/`. Tests under `plugin/cypress/integration/kiali/` are vendored and must **not** be edited.

### Step 1: Create a Feature File

Create a `.feature` file using Gherkin syntax:

```gherkin
# plugin/cypress/integration/openshift/my-feature.feature
@ossmc @core-1
Feature: My Feature

  Background:
    Given user is at administrator perspective

  @my-feature
  Scenario: User sees the widget panel
    When user navigates to the "overview" page
    Then user sees the "widget-panel" element
```

### Step 2: Create Step Definitions

Create a matching step definitions file:

```typescript
// plugin/cypress/integration/openshift/my-feature/my-feature.ts
import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

Given('user is at administrator perspective', () => {
  cy.visit('/');
});

When('user navigates to the {string} page', (page: string) => {
  cy.visit(`/${page}`);
});

Then('user sees the {string} element', (testId: string) => {
  cy.get(`[data-test="${testId}"]`).should('be.visible');
});
```

### Step 3: Tag Properly

- Always include `@ossmc`
- Add a suite tag (`@smoke`, `@core-1`, or `@core-2`)
- Add `@bookinfo-app` if the test requires sample apps
- Add `@ambient` or `@waypoint` for ambient mesh scenarios

### Step 4: Run and Validate

```bash
# Interactive mode (select your feature file)
cd plugin && yarn cypress

# Headless
cd plugin && yarn cypress:run

# Debug a single spec (tag with @selected temporarily)
cd plugin && yarn cypress --spec "cypress/integration/openshift/my-feature.feature"
```

---

## Troubleshooting

### "Module not found" or TypeScript path alias errors

Check that `tsconfig.json` path aliases match. OSSMC uses aliases like `store/...`, `types/...`, `config/...` that resolve into `plugin/src/kiali/`. Webpack resolves these in `webpack.config.ts`.

### Console bridge fails to start (`yarn start-console`)

- Ensure `oc login` is active and the cluster token is valid
- Ensure the console bridge binary is present (downloaded by `yarn start-console` on first run)
- Check that the `API_PROXY` value in `plugin/.env.development` points to an accessible Kiali instance

### Pre-commit hook reformats files

This is expected. `pretty-quick --staged` runs Prettier on staged files automatically. If a commit fails due to formatting changes, re-stage and commit again:

```bash
git add -u && git commit
```

### Vendored files appear in `git diff`

If `plugin/src/kiali/` or `plugin/cypress/integration/kiali/` shows up with changes, someone likely ran `hack/copy-frontend-src-to-ossmc.sh`. These changes should be committed as a separate "sync Kiali frontend" commit.

### Cypress tests fail with "element not found"

- Ensure selectors use `[data-test="..."]` attributes, not CSS classes or DOM structure
- Check whether the element is within an iframe (iframes are not accessible by default in Cypress)
- Add `{ timeout: 30000 }` for elements that load asynchronously

---

## Code Reviewer Plugin

The project includes an AI-powered code review pipeline that runs multi-phase reviews (adversarial, style, testing) against your branch changes. It enforces project-specific conventions documented in reference docs under `.claude/code-reviewer/reference/` and `.cursor/code-reviewer/reference/`.

Source: [code-reviewer plugin](https://github.com/openshift-service-mesh/ci-utils/tree/main/plugins/code-reviewer) in `openshift-service-mesh/ci-utils`.

### Setup

#### Cursor

Clone ci-utils and run the install script:

```sh
git clone https://github.com/openshift-service-mesh/ci-utils.git
ci-utils/plugins/code-reviewer/install-cursor.sh /path/to/openshift-servicemesh-plugin
```

This installs agents, skills, templates, and rules into `.cursor/code-reviewer/` and `.cursor/rules/`. These files are gitignored — only `config.md` and `reference/` docs are committed.

Re-run the script any time the plugin is updated upstream.

#### Claude Code

Run Claude Code with the plugin directory:

```sh
claude --plugin-dir /path/to/ci-utils/plugins/code-reviewer
```

Or add permanently to `~/.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "code-reviewer@local:/path/to/ci-utils/plugins/code-reviewer": true
  }
}
```

### Usage

After setup, run these commands inside Cursor or Claude Code:

| Command | Description |
|---------|-------------|
| `/code-reviewer:setup` | Onboard the project (already done — regenerate reference docs if needed) |
| `/code-reviewer:review` | Full review pipeline (adversarial + style + testing) |
| `/code-reviewer:review:adversarial` | Adversarial phase only (bugs, security, architecture) |
| `/code-reviewer:review:style` | Style phase only (convention enforcement) |
| `/code-reviewer:review:testing` | Testing phase only (coverage, quality, edge cases) |

### What's Committed vs. Installed

| Path | Committed | Purpose |
|------|-----------|---------|
| `{.cursor,.claude}/code-reviewer/config.md` | Yes | Project config (base branch, languages, key paths) |
| `{.cursor,.claude}/code-reviewer/reference/*.md` | Yes | Project conventions (style, testing, security, API) |
| `.cursor/code-reviewer/agents/` | No | Review subagent prompts — installed by `install-cursor.sh` |
| `.cursor/code-reviewer/skills/` | No | Pipeline skills — installed by `install-cursor.sh` |
| `.cursor/code-reviewer/templates/` | No | Brief/report templates — installed by `install-cursor.sh` |
| `.cursor/rules/code-reviewer-*.mdc` | No | Cursor rules — installed by `install-cursor.sh` |

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Install dependencies | `cd plugin && yarn install` |
| Build | `cd plugin && yarn build` |
| Dev server | `cd plugin && yarn start` |
| Console bridge | `cd plugin && yarn start-console` |
| Mock server | `cd plugin && yarn mock-server` |
| Lint | `cd plugin && yarn lint` |
| Format | `cd plugin && yarn prettier` |
| Extract i18n strings | `cd plugin && yarn i18n` |
| Cypress (interactive) | `cd plugin && yarn cypress` |
| Cypress (headless) | `cd plugin && yarn cypress:run` |
| Cypress (JUnit) | `cd plugin && yarn cypress:run:junit` |
| Container image build | `make build-plugin-image` |
| Deploy to cluster | `make deploy-plugin enable-plugin` |
| Undeploy | `make undeploy-plugin` |
| Sync Kiali frontend | `hack/copy-frontend-src-to-ossmc.sh` |
| Bump version | `hack/update-version-string.sh vX.Y.Z` |
| Prepare dev environment | `make prepare-dev-env -e KIALI_URL=route` |

---

## Important Reminders

Before submitting a PR, verify:

1. **Lint passes**: `cd plugin && yarn lint` reports no errors
2. **Build succeeds**: `cd plugin && yarn build` completes without errors
3. **Vendored code is untouched**: No modifications inside `plugin/src/kiali/` or `plugin/cypress/integration/kiali/`
4. **New strings are extracted**: If you added user-facing text, run `yarn i18n`
5. **Cypress selectors use `data-test`**: Not CSS classes or DOM structure
6. **No `var` declarations**: Use `const` or `let`
7. **Export conventions**: Default exports only for page components (SDK requirement); named exports everywhere else
8. **Comments explain "why"**: Remove any comments that restate what the code does
9. **Import order is correct**: External → path aliases → relative, separated by blank lines
10. **Formatting is clean**: Prettier runs automatically on commit, but verify with `yarn prettier` if in doubt

---

## Additional Resources

- [OSSMC README](README.md) — Quick-start guide and feature overview
- [Kiali Documentation](https://kiali.io/docs/) — Upstream Kiali concepts and architecture
- [OpenShift Console Dynamic Plugins](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk) — SDK reference for dynamic plugin development
- [PatternFly v6](https://www.patternfly.org/) — UI component library
- [Cypress Cucumber Preprocessor](https://github.com/badeball/cypress-cucumber-preprocessor) — BDD testing framework used for E2E tests
- [typestyle](https://typestyle.github.io/) — CSS-in-JS library used for component styles
- [Code Reviewer Plugin](https://github.com/openshift-service-mesh/ci-utils/tree/main/plugins/code-reviewer) — Source and docs for the AI code review pipeline
