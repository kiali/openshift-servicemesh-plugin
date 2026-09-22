---
name: track-ossm-acm-addon-backend-issues
description: >-
  Analyze open OSSM-ACM addon controller issues in stolostron/multicluster-mesh-addon
  (read-only) for Fleet Service Mesh plugin impact and create or update tracking
  issues in kiali/openshift-servicemesh-plugin (or kiali/kiali when Kiali core is
  affected). Never create, edit, or comment on issues in the stolostron repo.
  Run when new multicluster-mesh-addon backend issues are filed, before sprint
  planning, or when asked to check for addon controller changes that might affect
  the fleet-mesh perspective.
---

# Track OSSM-ACM Addon Controller Backend Issues for Fleet Service Mesh Plugin Impact

Analyze open backend controller issues in the OSSM-ACM addon
([stolostron/multicluster-mesh-addon](https://github.com/stolostron/multicluster-mesh-addon))
and create or update GitHub tracking issues for any that affect the Fleet Service
Mesh perspective plugin.

The plugin frontend lives in this repository under `plugin/src/fleet-mesh/`.
Tracking issues belong in
[kiali/openshift-servicemesh-plugin](https://github.com/kiali/openshift-servicemesh-plugin)
by default. Route work to
[kiali/kiali](https://github.com/kiali/kiali) when the required change is in
Kiali server code rather than the OSSMC fleet-mesh perspective.

**Do NOT write to the stolostron repo.** Access
`stolostron/multicluster-mesh-addon` read-only — use it only to list and read
backend controller issues and source code. Never create, edit, comment on, or
close issues (or PRs) in that repository. All tracking issues must be filed in
`kiali/openshift-servicemesh-plugin` or `kiali/kiali`.

## When to use

Run this skill periodically — when new OSSM-ACM addon controller issues are
filed in multicluster-mesh-addon, before sprint planning, or when the user asks
to check for addon controller changes that might affect the fleet-mesh plugin.
The skill is idempotent: running it multiple times will not create duplicate
issues.

## Prerequisites

- `gh` CLI authenticated with access to `stolostron/multicluster-mesh-addon`,
  `kiali/openshift-servicemesh-plugin`, and `kiali/kiali`.
- Read frontend source from the **openshift-servicemesh-plugin** repository root.
- Use `--repo` on all `gh` commands — addon controller issues come from one repo,
  tracking issues are filed in another.
- **Read-only for stolostron:** Only `gh issue list` and `gh issue view` (and
  equivalent read commands) are permitted against `stolostron/multicluster-mesh-addon`.
  Do not run `gh issue create`, `gh issue edit`, or `gh issue comment` with
  `--repo stolostron/multicluster-mesh-addon`.

## Repositories

| Role | Repository | Access | Purpose |
|------|------------|--------|---------|
| Backend (source) | `stolostron/multicluster-mesh-addon` | **Read-only** | OSSM-ACM addon controller, CRD, and API issues to analyze |
| Frontend (default target) | `kiali/openshift-servicemesh-plugin` | Read/write | Fleet Service Mesh perspective plugin (`plugin/src/fleet-mesh/`) |
| Frontend (alternate target) | `kiali/kiali` | Read/write | Kiali server API or core UI changes the plugin depends on |

### Choosing the target repo

File tracking issues in **openshift-servicemesh-plugin** when the fleet-mesh
plugin code under `plugin/src/fleet-mesh/` must change (components, hooks, types,
utils, i18n, fleet-mesh tests).

File tracking issues in **kiali/kiali** when the addon controller fix exposes
data or APIs that only Kiali server can consume, or when deep links /
observability integration requires changes in vendored Kiali code under
`plugin/src/kiali/` that must be fixed upstream first. Cross-reference from an
openshift-servicemesh-plugin issue when both repos need work.

## Instructions

### 1. Read the fleet-mesh plugin source code

Read ALL source files under `plugin/src/fleet-mesh/` — every component, hook, type
definition, and utility. Pay special attention to:

- `types/` — the CRD shape the plugin expects (`multiClusterMesh.ts`, `fleetMesh.ts`,
  `istio.ts`, `certManager.ts`, `manifestWork.ts`, `managedCluster.ts`)
- `hooks/` — what resources are watched and how (`useMultiClusterMeshes`,
  `useFleetMeshItems`, `useEnrichedControlPlanes`, `useDiscoveredControlPlanes`,
  `useMeshControlPlanes`, `useManagedClusters`, `useManagedClusterMap`,
  `useDiscoveredKialis`)
- `utils/statusUtils.ts` — condition reason mapping (`friendlyReasons`, `deriveStatus`)
- `components/MeshStatus.tsx` — renders status labels via `deriveStatus`
- `components/TrustStatusCard.tsx` — how trust status is derived from Certificates
  and ManifestWorks (workaround for missing per-cluster trust status)
- `components/MeshDetailPage.tsx` — per-cluster status categorization, what
  conditions are checked, how the overview card displays spec fields
- `components/OverviewPage.tsx` — health counts, recent issues collection
- `components/ServiceMeshPage.tsx` — list columns, what fields are displayed
- `components/ControlPlanesPage.tsx` and `ControlPlaneDetailPage.tsx` — enrichment,
  MCM correlation
- `utils/correlateMCM.ts` — how control planes are matched to meshes
- `utils/enrichmentUtils.ts`, `utils/kialiLinkUtils.ts` — Kiali link and enrichment logic

Also read supporting docs for context on known limitations, workarounds, and
planned features:

- `docs/fleet-mesh/ROADMAP.md` — planned features, blocked-on-addon-controller items,
  and tracking-issue workflow
- `docs/fleet-mesh/PERFORMANCE.md` — scale constraints, optimizations, and monitoring
  checklist
- `docs/fleet-mesh/DESIGN-KIALI-LINKS.md` — Kiali/OSSMC observability link design
- `hack/fleet-mesh/DEV-INSTALL.md` — dev setup and architecture notes

Addon controller CRD reference: `pkg/apis/mesh/v1alpha1/types.go` in
multicluster-mesh-addon.

### 2. Fetch addon controller backend issues

Run from any directory (always pass `--repo`). Keep `--limit 200` but sort by
newest first so recently filed issues are included if the repo has more than 200
open issues (older ones were likely processed in prior runs):

```
gh issue list --repo stolostron/multicluster-mesh-addon \
  --search "sort:created-desc" --state open --limit 200 \
  --json number,title,body,labels,createdAt
```

These are the OSSM-ACM addon controller issues to analyze. **Exclude** any issue
with the `area/frontend` label or a title starting with `[frontend]` — those are
obsolete tracking issues filed in the backend repo by mistake; ignore them.

### 3. Fetch existing frontend tracking issues

Check **both** kiali target repos for existing tracking issues. Apply newest-first
sorting on all list commands so `--limit` caps return recent items when the repo
has many issues (open lists: `sort:created-desc`; closed lists:
`sort:updated-desc`). A tracking issue is identified by any of:

- Title starts with `[fleet-mesh]`
- Has the `fleet-mesh` label
- Body contains `stolostron/multicluster-mesh-addon#NNN` or the addon controller issue URL
- Body contains `stolostron/multicluster-mesh-addon/issues/NNN`

**Primary target (openshift-servicemesh-plugin):**

Use the `fleet-mesh` label filter as the primary fetch — it is the most reliable
signal and avoids scanning unrelated issues:

```
gh issue list --repo kiali/openshift-servicemesh-plugin \
  --label "fleet-mesh" --state open --limit 200 \
  --json number,title,body,labels,createdAt

gh issue list --repo kiali/openshift-servicemesh-plugin \
  --label "fleet-mesh" --state closed --limit 200 \
  --json number,title,body,labels,updatedAt
```

Filter results to tracking issues using the signals above.

**Alternate target (kiali/kiali):**

```
gh issue list --repo kiali/kiali \
  --search "multicluster-mesh-addon sort:created-desc" --state open --limit 50 \
  --json number,title,body,labels,createdAt

gh issue list --repo kiali/kiali \
  --search "[fleet-mesh] sort:created-desc" --state open --limit 50 \
  --json number,title,body,labels,createdAt
```

### 4. Analyze each addon controller issue for frontend impact

For each backend issue (not already covered by a tracking issue), determine:

a. Does the plugin have a workaround for this issue that will need updating when
   the issue is fixed?
b. Does this issue cause the plugin to display misleading information?
c. Will fixing this issue require TypeScript type changes in `plugin/src/fleet-mesh/types/`?
d. Will fixing this issue add new condition types, reasons, or status fields that
   the plugin should display (check `statusUtils.ts` `friendlyReasons`)?
e. Does this issue affect planned plugin features (see `docs/fleet-mesh/ROADMAP.md`
   and `docs/fleet-mesh/DESIGN-KIALI-LINKS.md`)?
f. Is the plugin actually broken due to this issue without us realizing?
g. Does the fix require Kiali server changes instead of (or in addition to)
   fleet-mesh plugin changes?

### 5. Classify each issue's frontend impact

- **HIGH:** Plugin has a workaround that must be updated, or plugin code must
  change when the addon controller issue is fixed.
- **MEDIUM:** Plugin will need non-trivial changes when fixed (new code paths,
  type updates, new UI elements).
- **LOW:** Plugin needs trivial updates when fixed (e.g., adding a reason string
  to `friendlyReasons`, minor display tweak).
- **NONE:** No plugin code changes needed — even if the addon controller bug
  causes suboptimal UX, the plugin displays whatever the backend reports and will
  automatically benefit from the fix. Also includes test infra, CI, controller
  internals, and documentation issues. Skip these — do not create a tracking issue.

The key test: **will the fleet-mesh plugin (or Kiali server, if applicable)
need code changes when this addon controller issue is fixed?** If not, classify
as NONE regardless of current UX impact.

### 6. Check for existing tracking issues (deduplication)

Before creating a tracking issue for addon controller issue #NNN, check
**openshift-servicemesh-plugin** and **kiali/kiali** only. Use a two-pass approach:

1. **Title match:** Does any tracking issue title contain `#NNN` (e.g.,
   `[fleet-mesh] Addon controller #118: ...`)?
2. **Body match:** If no title match, does any tracking issue body contain
   `stolostron/multicluster-mesh-addon#NNN` or
   `https://github.com/stolostron/multicluster-mesh-addon/issues/NNN`?

If either check finds a match, update that issue rather than creating a duplicate.
Log which match method and repo were used.

### 7. Present the plan for review

Before creating or modifying any GitHub issues, present a summary of all planned
actions to the user for approval. The summary should include:

**New issues to create:**

For each, show the target repo, title, severity, labels, and the full issue body.

**Existing issues to update:**

For each, show the repo, issue number, what changed, and the updated body.

**Closed addon controller issues with pending frontend work:**

For each, show the issue number and the comment that would be posted.

Ask the user to confirm before proceeding. Do NOT create, update, or comment on
any GitHub issues until the user explicitly approves. All writes must target
`kiali/openshift-servicemesh-plugin` or `kiali/kiali` only — never
`stolostron/multicluster-mesh-addon`.

### 8. Create or update frontend tracking issues

After the user confirms, execute the planned actions. **Every `gh issue create`,
`gh issue edit`, and `gh issue comment` command must use
`--repo kiali/openshift-servicemesh-plugin` or `--repo kiali/kiali`.** Do not
write to the stolostron repo under any circumstance.

**For new HIGH/MEDIUM/LOW issues with no existing tracking issue:**

Create in the appropriate target repo. Use `[fleet-mesh]` in the title. Reference
the addon controller explicitly when helpful, e.g.
`[fleet-mesh] Addon controller #NNN: <short title>`.

**openshift-servicemesh-plugin (default):**

```
gh issue create --repo kiali/openshift-servicemesh-plugin \
  --title "[fleet-mesh] Addon controller #NNN: <short title>" \
  --label "enhancement" \
  --label "fleet-mesh" \
  --body "$(cat <<'EOF'
Backend issue: stolostron/multicluster-mesh-addon#NNN

**Impact:** <SEVERITY> — <one-line summary>.

**Addon controller issue:** <Brief description of what the multicluster-mesh-addon issue is.>

**Plugin today:** <How the fleet-mesh plugin currently handles this area —
what code is involved, any workarounds in place. Include code snippets
where relevant, referencing paths under plugin/src/fleet-mesh/.>

**Plugin risk:** <Is the plugin broken, misleading, or showing incorrect data
because of this issue? Answer explicitly (yes / no / partially) with
explanation.>

**When addon controller is fixed:** <What happens to the plugin when
multicluster-mesh-addon resolves this — does anything need changing, and if
so, what specifically?>
EOF
)"
```

Always add `fleet-mesh` — it is the canonical label for fleet-mesh tracking issues
in this repo and is used by the skill to efficiently list existing tracking issues.
Add `waiting external` when the tracking issue is blocked on the addon controller
fix. Add `requires core PR` when kiali/kiali also needs changes (and file a linked
issue there if needed).

**kiali/kiali (when Kiali server work is required):**

```
gh issue create --repo kiali/kiali \
  --title "[fleet-mesh] Addon controller #NNN: <short title>" \
  --label "enhancement" \
  --label "multi-cluster" \
  --body "$(cat <<'EOF'
Backend issue: stolostron/multicluster-mesh-addon#NNN
Related OSSMC issue: <link if filed in openshift-servicemesh-plugin>

**Impact:** <SEVERITY> — <one-line summary>.

**Addon controller issue:** <Brief description.>

**Kiali today:** <How Kiali server code handles this today — reference
plugin/src/kiali/ paths if relevant to OSSMC, or kiali/kiali upstream paths
if known.>

**When addon controller is fixed:** <What Kiali changes are needed.>
EOF
)"
```

**For existing tracking issues that need updating:**

If the plugin code has changed since the tracking issue was last written, update
the issue body with the current analysis:

```
gh issue edit <ISSUE_NUMBER> --repo <TARGET_REPO> --body "<updated body>"
```

**For addon controller issues that are now closed:**

If an addon controller issue is closed but its tracking issue is still open,
re-read the relevant plugin code and check whether the work described in the
tracking issue has already been done.

If the plugin has already been updated:

```
gh issue comment <ISSUE_NUMBER> --repo <TARGET_REPO> --body \
  "Addon controller issue stolostron/multicluster-mesh-addon#NNN has been closed and the fleet-mesh plugin has already been updated to address the changes described here. This issue can be closed."
```

If the plugin has NOT yet been updated:

```
gh issue comment <ISSUE_NUMBER> --repo <TARGET_REPO> --body \
  "Addon controller issue stolostron/multicluster-mesh-addon#NNN has been closed. The fleet-mesh plugin changes described in this issue can now be implemented."
```

In either case, do NOT auto-close the tracking issue — only a human closes it
after verifying.

### 9. Report a summary

After processing all issues, report:

- How many addon controller issues were analyzed.
- How many had frontend impact (by severity).
- How many new tracking issues were created in each target repo (list issue numbers).
- How many existing tracking issues were updated.
- How many addon controller issues were closed with pending frontend work.
- How many addon controller issues had no frontend impact (skipped).
