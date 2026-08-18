# Kiali / OSSMC Observability Link Decision Flows

Per-page decision flows for the five pages that render observability links (`Kiali`, `OSSMC`, or `-`).

Observability links on fleet pages (sections 1–4) open in a new browser tab. Section 5 is the exception: a promoted Kiali navigates to the OSSMC overview in the same tab.

`{consoleUrl}` is the spoke cluster's OpenShift Console URL as known to ACM on the hub (from the ManagedCluster resource). Spoke links need it so the hub can build absolute URLs that open the correct console in a new tab.

**Link types:**

- **(a) No link** — No URL can be resolved for that observability target. List and table cells show `-`. The control plane detail card shows `Kiali not available` or `OSSMC not available` on the corresponding row.

- **(b) Standalone Kiali** — Opens the Kiali server directly at `https://{routeHost|webFqdn}`, using the Route host or `spec.server.web_fqdn` from the matching Kiali CR.

- **(c) OSSMC-Full** — Opens the full OSSMC mesh overview at `{consoleUrl}/ossmconsole/overview`. This route requires a Kiali backend and is used on spokes when a Kiali CR matches the control plane namespace and OSSMC is integrated with that Kiali (`status.kiali.serviceNamespace` equals the CP namespace). On the hub Kialis admin page (section 5), a promoted Kiali uses the same overview route in the same tab.

- **(d) Istios and Kialis list pages** — Opens OSSMC plugin pages that work without a Kiali backend. Hub links use relative paths on the current console (`/ossmconsole/...`). Spoke links prefix the spoke's known console URL (`{consoleUrl}/ossmconsole/...`). Specific routes:
  - Kiali CR detail (hub): `/ossmconsole/kialis/{crNamespace}/{crName}`
  - Istio CR detail (hub, no matching Kiali CR): `/ossmconsole/istios/{istioCrName}`
  - Istio CR detail (spoke, OSSMC installed, full observability unavailable): `{consoleUrl}/ossmconsole/istios/{istioCrName}`

---



## 1. Control Planes — `/fleet-mesh/control-planes`

Per control-plane row in the **Observe** column (`renderObservabilityLink`):

```
Matching Kiali CR (same cluster, deploymentNamespace = CP namespace)?
├─ Yes → standaloneUrl (routeHost or webFqdn)?
│         ├─ Yes → (b) Standalone Kiali  ["Kiali"]
│         └─ No  → OSSMC integrated with Kiali for this CP (kialiServiceNamespace = CP namespace)?
│                   ├─ Hub   → (d) Kialis detail page  ["/ossmconsole/kialis/{crNamespace}/{crName}"]
│                   ├─ Spoke → (c) OSSMC-Full  ["{consoleUrl}/ossmconsole/overview"]
│                   └─ No    → spoke Istios and Kialis list page fallback (see below) or (a) no link  ["-"]
└─ No  → Hub?
          ├─ Yes → (d) Istios detail page  ["/ossmconsole/istios/{istioCrName}"]
          └─ Spoke → spoke Istios and Kialis list page fallback (see below) or (a) no link  ["-"]

Spoke Istios and Kialis list page fallback (no standalone Kiali and no OSSMC-Full):
OSSMC on cluster (any) + known console URL?
├─ Yes → (d) Istios detail page  ["{consoleUrl}/ossmconsole/istios/{istioCrName}"]
└─ No  → (a) no link  ["-"]
```

**Column visibility:** Observe column is always visible. Rows with no match show `-`.

**Note:** `{istioCrName}` is the Istio CR name for that row (`metadata.name`), available from ACM Search as soon as the row renders.

**Spoke Istios and Kialis list page fallback:** On spoke clusters, when full observability (standalone Kiali or OSSMC-Full overview) cannot be resolved, and OSSMC is installed with a known console URL for that spoke, the Observe column links to the Istios detail page for that control plane's Istio CR. This applies when OSSMC has no backing Kiali, when `kialiServiceNamespace` differs from this row's CP namespace, or when a Kiali CR's deployment namespace equals the CP namespace but has no Route/`web_fqdn` and OSSMC is not integrated with that Kiali. If OSSMC is not installed on the cluster, the Observe column shows `-`.

**Matching OSSMC:** OSSMC either runs with a backing Kiali server or without a connected Kiali server. When integrated, `status.kiali.serviceNamespace` is the namespace where that Kiali is deployed. Fleet mesh treats OSSMC as "matching" a control plane row when that namespace equals the row's CP namespace.

---



## 2. Control Plane Detail — `/fleet-mesh/control-planes/:type/:cluster/:name`

**Observability** card (`ObservabilityCard` → `resolveControlPlaneObservabilityLink` — **no** standalone-over-OSSMC preference). The card is always visible with two horizontal rows: **Kiali** and **OSSMC**. Each row shows a link or an unavailable message.

