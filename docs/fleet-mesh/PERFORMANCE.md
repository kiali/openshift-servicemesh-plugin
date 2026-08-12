# Performance — Fleet Service Mesh Perspective

This document tracks performance considerations, analysis results, and optimizations
for the fleet-mesh perspective plugin (`plugin/src/fleet-mesh/`). The scale target is
200+ clusters, 200+ Istio control planes, and 50+ MultiClusterMesh objects.

## Architecture Overview

Data fetching falls into four patterns. The Istio enrichment pipeline is shared across
multiple pages via a module-level cache (see **Shared enrichment cache** below).

### Fleet-wide Istio discovery + enrichment

ACM Search discovers Istio CRs fleet-wide via `useFleetSearchPoll` (30s poll).
`useEnrichedControlPlanes` enriches each discovered CR with full spec/status from the
individual cluster via `fleetK8sGet`. Results are stored in a module-level cache
(surviving component unmounts during page navigation) with a 150s TTL. An
`initialEnrichmentDone` flag prevents spinner flash on subsequent search poll updates.

**Pages that trigger fleet-wide enrichment:**

| Page | Hook chain | Notes |
|------|------------|-------|
| Overview | `useFleetMeshItems` | Full fleet enrichment to build mesh list and recent issues |
| Meshes (`ServiceMeshPage`) | `useFleetMeshItems` | Same pipeline as Overview |
| Control Planes | `useDiscoveredControlPlanes` + `useEnrichedControlPlanes` | Direct use of enrichment hooks |
| Discovered mesh detail | `useDiscoveredControlPlanes` + `useEnrichedControlPlanes` | Fleet-wide enrichment, then client-side filter by `meshID` |

At scale, visiting Overview or Meshes is as expensive as Control Planes for Istio GET
volume on first load. Repeat navigation benefits from the shared module cache.

### Scoped Istio enrichment (managed mesh detail)

`MeshDetailPage` uses `useMeshControlPlanes`, which enriches only control planes on
the mesh's member clusters and writes results into the same shared module cache
(bidirectional warming with list pages).

**Caveat:** `useMeshControlPlanes` still runs a fleet-wide ACM Search poll and filters
results to member clusters locally — the SDK does not expose server-side cluster
filtering today. GET enrichment is scoped; Search traffic is not.

**Cache-invalidation difference:** Unlike the fleet-wide hook (which relies on the 30s
search poll cycle to re-check TTLs), `useMeshControlPlanes` uses an independent
`setInterval(CACHE_TTL_MS)` tick to periodically re-trigger enrichment even when
search results haven't changed. This ensures stale data is refreshed on long-lived
detail pages where search results remain stable.

**Debouncing difference:** The fleet-wide hook debounces state updates (1s max during
chunk processing) to prevent re-render storms during large enrichment cycles.
`useMeshControlPlanes` does not debounce — it updates state once after all chunks
complete. This is appropriate because it processes fewer CPs (only the mesh's member
clusters), but the asymmetry means future scale growth in clusters-per-mesh should be
monitored.

### Observability links

`useDiscoveredKialis` runs a parallel discovery + enrichment pipeline for Kiali and
OSSM Console CRs (ACM Search + per-cluster `fleetK8sGet`, and optionally a second GET
for OpenShift Routes). Used on Control Planes, mesh detail pages, and anywhere
observability links are rendered. See `kialiLinkUtils.ts` and
[DESIGN-KIALI-LINKS.md](./DESIGN-KIALI-LINKS.md).

**Scope asymmetry:** When a `scopeFilter` is provided, Kiali enrichment is limited to
matching clusters via `matchesClusterScope`. However, OSSMC enrichment is **never
scope-filtered** — all discovered OSSMConsole CRs are enriched regardless of the
`scopeFilter`. This means detail pages still enrich the full fleet of OSSMC instances
even when only a subset of clusters is relevant.

### Hub watches

- **`MultiClusterMesh` CRs** — watched via `useMultiClusterMeshes` on pages that need
  mesh spec/status.
- **`ManagedCluster` objects** — watched fleet-wide via `useManagedClusters` /
  `useManagedClusterMap` on detail pages (cluster availability) and Control Planes
  (observability link resolution).

### Table virtualization (two strategies)

- **List pages** (`ServiceMeshPage`, `ControlPlanesPage`): OpenShift Console SDK
  `VirtualizedTable` (built-in row virtualization).
