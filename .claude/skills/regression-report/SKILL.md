---
name: regression-report
description: Create a GitHub issue on kiali/openshift-servicemesh-plugin for a confirmed Cypress test failure. Use after identifying a failing test (from Jenkins nightly or local run) to file a structured bug report via gh CLI.
disable-model-invocation: false
allowed-tools: Bash(gh *), Bash(oc *), Bash(kubectl *), Bash(grep *), Bash(curl *), Bash(jq *)
---

# Regression Report Skill

Create a GitHub issue for a confirmed Cypress test failure on kiali/openshift-servicemesh-plugin.

> Field contract and vocabulary: `.claude/docs/regression-contract.md`

## Primary input — handoff block from `/regression-triage`

If the user pastes a handoff block, extract all fields from it directly. Do not re-ask for fields already present.

Check `Fix target` field in the handoff block:
- `Fix target: kiali/kiali` → file the issue against `kiali/kiali` instead (vendored test)
- `Fix target: kiali/openshift-servicemesh-plugin` (or absent) → proceed normally

Handoff block format:
```
## Handoff Block — Failure N

- Scenario: <exact scenario name>
- Feature file: plugin/cypress/integration/<openshift|kiali>/featureFiles/<file>.feature
- Tag(s): @<tag1>, @<tag2>
- Failing step: <step text>
- Error: <error message>
- Signal: <optional — jenkins-regression | first-occurrence>
- Classification: <flake | ui-bug | test-bug>
- Confidence: <high | medium | low>
- Environment: <Jenkins nightly | Remote OCP | kind | Minikube>
- Build URL: <url>
- Kiali version: <version>
- OCP version: <version>
- Istio version: <version or "not specified">
- Fix target: <kiali/openshift-servicemesh-plugin | kiali/kiali>
```

## Fallback — manual input

If no handoff block, ask for:

1. **Scenario name** — exact Gherkin `Scenario:` title
2. **Feature file** — `.feature` filename; search if unknown:
   ```bash
   grep -rl "<scenario fragment>" plugin/cypress/integration/openshift/featureFiles/ plugin/cypress/integration/kiali/featureFiles/
   ```
3. **Cypress tag(s)** — e.g. `@ossmc`, `@core-1`, `@ambient`; grep from feature file if needed
4. **Classification** — `flake` | `ui-bug` | `test-bug`
5. **Environment** — `Jenkins nightly` | `Remote OCP` | `kind` | `Minikube`
6. **Error message / description**
7. **Kiali version** (optional) — if build URL is known, fetch automatically:
   ```bash
   curl -k -s "<build-url>artifact/archive_dir/kiali-pod.log" | grep "Kiali: Version:" | head -1
   ```
8. **Istio version** (optional) — if build URL is known:
   ```bash
   curl -k -s "<build-url>api/json?tree=actions%5Bparameters%5Bname%2Cvalue%5D%5D" | \
     jq -r '[.actions[] | select(.parameters?) | .parameters[] | select(.name=="ISTIO_VERSION")] | first | .value // "not specified"'
   ```

## Issue construction rules

### Title format
```
[Test] <Scenario name> — <feature-file-basename> / <environment>
```

Examples:
- `[Test] Sidebar navigation shows service mesh pages — sidebar_navigation.feature / Jenkins nightly`
- `[Test] Istio Config list shows resources — istio_config.feature / kind`

### Labels

| Classification | Labels |
|---------------|--------|
| `flake` | `bug`, `maintenance` |
| `ui-bug` | `bug` |
| `test-bug` | `maintenance` |

Apply labels exactly as the table specifies. `test-bug` does **not** get `bug`; `ui-bug` does **not** get `maintenance`.

### Reproduce command

Always include. User must first tag the failing scenario with `@selected` in the `.feature` file, then:

```bash
cd plugin
CYPRESS_BASE_URL=<console-url> \
CYPRESS_USERNAME=<username> \
CYPRESS_PASSWD=<password> \
npx cypress run \
  -e TAGS="@selected and @ossmc" \
  --spec "cypress/integration/openshift/featureFiles/<feature-file>"
```

**Important:** `CYPRESS_BASE_URL` is the **OpenShift Console URL** (e.g. `http://localhost:9000` for local dev), not the Kiali API URL directly. OSSMC routes all Kiali API traffic through the console proxy.

Environment-specific notes:
- **Jenkins / Remote OCP**: Requires VPN + `oc login <cluster-url>`. Console URL from cluster. May need `CYPRESS_ALLOW_INSECURE_KIALI_API=true`.
- **Local dev (cluster)**: Start console bridge with `make prepare-dev-env -e KIALI_URL=route && cd plugin && yarn start && yarn start-console`. `CYPRESS_BASE_URL=http://localhost:9000`.
- **Local dev (mock server)**: `CYPRESS_BASE_URL=http://localhost:9000`. Note: OSSMC-specific auth failures cannot be reproduced against mock server.

## Execution steps

1. Parse handoff block or collect manual input.
2. Check `Fix target` — if `kiali/kiali`, switch repo to `kiali/kiali` for issue creation.
3. Before creating the issue, verify:
   - Title follows `[Test] <Scenario> — <feature-file-basename> / <environment>` exactly. Do **not** use `[Flake]`, `[Bug]`, or other prefixes.
   - Labels match the classification table exactly.
   - `Failing step` and `Confidence` are present in the body (or state "not available" if triage didn't provide them).
4. Construct issue body from template below.
5. Run:
   ```bash
   gh issue create \
     --repo kiali/openshift-servicemesh-plugin \
     --title "[Test] <scenario> — <feature-file-basename> / <environment>" \
     --label "<labels>" \
     --body "$(cat <<'BODY'
   <filled-body>
   BODY
   )"
   ```
   (Use `--repo kiali/kiali` when Fix target is `kiali/kiali`.)
6. Output created issue URL to user.

## Issue body template

```markdown
### Describe the bug

Cypress test failure observed on <environment>.

**Scenario:** `<exact scenario name>`
**Feature file:** `plugin/cypress/integration/openshift/featureFiles/<feature-file>`
**Tag(s):** `<cypress-tags>`
**Classification:** <flake | ui-bug | test-bug>
**Signal:** <jenkins-regression | first-occurrence | omit if not provided>
**Failing step:** `<Given/When/Then/And step text>`
**Confidence:** <high | medium | low>

<error message or screenshot description>

### Expected Behavior

<infer from scenario name or ask user>

### What are the steps to reproduce this bug?

1. Tag the failing scenario with `@selected` in `plugin/cypress/integration/openshift/featureFiles/<feature-file>`
2. Ensure OSSMC is running (OpenShift Console with OSSMC plugin loaded)
3. Set environment variables:
   ```bash
   export CYPRESS_BASE_URL=<console-url>   # http://localhost:9000 for local dev
   export CYPRESS_USERNAME=<username>
   export CYPRESS_PASSWD=<password>
   # For OCP/kind:
   # export CYPRESS_ALLOW_INSECURE_KIALI_API=true
   ```
4. Run from repo root:
   ```bash
   cd plugin && npx cypress run -e TAGS="@selected and @ossmc" --spec "cypress/integration/openshift/featureFiles/<feature-file>"
   ```

### Environment

- **Kiali version:** <version>
- **Istio version:** <version or "not specified">
- **Kubernetes impl:** <OpenShift | kind | Minikube>
- **OCP version:** <version if applicable>
- **Other:** <Jenkins nightly build URL or other details>
```
