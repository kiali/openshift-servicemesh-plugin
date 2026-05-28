# Regression Contract — Shared Vocabulary

Shared by `/regression-triage`, `/regression-report`, and `/regression-fix`. Defines canonical terms, the handoff block schema, and label rules so all three skills stay consistent.

---

## Signal vs Classification

These are two separate concepts. Do not conflate them.

| Concept | What it is | Who sets it |
|---------|-----------|-------------|
| **Signal** | How the failure was detected | Jenkins / CI system |
| **Classification** | Root cause category | Triage agent + user input |

### Signals

- `jenkins-regression` — Jenkins `testReport` case status was `REGRESSION` (passed last run, failed now). This is metadata only — no agent logic branches on it.
- `first-occurrence` — failure appears with no prior passing history in this build's test report context.

Signal is **optional** in the handoff block. When present, record it as-is. Never use signal alone to drive classification.

### Classifications

| Classification | Meaning |
|---------------|---------|
| `flake` | Intermittent timing/selector issue; test is correct but fragile |
| `ui-bug` | Product state is wrong; test expectation is correct |
| `test-bug` | Test/assertion mismatch with current UI; product is correct |

Default when cause is unclear after ruling out `test-bug`: `ui-bug`. Prefer product investigation over test-only workarounds.

---

## Handoff Block Schema

One block per confirmed failure (or one grouped block for shared root cause). Emitted by `/regression-triage`, consumed by `/regression-report` and `/regression-fix`.

### Single failure

```
## Handoff Block — Failure N

- Scenario: <exact Gherkin Scenario: title>
- Feature file: <path relative to repo root>
- Tag(s): @<tag1>, @<tag2>
- Failing step: <Given/When/Then/And step text>
- Error: <error message, one line>
- Signal: <optional — jenkins-regression | first-occurrence>
- Classification: <flake | ui-bug | test-bug>
- Confidence: <high | medium | low>
- Environment: <Jenkins nightly | Remote OCP | kind | Minikube>
- Build URL: <full Jenkins build URL with trailing slash>
- Kiali version: <e.g. v2.27.0-SNAPSHOT>
- OCP version: <e.g. 4.21.15>
- Istio version: <version or "not specified">
```

### Grouped failure (shared root cause)

```
## Handoff Block — Group: <root cause summary>

- Scenarios:
  - <scenario 1> (feature: <file1>.feature, tags: @tag1)
  - <scenario 2> (feature: <file2>.feature, tags: @tag2)
- Common error: <shared error pattern>
- Signal: <if shared>
- Classification: <shared classification>
- Confidence: <high | medium | low>
- Environment: Jenkins nightly
- Build URL: <full build URL with trailing slash>
- Kiali version: <version>
- OCP version: <version>
- Istio version: <version or "not specified">
```

### Field rules

| Field | Required | Notes |
|-------|----------|-------|
| Scenario | Yes | Exact `Scenario:` title from `.feature` file |
| Feature file | Yes | Full path from repo root |
| Tag(s) | Yes | All tags on the scenario |
| Failing step | If available | From screenshot filename or error message |
| Error | Yes | One line; truncate long stack traces |
| Signal | No | Only when Jenkins status is `REGRESSION` |
| Classification | Yes | `flake \| ui-bug \| test-bug` |
| Confidence | Yes | `high \| medium \| low` |
| Environment | Yes | |
| Build URL | Yes | |
| Kiali version | Yes | From `kiali-pod.log` |
| OCP version | Yes | From `ossm-env-snapshot.json` |
| Istio version | Yes | From build params, or `"not specified"` |

---

## Label Matrix

Used by `/regression-report` when creating GitHub issues.

| Classification | Labels to apply |
|---------------|----------------|
| `flake` | `bug`, `maintenance` |
| `ui-bug` | `bug` |
| `test-bug` | `maintenance` |

Rules:
- `test-bug` does **not** get `bug`
- `ui-bug` does **not** get `maintenance`
- Apply labels exactly as the table specifies

---

## Issue Title Format

```
[Test] <Scenario name> — <feature-file-basename> / <environment>
```

Examples:
- `[Test] Inbound Metrics in context menu — graph_context_menu.feature / Jenkins nightly`
- `[Test] Display idle nodes option — graph_display_user.feature / kind`

Do not use `[Flake]`, `[Bug]`, or other prefixes.

---

## OSSMC-Specific Rules

### Vendored test guard

Feature files under `plugin/cypress/integration/kiali/featureFiles/` are vendored from kiali/kiali.

- `/regression-triage`: classify and emit handoff block normally, but add note: `Fix target: kiali/kiali`
- `/regression-report`: file the issue against `kiali/kiali`, not `kiali/openshift-servicemesh-plugin`
- `/regression-fix`: **stop immediately** if feature file is under the vendored path. Do not modify vendored tests in OSSMC. Redirect the user to run `/regression-fix` from the kiali/kiali repo.

### Tag vocabulary

| Tag | Meaning |
|-----|---------|
| `@ossmc` | Test runs in OSSMC context (required on all OSSMC-specific tests) |
| `@skip-ossmc` | Test is skipped when running in OSSMC context |
| `@smoke` | Smoke suite |
| `@core-1`, `@core-2` | Core test groups |
| `@bookinfo-app` | Requires bookinfo sample app |
| `@ambient`, `@waypoint` | Ambient mesh scenarios |
| `@selected` | Manual selection for fast iteration (remove before committing) |

### Reproduce command (OSSMC)

No `cypress:run:selected` script in OSSMC. Use:

```bash
cd plugin
CYPRESS_BASE_URL=<console-url>    # http://localhost:9000 for local dev
CYPRESS_USERNAME=<username> \
CYPRESS_PASSWD=<password> \
npx cypress run \
  -e TAGS="@selected and @ossmc" \
  --spec "cypress/integration/openshift/featureFiles/<feature>.feature"
```

`CYPRESS_BASE_URL` is the **OpenShift Console URL** (`:9000`), not the Kiali API URL directly.