- **Detail card tables** (`VirtualFilterTable` + `useVirtualRows`): custom zero-dependency
  virtualization for filterable tables inside cards (368px scroll container).

### Time-to-data model

Data becomes visible to the user only after a sequential pipeline completes:

```
ACM Search response  →  TTL-filter stale entries  →  enrichment chunks (serial batches)
      ~1–3s                   O(n)                    ceil(pending / concurrency) × RTT
```

The minimum time-to-data on first load is:

```
T = SearchLatency + (ceil(pendingCPs / concurrencyLimit)) × avgRoundTrip
```

For 200 CPs with concurrency 25 and ~200ms average RTT: `3s search + 8 batches × 200ms
= ~4.6s`. On repeat visits with a warm cache, time-to-data drops to `SearchLatency`
only (enrichment is skipped for entries within TTL).

The scoped hook (`useMeshControlPlanes`) has the same waterfall but with fewer pending
CPs (only mesh member clusters), typically yielding sub-second enrichment after the
search response.

## Optimizations Applied

### Shared Enrichment Cache

The module-level Istio enrichment cache in `useEnrichedControlPlanes.ts` is shared
across Overview, Meshes, Control Planes, discovered mesh detail, and managed mesh
detail (`useMeshControlPlanes` reads/writes the same cache via `getFromEnrichmentCache`
/ `setInEnrichmentCache`). Navigating between these pages reuses warm cache entries.
`ControlPlaneDetailPage` also uses the cache for stale-while-revalidate rendering
(instant display from cache, background refresh via `fleetK8sGet`).

### Indexed MCM Correlation (O(1) lookup)

**Problem:** The original `findManagingMCM` function iterated over all MCMs and their
cluster statuses for every control plane — O(C × M × K) where C=control planes, M=MCMs,
K=clusters per MCM. At scale: 200 × 50 × 20 = 200,000 comparisons per render.

**Solution:** `buildMcmIndex()` in `utils/correlateMCM.ts` pre-builds a
`Map<clusterName/namespace, McmInfo>` from the MCMs array once, then `lookupMcm()` does
O(1) lookups. The index is memoized via `useMemo([mcms])`. List and detail pages use
the same shared utility.

### Debounced Enrichment Updates

**Problem:** During chunk-based enrichment, a state update after each chunk triggered a
full re-render. Combined with the old O(C×M×K) correlation, this caused excessive work
during a single enrichment cycle.

**Solution:** Enrichment progress is tracked via `useRef` and state is updated at most
once per second via `setTimeout` debouncing. A final state update fires when all chunks
complete. With the indexed correlation, each debounced re-render costs ~200 Map lookups
instead of 200K comparisons.

### Memoized TrustStatusCard Maps

**Problem:** `certsByCluster` and `mwByCluster` were computed inline on every render.
Both `useK8sWatchResource` calls (certs, manifestWorks) produce new array references on
every WebSocket update, triggering frequent re-renders.

**Solution:** Both map computations are wrapped in `useMemo`. Category counting and
filtering are delegated to `VirtualFilterTable` (see below).

### Single-Pass Categorization in VirtualFilterTable

**Problem:** Category functions were called twice per row — once for counting, once
for filtering.

**Solution:** `VirtualFilterTable` computes categories once into a `categoryMap` via
`useMemo`. `counts` and `filtered` both derive from the map. Used by
`ClusterStatusSection`, `TrustStatusCard`, and `ControlPlanesCard`. Search input is
debounced (200ms) to avoid re-filtering on every keystroke.

### Overview Recent Issues Top-K Buffer

**Problem:** Collecting all non-True conditions across every mesh and control plane
could produce an unbounded list on large fleets.

**Solution:** `collectRecentIssues` in `OverviewPage.tsx` accumulates issues until
`TOP_K_THRESHOLD` (100) is reached, then switches to a fixed-size top-5 buffer
(`insertTopK`) keeping only the newest issues by `lastTransitionTime`.

### Stable Search Key via Numeric Hash

**Problem:** The `searchKey` used for effect dependencies was computed by sorting all
search result strings and joining with commas — O(n log n) sort producing a ~6KB string
at 200 results.

**Solution:** Replaced with a polynomial rolling hash (multiplier 31, seed = array
length, bitwise-OR to int32) in `useEnrichedControlPlanes.ts` that produces a stable
integer in O(n) with no allocation. The same pattern stabilizes search poll results via
`stableResults`.

### Module-Level Enrichment Cache (historical)

