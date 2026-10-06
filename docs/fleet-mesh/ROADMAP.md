# Fleet Service Mesh Perspective — Roadmap

Plugin code lives in `plugin/src/fleet-mesh/` within the OpenShift Service Mesh Console
(OSSMC) dynamic plugin.

## What's next (not blocked)

- **Placement-based managed meshes** — Track [OSSMC #870](https://github.com/kiali/openshift-servicemesh-plugin/issues/870) with [add-on PR #286](https://github.com/stolostron/multicluster-mesh-addon/pull/286). Managed meshes reference a user-owned Placement in the MCM namespace. A namespace needs a ManagedClusterSetBinding for each ClusterSet its Placement uses. The read-only Fleet view shows selection separately from MCM operational status; it does not create or delete these ACM resources.
- **Data plane visibility** — Meshes have control planes but also data planes — the
  namespaces within clusters where application workloads run with sidecar proxies. The
  UI needs a way to discover and visualize data planes (which clusters, which
  namespaces, how many workloads). The discovery mechanism and UI design are TBD.
- **Create / delete mesh actions** — Choose an existing Placement in the selected hub namespace, then create only the MCM. Deleting a mesh retains its Placement and ManagedClusterSetBinding because other consumers may use them.
- **Edit mesh** — Edit issuer, operator config, or `placementRef` from the detail page. Preview the current decisions for the old and new Placements and likely cluster additions/removals before saving.
- **Scoped enrichment on discovered mesh detail** — `DiscoveredMeshDetailPage` still
  runs fleet-wide Istio enrichment then filters client-side. Adopt a scoped hook (like
  `useMeshControlPlanes` on managed mesh detail) to reduce GET volume on large fleets.
  See [PERFORMANCE.md](./PERFORMANCE.md).
- **Observability link polish** — Reduce N+1 fetches for Route hosts, bound Kiali/OSSMC
  cache size, and handle edge cases when ACM Search or cluster console URL claims are
  incomplete. See [DESIGN-KIALI-LINKS.md](./DESIGN-KIALI-LINKS.md).
- **Address OSSM-ACM addon controller issues that may affect the plugin** — Addon
  controller issues that impact the fleet-mesh perspective are tracked as GitHub issues
  in [kiali/openshift-servicemesh-plugin](https://github.com/kiali/openshift-servicemesh-plugin)
  (or [kiali/kiali](https://github.com/kiali/kiali) when Kiali server code is affected).
  Tracking issues use the `[fleet-mesh] Addon controller #NNN` title pattern. The
  stolostron repo is read-only — never file tracking issues there. Run the
  [track-ossm-acm-addon-backend-issues skill](../../.claude/skills/track-ossm-acm-addon-backend-issues/SKILL.md)
  periodically (e.g., when new multicluster-mesh-addon issues are filed or before sprint
  planning).
- **Review performance monitoring checklist** — [PERFORMANCE.md](./PERFORMANCE.md) has a
  monitoring checklist with items to watch as cluster scale increases (enrichment
  latency, DOM size, cache memory, etc.). Periodically review it against current usage
  to determine if any thresholds are being hit and optimizations are needed.

## Blocked on addon controller

- **Per-cluster trust status** —
  [stolostron/multicluster-mesh-addon#118](https://github.com/stolostron/multicluster-mesh-addon/issues/118)
  proposes a `TrustEstablished` condition in `status.clusterStatus[].conditions[]`.
  Today the plugin derives trust from cert-manager Certificates and ManifestWorks in
  `TrustStatusCard`. When the addon reports trust per cluster, refactor the trust card
  and cluster status categorization in `MeshDetailPage` to use CR status as the primary
  source (keep cert/MW watches for expiry detail only).
- **Endpoint discovery status UI** — The addon creates `ManagedServiceAccount`
  resources and `spec.security.discovery` exists on the CRD, but per-cluster discovery
  status is not yet surfaced on the CR (token issuance, expiry, remote secret
  distribution). Related backend work includes
  [stolostron/multicluster-mesh-addon#214](https://github.com/stolostron/multicluster-mesh-addon/issues/214)
  (remote access secret construction). When status fields are available, add a discovery
  card similar to the Trust Status card.
- **BYO CA / trust model changes** —
  [stolostron/multicluster-mesh-addon#112](https://github.com/stolostron/multicluster-mesh-addon/issues/112)
  discusses cert-manager requirements and bring-your-own CA support. If trust moves
  beyond cert-manager, `TrustStatusCard`, the Meshes trust column, and mesh detail
  overview will need alternate code paths driven by spec.

## Related

- [OSSM-12887](https://redhat.atlassian.net/browse/OSSM-12887) — Epic: OSSM/Kiali ACM
  console integration developer preview
- [OCPSTRAT-2989](https://redhat.atlassian.net/browse/OCPSTRAT-2989) — Feature:
  Fleet-wide service mesh console integration with ACM
- [multicluster-mesh-addon](https://github.com/stolostron/multicluster-mesh-addon) —
  OSSM-ACM addon controller (backend; read-only for issue tracking)
- [PERFORMANCE.md](./PERFORMANCE.md) — Scale constraints, optimizations, monitoring
  checklist
- [DESIGN-KIALI-LINKS.md](./DESIGN-KIALI-LINKS.md) — Observability link decision flows
- [DEV-INSTALL.md](../../hack/fleet-mesh/DEV-INSTALL.md) — Local dev and demo setup