```
Observability card always shown with Kiali and OSSMC rows.

Kiali row — first matching link with standaloneUrl (routeHost or webFqdn)?
├─ Yes → (b) Standalone Kiali  ["{hostname}"]
└─ No  → (a) no link  ["Kiali not available"]

OSSMC row — first matching link with ossmcUrl?
├─ Hub + Kiali CR + OSSMC integrated with that Kiali
│    → (d) Kialis detail page  ["Console", "/ossmconsole/kialis/{crNamespace}/{crName}"]
├─ Hub + no Kiali CR
│    → (d) Istios detail page  ["Console", "/ossmconsole/istios/{istioCrName}"]
├─ Spoke + Kiali CR + OSSMC integrated with that Kiali + known console URL
│    → (c) OSSMC-Full  ["{consoleHostname}/ossmconsole/overview"]
├─ Spoke + OSSMC on cluster (any) + known console URL (Istios and Kialis list page fallback)
│    → (d) Istios detail page  ["{consoleHostname}/ossmconsole/istios/{istioCrName}"]
└─ otherwise → (a) no link  ["OSSMC not available"]

Both URLs present → both rows show links (unlike the list page)
Neither URL present → both rows show unavailable messages
```

---



## 3. Managed Mesh Detail — `/fleet-mesh/meshes/managed/:ns/:name`

Per control-plane row in the embedded **Control Planes** table (`ControlPlanesCard` → `renderObservabilityLink`). Only control planes belonging to this managed mesh are listed; link logic per row matches section 1.

```
For each control plane in this mesh (Observe column):
Matching Kiali CR (same cluster, deploymentNamespace = CP namespace)?
├─ Yes → standaloneUrl (routeHost or webFqdn)?
│         ├─ Yes → (b) Standalone Kiali  ["Kiali"]
│         └─ No  → OSSMC integrated with Kiali for this CP (kialiServiceNamespace = CP namespace)?
│                   ├─ Hub   → (d) Kialis detail page  ["/ossmconsole/kialis/{crNamespace}/{crName}"]
│                   ├─ Spoke → (c) OSSMC-Full  ["{consoleUrl}/ossmconsole/overview"]
│                   └─ No    → spoke Istios and Kialis list page fallback (see section 1) or (a) no link  ["-"]
└─ No  → Hub?
          ├─ Yes → (d) Istios detail page  ["/ossmconsole/istios/{istioCrName}"]
          └─ Spoke → spoke Istios and Kialis list page fallback (see section 1) or (a) no link  ["-"]
```

**Column visibility:** Observe column appears only if the link map has at least one CP with `standaloneUrl` or `ossmcUrl`. Rows with no match show `-`.

---



## 4. Discovered Mesh Detail — `/fleet-mesh/meshes/discovered/:meshID`

Per control-plane row in the embedded **Control Planes** table (`ControlPlanesCard` → `renderObservabilityLink`). Only control planes belonging to this discovered mesh are listed; link logic per row matches section 1.

```
For each control plane in this discovered mesh (Observe column):
Matching Kiali CR (same cluster, deploymentNamespace = CP namespace)?
├─ Yes → standaloneUrl (routeHost or webFqdn)?
│         ├─ Yes → (b) Standalone Kiali  ["Kiali"]
│         └─ No  → OSSMC integrated with Kiali for this CP (kialiServiceNamespace = CP namespace)?
│                   ├─ Hub   → (d) Kialis detail page  ["/ossmconsole/kialis/{crNamespace}/{crName}"]
│                   ├─ Spoke → (c) OSSMC-Full  ["{consoleUrl}/ossmconsole/overview"]
│                   └─ No    → spoke Istios and Kialis list page fallback (see section 1) or (a) no link  ["-"]
└─ No  → Hub?
          ├─ Yes → (d) Istios detail page  ["/ossmconsole/istios/{istioCrName}"]
          └─ Spoke → spoke Istios and Kialis list page fallback (see section 1) or (a) no link  ["-"]
```

**Column visibility:** Observe column appears only if the link map has at least one CP with `standaloneUrl` or `ossmcUrl`. Rows with no match show `-`.

---



## 5. Kialis list page — `/ossmconsole/kialis`

Per Kiali CR row in the **Observe** column (`renderKialiLink` — **not** fleet-mesh discovery logic):

```
Is this Kiali currently promoted to Console?
(OSSMC status known AND isPromoted(activeOssmConsole, serviceName, serviceNamespace))
├─ Yes → (c) OSSMC-Full on hub  [OSSMC overview in Console, same tab, "OSSMC"]
└─ No  → host available?
          (spec.server.web_fqdn  OR  Route host from useKialiRouteHosts)
          ├─ Yes → (b) Standalone Kiali  ["https://{host}", "Kiali"]
          └─ No  → (a) no link  ["-"]

Route lookup skipped when:
  ingress.enabled === false  OR  web_fqdn already set
Route fetch failure → treated as no routeHost
```

**Not in this column:** the CR **name** link always goes to `/ossmconsole/kialis/{crNamespace}/{crName}` (Kialis detail page navigation — separate from observability link logic).

---



## Cross-page cheat sheet


| Outcome            | Fleet pages 1, 3, 4               | CP Detail (#2)           | Kialis page (#5)                  |
| ------------------ | --------------------------------- | ------------------------ | --------------------------------- |
| **(a) No link**    | `-` in cell                       | `Kiali not available` / `OSSMC not available` | `-`                               |
| **(b) Standalone** | Preferred in cell                 | Separate Kiali row       | When not promoted + host found    |
| **(c) OSSMC-Full** | Spoke overview when Kiali CR exists and OSSMC is integrated with that Kiali | Separate OSSMC row (spoke + Kiali CR + integrated OSSMC) | When promoted → hub overview (same tab) |
| **(d) Istios and Kialis list pages** | Hub istios/kiali detail; spoke istios detail when OSSMC installed but full observability unavailable | Separate OSSMC row (hub or spoke) | N/A (uses overview when promoted) |
