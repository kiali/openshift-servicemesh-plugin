---
name: regression-fix
description: Investigate and fix a failing Cypress test from a GitHub issue. Reads the issue for scenario details, traces the failure through step definitions, analyzes root cause, implements a fix, and verifies it locally before committing.
disable-model-invocation: false
allowed-tools: Bash(grep *), Bash(find *), Bash(cat *), Bash(git *), Bash(yarn *), Bash(gh *), Bash(npx *), Bash(curl *), Bash(pkill *), mcp__cypress-debugger__*
---

# Regression Fix Skill

Read a GitHub issue filed by `/regression-report` → investigate root cause → fix the test code → **run the test locally and confirm it passes** → commit.

> Field contract and vocabulary: `.claude/docs/regression-contract.md`

> **Never commit without running the test first.** Static analysis alone (lint, tsc) is not sufficient — the fix must be verified with Cypress executing against a live console + Kiali.

## Vendored test guard — check before anything else

Read the feature file path from the issue. If it is under `plugin/cypress/integration/kiali/`, stop immediately:

> "This scenario is from vendored Kiali tests (`plugin/cypress/integration/kiali/`). Do not fix here — changes to vendored tests belong in the [kiali/kiali](https://github.com/kiali/kiali) repo. Open the issue on `kiali/kiali` and run `/regression-fix` from that repo."

Only proceed if the feature file is under `plugin/cypress/integration/openshift/`.

---

## Prerequisites — OSSMC must be running

**Check the issue Environment section first.** If `Environment: Jenkins nightly` or `Kubernetes impl: OpenShift`, local verification requires an OCP cluster with OSSM and Kiali deployed.

### Cluster + console setup

```bash
# 1. Cluster accessible?
oc cluster-info 2>/dev/null | head -1

# 2. Prepare dev environment (downloads console bridge, sets KIALI_URL proxy)
make prepare-dev-env -e KIALI_URL=route

# 3. Start plugin dev server (terminal 1)
cd plugin && yarn start

# 4. Start console bridge (terminal 2)
cd plugin && yarn start-console

# Console available at http://localhost:9000
```

### Alternative — mock server (no cluster)

No OCP cluster required. OCP-specific failures (auth, console proxy, ResizeObserver) cannot be reproduced here.

```bash
cd plugin && yarn mock-server          # terminal 1 — mock Kiali API on :3001
cd plugin && yarn start                # terminal 2 — plugin dev server
cd plugin && KIALI_URL=http://localhost:3001 yarn start-console  # terminal 3
```

**Cypress environment variables:**

```bash
export CYPRESS_BASE_URL=http://localhost:9000   # OpenShift Console URL (not Kiali directly)
export CYPRESS_USERNAME=<username>
export CYPRESS_PASSWD=<password>
export CYPRESS_ALLOW_INSECURE_KIALI_API=true    # useful for CRC/insecure endpoints
```

Note: `CYPRESS_OSSMC=true` is already set in `plugin/cypress.config.ts` — do not pass it again.

---

## Step 1 — Fetch issue and parse fields

```bash
gh issue view <number-or-url> --repo kiali/openshift-servicemesh-plugin
```

Extract from issue body:
- **Scenario** from `**Scenario:** \`<name>\``
- **Feature file** from `**Feature file:** \`<path>\``
- **Tag(s)** from `**Tag(s):** \`<tags>\``
- **Classification** from `**Classification:** <flake | ui-bug | test-bug>`
- **Signal** from `**Signal:** <value>` — optional metadata field. Extract when present, no behavior change based on it
- **Failing step** from `**Failing step:** \`<step>\`` — use this to jump directly to the right step definition in Step 2b
- **Confidence** from `**Confidence:** <high | medium | low>` — low confidence = spend more time in Step 3 before implementing
- **Error** from prose after classification line
- **Environment** from the Environment section (Kiali version, Istio version, OCP version, build URL)

If any field is missing, ask the user.

After extracting the feature file path — **re-check the vendored test guard** (path must start with `plugin/cypress/integration/openshift/`).

---

## Step 2 — Locate scenario and trace steps

### 2a — Verify and read the scenario

Confirm feature file exists at the stated path. Read the full scenario including its Background section:

```bash
grep -n "<scenario name>" plugin/cypress/integration/openshift/featureFiles/<file>.feature
```

Read the feature file. Note all tags on the scenario — they determine which hooks fire via `Before({ tags: '@tag' })` in `plugin/cypress/integration/openshift/common/hooks.ts`.

### 2b — Trace each step to its definition

Each `Given/When/Then/And` line maps to a step definition in `plugin/cypress/integration/openshift/common/*.ts`:

```bash
grep -rn "<step text fragment>" plugin/cypress/integration/openshift/common/
```

Read the full step definition function. Follow any helper calls into `plugin/cypress/support/commands.ts`.

If a step is not found in `plugin/cypress/integration/openshift/common/`, it may be a vendored step from `plugin/cypress/integration/kiali/common/`. **Do not modify vendored step definitions** — if the fix requires changing a shared step, this may need to go to kiali/kiali first.

**Important:** `testIsolation: false` means scenarios within a single `.feature` file share state. A failing scenario may depend on state left by a preceding scenario.

---

## Step 3 — Analyze root cause

### 3a — Map error to known patterns

| Pattern | Signature | Typical files |
|---------|-----------|---------------|
| ACE editor timing | `.ace_content` text empty, `win.ace` undefined | vendored `wizard_request_routing.ts`, `mesh.ts` |
| Nested `it()` in steps | `it('...', { retries: 3 }, () => {` inside step def | vendored `mesh.ts`, `wizard_request_routing.ts` |
| React component polling | `cy.getReact()` returns empty array | vendored `mesh.ts`, `graph.ts` |
| Session restore latency | `cy.session()` setup slow | vendored `commands.ts` (not in OSSMC) |
| Backend 500 errors | `/api/status`, `/api/mesh/graph` return 500 | transient — no code fix |
| OSSMC console proxy error | requests to Kiali fail with 503/network error | check console bridge is running |
| Recursive polling | `doRequest()`/`attempt()` without timeout guard | `plugin/cypress/integration/openshift/common/hooks.ts` |

### 3b — Check history

```bash
git log --oneline --all --grep="<scenario fragment>" -- plugin/cypress/ | head -10
gh issue list --repo kiali/openshift-servicemesh-plugin --search "<scenario fragment>" --state all
```

### 3c — Root-cause statement

Write a one-paragraph root-cause analysis before making any code changes. This prevents blindly applying retries.

---

## Step 4 — Implement fix

Strategy depends on classification:

### flake

Fix based on the specific sub-pattern identified in step 3a:

**Nested `it()` blocks** — unwrap to direct Cypress assertions:
```typescript
// BAD: nested it() inside step definition
it('spinner should disappear', { retries: 3 }, () => {
  cy.get('#loading_kiali_spinner').should('not.exist');
});

// GOOD: direct assertion (retries built into .should())
cy.get('#loading_kiali_spinner').should('not.exist');
```

**ACE editor timing** — add assertion guard before reading content:
```typescript
// BAD: reads immediately, may be empty
cy.get('.ace_content').invoke('text').should('match', re);

// GOOD: wait for content to appear first
cy.get('.ace_content').should('not.be.empty').invoke('text').should('match', re);
```

**ACE window access** — guard `window.ace` existence:
```typescript
// BAD: ace may not be loaded
cy.window().then((win: any) => { win.ace.edit('editor') });

// GOOD: assert property exists first
cy.window().should('have.property', 'ace').then((win: any) => {
  const editor = (win as any).ace.edit('editor');
});
```

**Backend 500 errors (transient infrastructure)** — no code fix needed. State: "Infrastructure-caused failure. The existing `retries: { runMode: 2 }` in `plugin/cypress.config.ts` handles this. No test code change required."

### test-bug

1. Compare selector/assertion text in step definition against current React source:
   ```bash
   grep -rn "<selector-or-text>" plugin/src/openshift/
   ```
2. Update step definition in `plugin/cypress/integration/openshift/common/` to match current UI.
3. If Background steps are wrong, fix the feature file.

### ui-bug