**Problem:** The enrichment cache was stored in a `useRef` (per-component-instance), so
navigating away from the Control Planes page and back would destroy the cache. This
caused a full re-enrichment cycle with a table spinner on every page visit, even when
the data hadn't changed.

**Solution:** The enrichment cache was moved to a module-level `Map` in
`useEnrichedControlPlanes.ts` (see **Shared Enrichment Cache** above).

### Virtualized Tables

**Problem:** Detail page cards rendered all rows as DOM nodes inside a scrollable
container. At 1,000 clusters, that's 1,000+ `<tr>` elements causing scroll jank.

**Solution:**

- **`VirtualFilterTable`** + **`useVirtualRows`**: renders only visible rows plus a
  5-row overscan buffer (~15–20 DOM rows instead of 1,000, depending on scroll
  position) inside a 368px scroll container. Spacer `<tr>` elements maintain scroll
  position. Used on detail page cards and the conditions table on
  `DiscoveredMeshDetailPage`.
- **`VirtualizedTable`** (Console SDK): built-in row virtualization on Meshes and
  Control Planes list pages.

## Known Constraints

### N+1 Enrichment Pattern (Istio control planes)

Any page using `useEnrichedControlPlanes` (directly or via `useFleetMeshItems`) makes
one `fleetK8sGet` API call per discovered Istio CR that is missing or stale in the
cache. With 200 control planes, this is up to 200 GET requests every 150s (when the
cache TTL expires). Requests are batched with dynamic concurrency via
`getConcurrencyLimit()`: `Math.max(10, Math.min(25, Math.ceil(pending / 20)))` — 10 for
small fleets, scaling linearly, capped at 25.

This N+1 pattern exists because ACM Search only indexes common K8s metadata (kind,
name, namespace, labels, created) for the `Istio` CR. Fields needed for display —
`meshID`, `version`, `status` — are in `spec`/`status` which Search doesn't index.
See the inline comment block at the top of `useEnrichedControlPlanes.ts` for the
design rationale and exit ramps.

**Exit ramps** (none are actionable today):

- ACM Search gains spec/status indexing for custom resources
- The OSSM operator adds standardized labels (e.g. `istio.io/mesh-id`) to Istio CRs —
  labels are always indexed by Search
- Note: operators generally don't mutate `metadata` of CRs they reconcile (only
  `status`), so label-based solutions require upstream OSSM operator changes

**Mitigations in place:**

- Module-level TTL cache (150s) with `MAX_CACHE_SIZE` of 2000 entries; survives page
  navigation and is shared across all enrichment consumers
- Dynamic concurrency limit (10–25) prevents API server overload while scaling with
  pending count
- `stableResults` memo keyed on a content hash avoids re-enrichment when a 30s poll
  returns unchanged data
- Cancellation support prevents stale fetches from updating state
- Debounced state updates (once per second max) prevent re-render storms during
  enrichment
- Post-enrichment cache sweep removes entries for deleted control planes
- `MAX_CACHE_SIZE` eviction drops the oldest entry when the cache exceeds 2000 keys
- `initialEnrichmentDone` flag prevents spinner flash on subsequent search poll updates

**Known gap:** `DiscoveredMeshDetailPage` still uses fleet-wide enrichment instead of
a scoped hook like `useMeshControlPlanes`. A future optimization would enrich only the
control planes belonging to the discovered mesh.

### N+1 Enrichment Pattern (Kiali / OSSMC observability)

`useDiscoveredKialis` fetches full Kiali and OSSM Console CRs per discovered instance.
Each Kiali may require up to **two GETs** (Kiali CR + OpenShift Route when route host
is not already known from `web_fqdn`). This adds another parallel N+1 pipeline with
module-level caches (150s TTL) and a fixed concurrency of 15.

**Mitigations in place:**

- Separate module-level caches for Kiali and OSSMC entries
- Route fetches skipped when `web_fqdn` is set or ingress is disabled
- Optional `scopeFilter` limits which clusters are enriched on detail pages (Kiali
  only — OSSMC enrichment is unscoped; see Observability links section above)
- Same ACM Search limitation as Istio enrichment — full spec/status requires
  per-cluster GET

**Known gaps:**

- Kiali/OSSMC caches have no `MAX_CACHE_SIZE` cap (unlike Istio enrichment)
- Kiali/OSSMC caches have no stale-entry sweep — entries for deleted CRs persist
  indefinitely. The Istio enrichment cache sweeps entries for CRs no longer in search
  results after each cycle; no equivalent cleanup exists for observability caches.

