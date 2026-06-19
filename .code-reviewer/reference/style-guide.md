---
format_version: 1
---

# Style Guide — OpenShift Service Mesh Console Plugin (OSSMC)

## Scope

Code review enforces conventions on `plugin/src/openshift/` (plugin-specific code). The `plugin/src/kiali/` directory is vendored upstream code and is **not** subject to style review.

ESLint is configured to lint only `src/openshift` (`package.json` script: `eslint --ext ts,tsx src/openshift`).

## Formatting

Prettier and EditorConfig enforce formatting automatically via a pre-commit hook (`pretty-quick --staged`).

- **Print width**: 120 characters
- **Quotes**: Single quotes (`singleQuote: true`)
- **Trailing commas**: None (`trailingComma: "none"`)
- **Arrow parens**: Avoid when possible (`arrowParens: "avoid"`)
- **Indentation**: 2 spaces (EditorConfig)
- **Charset**: UTF-8
- **Final newline**: Required
- **Trailing whitespace**: Trimmed (except `.md` files)

## TypeScript

- **Strict mode** is enabled (`strict: true`), but `noImplicitAny` is `false`
- `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`
- **Explicit return types required** on functions (`@typescript-eslint/explicit-function-return-type` with `allowExpressions: true`)
- **Explicit module boundary types required** (`@typescript-eslint/explicit-module-boundary-types`)
- **No inferrable type annotations** (`@typescript-eslint/no-inferrable-types`) — don't annotate types the compiler can infer (e.g., `const x: number = 5` is an error)
- **Interface/type literal members sorted alphabetically** (`@typescript-eslint/member-ordering`)
- **No `var`** — use `const`/`let` (`no-var: error`)
- **Template literals over concatenation** (`prefer-template: error`)
- **Arrow functions over function expressions** in callbacks (`prefer-arrow-callback: error`)

## Naming

- **PascalCase**: Components, types, interfaces, enums, classes (e.g., `KialiController`, `PluginConfig`, `IstioResourceType`)
- **camelCase**: Variables, functions, properties (e.g., `pluginConfig`, `setRouterBasename`, `handleGraphRoute`)
- **UPPER_SNAKE_CASE**: Stable constants (e.g., `ANONYMOUS_USER`, `API_PROXY`)
- **File names**: PascalCase for React components and type files (e.g., `KialiController.tsx`, `IstioResources.ts`). camelCase acceptable for pure utility modules.

## Imports

- React namespace import: `import * as React from 'react'`
- Path aliases from `tsconfig.json` preferred over relative paths for kiali internals (e.g., `import { store } from 'store/ConfigStore'` not `../../kiali/store/ConfigStore`)
- OpenShift Console SDK imports from `@openshift-console/dynamic-plugin-sdk`
- Relative imports for files within `src/openshift/` (e.g., `import { refForKialiIstio } from './IstioResources'`)
- Import ordering: external packages first, then aliased/internal modules, then relative imports

## Components

- **Page components**: Functional (`React.FC`), use hooks (`useLocation`, `useNavigate` from `react-router-dom-v5-compat`), default export
- **Shared components**: Named export, can be class or functional
- **Redux integration**: Class components use `connect()` with `mapDispatchToProps`. Functional components access store via `store.getState()` or hooks
- **Props interfaces**: Defined adjacent to the component, named `{ComponentName}Props` or `{ComponentName}ReduxProps`
- **Testing hooks**: `data-test` attributes on interactive elements for Cypress selectors

## Styling

- CSS-in-JS via `typestyle`: use `kialiStyle()` for style objects, `cssRule()` for global overrides
- SCSS modules for CSS variables only (`variables.module.scss`)
- PatternFly v6 classes referenced as `pf-v6-c-*`
- Style constants exported as named exports (e.g., `export const globalStyle = kialiStyle({...})`)

## Changelog

| Date | Change | Trigger |
|------|--------|---------|
| 2026-04-21 | Initial generation | /code-reviewer:setup |