1. Confirm test expectation is correct by reading Gherkin scenario intent.
2. Search app source: `grep -rn "<component>" plugin/src/openshift/`
3. If fix is in OSSMC source — implement it in `plugin/src/openshift/`.
4. If fix requires Kiali backend or kiali/kiali frontend changes — state this clearly and note in the issue.

---

## Step 5 — Static checks

Run these before launching Cypress. They catch compile errors early.

### 5a — Lint (if `.ts` files in `src/openshift/` changed)

```bash
cd plugin && yarn lint
```

No `lint:gherkin` script in OSSMC — skip gherkin linting.

### 5b — Impact analysis

Check all consumers of modified step definitions:

```bash
grep -rn "<modified step text>" plugin/cypress/integration/openshift/featureFiles/
```

List affected scenarios. Verify the fix does not break their semantics.

### 5c — Type check (if `.ts` files changed)

```bash
cd plugin && npx tsc --noEmit --project cypress/tsconfig.json 2>&1 | head -30
```

Focus on errors in files you changed; pre-existing errors elsewhere can be ignored.

---

## Step 6 — Run the test locally and verify it passes

**This step is mandatory before committing.**

### 6a — Tag the scenario for fast iteration

Add `@selected` to the failing scenario in the `.feature` file:

```gherkin
@selected
@ossmc @core-1
Scenario: My failing scenario
  ...
```

### 6b — Kill any existing Cypress/Chrome processes

```bash
pkill -9 -f cypress; pkill -9 -f "chrome.*9222"
# Wait 2-3 s, then verify port 9222 is free:
curl -s http://127.0.0.1:9222/json/list || echo "port free"
```

### 6c — Launch Cypress with Chrome on a fixed CDP port

```bash
cd plugin
CYPRESS_BASE_URL=http://localhost:9000 \
CYPRESS_REMOTE_DEBUGGING_PORT=9222 \
npx cypress run \
  --browser chrome \
  --headed \
  --no-exit \
  -e TAGS="@selected and @ossmc" \
  --spec "cypress/integration/openshift/featureFiles/<failing-feature>.feature"
```

