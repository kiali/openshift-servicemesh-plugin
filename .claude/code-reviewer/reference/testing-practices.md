---
format_version: 1
---

# Testing Practices — OpenShift Service Mesh Console Plugin (OSSMC)

## Unit Tests

### Framework
- **Jest** with **Enzyme** for React component testing
- Serialization via `enzyme-to-json` (`shallowToJson`)
- Additional mocks: `jest-localstorage-mock`, `jest-canvas-mock`, `axios-mock-adapter`, `redux-mock-store`

### File Location & Naming
- Test files live in `__tests__/` directories co-located with the source they test
- Naming convention: `*.test.ts` for pure logic, `*.test.tsx` for component tests
- No `.spec.ts` convention — use `.test.ts` exclusively

### Structure
- `describe` blocks group related tests by function/component name
- `it` or `test` for individual test cases (`it` for component tests, `test` for utility/logic tests)
- `beforeAll` / `beforeEach` for shared setup (e.g., `setServerConfig`)

### Assertions
- `expect(...).toEqual(...)` for value equality
- `expect(...).toMatchSnapshot()` with `shallowToJson(wrapper)` for component snapshot tests
- Enzyme `shallow()` rendering preferred over `mount()` for unit tests

### Mocking
- `axios-mock-adapter` for HTTP API mocks
- `redux-mock-store` for Redux state in component tests
- Server config setup via `setServerConfig()` in `beforeAll`
- `jest.spyOn` for spying on specific functions (e.g., `getCSRFToken`)

## E2E Tests

### Framework
- **Cypress** with **Cucumber** BDD (`@badeball/cypress-cucumber-preprocessor`)
- Reporters: `cypress-multi-reporters` with `mocha-junit-reporter` for CI

### Scope
- **`plugin/cypress/integration/openshift/`** — OSSMC-specific E2E tests. This is the review target.
- **`plugin/cypress/integration/kiali/`** — Vendored from `kiali/kiali`. **Not subject to testing review.**

### File Location & Naming
- Feature files: `plugin/cypress/integration/{openshift,kiali}/featureFiles/*.feature`
- Step definitions: `plugin/cypress/integration/{openshift,kiali}/common/*.ts`
- Cypress config: `plugin/cypress/tsconfig.json`

### Structure
- Gherkin syntax: `Feature` > `Background` > `Scenario`
- Steps use `Given`, `When`, `Then` from `@badeball/cypress-cucumber-preprocessor`
- `Background` blocks set up common preconditions (navigation, intercept registration)

### Tags
- `@ossmc` — OSSMC-specific tests
- `@smoke` — Smoke test suite (run first)
- `@core-1`, `@core-2` — Core test groups
- `@skip-ossmc` — Tests to skip in OSSMC context
- `@bookinfo-app` — Requires bookinfo sample app deployed
- `@ambient`, `@waypoint` — Ambient mesh tests
- Tags are combined in Cypress run commands via `TAGS` env var (e.g., `@ossmc and @smoke`)

### Patterns
- `cy.intercept()` to register API hooks before test actions
- `cy.wait('@aliasName')` to wait for API responses before assertions
- `cy.waitForReact()` to wait for React rendering
- Assertions on DOM visibility: `cy.get(selector).should('be.visible')`
- URL assertions: `cy.url().should('include', '/expected-path')`

## Test Execution

- Unit tests: Run via Jest (standard `react-scripts test` or equivalent)
- E2E tests:
  - Interactive: `yarn cypress` (opens Cypress UI with `@ossmc and not @skip-ossmc` filter)
  - CI: `yarn cypress:run` (runs smoke first, then core-1/core-2)
  - JUnit output: `yarn cypress:run:junit` (for CI reporting)
  - Ambient: `yarn cypress:run:ambient` / `yarn cypress:run:ambient:junit`

## Changelog

| Date | Change | Trigger |
|------|--------|---------|
| 2026-04-21 | Initial generation | /code-reviewer:setup |
| 2026-04-21 | Added E2E scope: plugin/cypress/integration/kiali/ is vendored, only openshift/ is review target | /code-reviewer:setup |