### Fleet-Wide ManagedCluster Watch

Pages using `useManagedClusterMap` watch all `ManagedCluster` objects on the hub to
show cluster availability (Available/Unavailable/Unreachable) or resolve observability
links. At 200+ clusters, the hub returns all ManagedCluster objects and maintains a
WebSocket subscription for updates. Each update produces a new array reference that
cascades through `managedClusterMap` rebuilds.

The watch is not scoped to mesh-member clusters because that would require individual
watches per cluster name (potentially 20+ per page). The Console SDK likely dedupes
identical watch configs across components, so navigating between pages should not
create duplicate subscriptions.

**Mitigations in place:**

- `managedClusterMap` is wrapped in `useMemo` keyed on the watch data, so the Map only
  rebuilds when the array reference changes
- Downstream maps (e.g. `clusterAvailabilityMap` on `DiscoveredMeshDetailPage`) are
  memoized

## Error Resilience

The enrichment pipelines degrade gracefully rather than blocking the UI:

- **Partial results:** `Promise.allSettled` is used for all enrichment batches, so
  individual CR fetch failures (404, timeout, network error) don't block other CPs in
  the same chunk. Failed CRs render with metadata-only (from Search) without
  spec/status fields.
- **Loaded-on-error:** Both enrichment hooks set `enrichmentLoaded = true` on catch,
  preventing infinite spinner states. The UI renders whatever data was successfully
  fetched.
- **Independent error paths:** `OverviewPage` shows partial data with inline warnings
  when either meshes or control planes fail independently — the Meshes donut can render
  from MCM data alone while the Control Planes section shows its own error state.
- **Silent degradation risk:** Because `Promise.allSettled` discards rejections, a
  systematic failure (e.g. API server throttling returning 429s for all requests) will
  not surface as a visible error to the user — the UI simply shows stale cached data or
  metadata-only rows without an explicit warning.

## Monitoring Checklist

Things to watch as scale increases:

- [ ] **Enrichment latency**: At 200 CPs with ~200ms per round and concurrency 10–25,
  enrichment takes a few seconds. If latency grows, investigate `getConcurrencyLimit()`
  bounds or batch API alternatives.
- [ ] **Overview/Meshes first-load cost**: These pages trigger the same fleet-wide Istio
  enrichment as Control Planes. Profile end-to-end load time when all three pages are
  visited in a session.
- [ ] **Discovered mesh detail cost**: Still uses fleet-wide enrichment. Profile whether
  scoping to mesh member CPs (like `useMeshControlPlanes`) would materially reduce load.
- [ ] **Cache memory**: Each cached Istio CR is ~2–5KB. At 500+ CPs with cluster
  churn, monitor memory usage during long sessions. Istio cache evicts stale keys after
  enrichment sweeps and drops oldest entries at `MAX_CACHE_SIZE` (2000).
- [ ] **Kiali/OSSMC cache memory**: No size cap on Kiali/OSSMC caches. Monitor growth
  when many instances exist across the fleet (each Kiali entry may include a Route fetch).
- [ ] **Kiali/OSSMC discovery latency**: `useDiscoveredKialis` adds parallel GETs (up to
  two per Kiali) for observability links. Profile total fetch time at scale.
- [ ] **API throttling / 429 responses**: At 200+ CPs, enrichment generates sustained
  burst traffic to the ACM proxy. Monitor for HTTP 429/503 responses. Because
  `Promise.allSettled` silently discards failures, throttling may not surface as a user-
  visible error — the UI shows stale data instead. Consider adding retry-with-backoff
  or surfacing a warning when a significant fraction of enrichment requests fail.
- [ ] **Search response size**: The full fleet search response is metadata-only and
  should be small even at 500+ CPs. If it grows, investigate the `limit` parameter on
  `useFleetSearchPoll`.
- [ ] **MCM index rebuild frequency**: The `mcmIndex` rebuilds whenever the MCMs
  WebSocket watch fires. Building a Map from 100 MCMs with 20 clusters each is ~2000
  `Map.set` calls (microseconds), but if MCM count grows significantly or WebSocket
  updates become frequent, profile whether the index build cost is measurable.
- [ ] **ManagedCluster watch size**: Fleet-wide watch on pages using
  `useManagedClusterMap`. At 200+ clusters this is acceptable, but if the fleet grows
  to 1000+ clusters, consider scoping the watch to mesh-member clusters only or deriving
  availability from a lighter-weight source.