Key flags:
- `CYPRESS_REMOTE_DEBUGGING_PORT=9222` — exposes Chrome on a fixed CDP port so the `cypress-debugger` MCP can connect
- `--browser chrome` — required for CDP (Electron doesn't support it)
- `--headed` — shows the browser window
- `--no-exit` — keeps the browser open after tests finish for inspection

### 6d — Inspect with `cypress-debugger` MCP

With Chrome on port 9222, use MCP tools to inspect the live browser:

```javascript
// Quick pass/fail check
() => { const s = document.querySelectorAll('[aria-label="Stats"] li'); return Array.from(s).map(e => e.textContent?.trim()); }

// Last 10 Cypress command log entries
() => { const items = document.querySelectorAll('.command-wrapper'); return Array.from(items).slice(-10).map(el => el.textContent?.trim()).join('\n'); }

// Error message (if any)
() => { const el = document.querySelector('.runnable-err-message'); return el ? el.textContent : 'no error'; }

// Inspect OSSMC UI inside the iframe
() => { const f = document.querySelector('iframe'); if (!f?.contentDocument) return 'no iframe'; return f.contentDocument.body?.textContent?.substring(0, 300); }
```

**Understanding snapshot structure:**
- Left panel (refs `e*`) — Cypress test runner: spec name, pass/fail stats, step log
- Right panel / iframe (refs `f<N>e*`) — actual OpenShift Console with OSSMC plugin under test

**Re-run after code change:**

> `Ctrl+R` does NOT pick up code changes — Cypress caches compiled specs. After modifying any `.ts` or `.feature` file you **must kill and restart** the Cypress process (step 6b → 6c again), then reconnect MCP via `browser_close` + `browser_navigate`.

To re-run without code change (e.g., flake check):
```
browser_press_key({ key: "Control+r" })
```

### 6e — Confirm the test passes

The test **must show a green pass** in the Cypress runner before proceeding. If it still fails, return to step 3 and re-analyze.

### 6f — Remove `@selected` tag

```bash
grep -n "@selected" plugin/cypress/integration/openshift/featureFiles/<file>.feature
# Edit and remove the line
```

---

## Step 7 — Issue lifecycle (optional)

After confirming the test passes, offer to update the GitHub issue:

```bash
# Add a comment with fix summary
gh issue comment <number> --repo kiali/openshift-servicemesh-plugin --body "Fixed in <branch>. Root cause: <one-line>. Verified locally with Cypress."

# Close only if user requests and fix is merged or ready to merge
gh issue close <number> --repo kiali/openshift-servicemesh-plugin --comment "Closing — fix merged."
```

Do not close the issue without user confirmation.

## Step 8 — Summary and optional commit

Output: what changed, why, which scenarios are affected, confirmation that the test passed locally (or note environment limitations if OCP-specific).

Prepare a commit message but **do not commit** — wait for the user to explicitly request it.

---

## Codebase facts

Non-obvious and frequently relevant to fixes:

- **`testIsolation: false`** in `plugin/cypress.config.ts` — scenarios within a `.feature` file share state. Scenario on line 74 can depend on actions from scenario on line 60.
- **`retries: { runMode: 2 }`** in `plugin/cypress.config.ts` — every spec retried up to 2x in CI.
- **`defaultCommandTimeout: 40000`** — 40s assertion timeout.
- **No `cy.session()` in OSSMC** — OpenShift Console handles authentication. No cross-spec session caching.
- **`CYPRESS_OSSMC=true`** always set in `plugin/cypress.config.ts` env block — do not pass explicitly; already active.
- **OSSMC tag system**: `@ossmc` (test runs in OSSMC), `@skip-ossmc` (test skipped in OSSMC context). All OSSMC-specific tests must have `@ossmc`.
- **Step definitions** in `plugin/cypress/integration/openshift/common/` — OSSMC-specific, safe to modify.
- **Vendored step definitions** in `plugin/cypress/integration/kiali/common/` — do not modify; fixes belong in kiali/kiali.
- **Hooks** in `plugin/cypress/integration/openshift/common/hooks.ts` — tag-gated Before/After (bookinfo, error-rates, sleep, loggers apps).
- **`cy.getBySel('name')`** → selects `[data-test="name"]` (custom command in `plugin/cypress/support/commands.ts`).
- **`getColWithRowText(rowText, colName)`** in both `plugin/cypress/support/commands.ts` (Cypress command) and `plugin/cypress/integration/openshift/common/table.ts` (direct export).
- **`linkSelector()`** in vendored `plugin/cypress/integration/kiali/common/transition.ts` — used by kiali tests, not OSSMC-specific tests. For OSSMC nav, use direct URL or PatternFly nav selectors.
- **`ensureKialiFinishedLoading()` / `waitForKialiApiReady()`** — vendored `plugin/cypress/integration/kiali/common/transition.ts`; may be called by shared step definitions.
- **Console proxy**: OSSMC routes all Kiali API requests through the OpenShift Console service proxy. `cy.request` targeting Kiali must use the console proxy path, not direct Kiali URL. `CYPRESS_BASE_URL` is the console URL.
- **`.mcp.json`** at repo root (if present) configures `cypress-debugger` MCP server pointing to `http://127.0.0.1:9222` — no manual setup needed.

---

## Guardrails

1. **No `cy.wait(N)` hard waits.** Use `.should()` assertions or `cy.intercept().as().wait()`.
2. **No nested `it()` inside step definitions.** Cypress-Cucumber-Preprocessor already wraps each scenario in an `it()`.
3. **No modifying `plugin/cypress.config.ts`** retry settings or `testIsolation` unless explicitly instructed.
4. **No removing or weakening assertions.** Make tests more resilient, not less thorough.
5. **No new npm/yarn dependencies.** Work within existing Cypress and Cucumber preprocessor API.
6. **No code fixes for infrastructure failures.** Backend 500s, cluster instability, missing CRDs — state "no fix needed" and explain.
7. **Always check all consumers** of modified shared step definitions before committing.
8. **Never commit without a passing local run.** Step 6 is not optional.
9. **ui-bug: do not weaken test assertions without a product fix.** If classification is `ui-bug`, changing test expectations to match broken UI without implementing the product fix is forbidden — it masks the bug.
10. **Never modify vendored files.** `plugin/cypress/integration/kiali/` and `plugin/src/kiali/` — any needed fix must go to kiali/kiali first.
