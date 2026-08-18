// Webpack module federation entry points for the fleet-mesh plugin subtree.
// The root plugin-metadata.ts spreads these into its exposedModules map so that
// all fleet-mesh wiring stays inside this subtree and the root file needs no
// further changes when pages or routes are added here.
export const fleetMeshModules = {
  fleetControlPlaneDetailPage: './fleet-mesh/components/ControlPlaneDetailPage',
  fleetControlPlanesPage: './fleet-mesh/components/ControlPlanesPage',
  fleetDiscoveredMeshDetailPage: './fleet-mesh/components/DiscoveredMeshDetailPage',
  fleetMeshAvailableFlag: './fleet-mesh/flags/fleetMeshAvailableFlag',
  fleetMeshDetailPage: './fleet-mesh/components/MeshDetailPage',
  fleetOverviewPage: './fleet-mesh/components/OverviewPage',
  fleetPerspective: './fleet-mesh/perspective',
  fleetPerspectiveIcon: './fleet-mesh/perspectiveIcon',
  fleetServiceMeshPage: './fleet-mesh/components/ServiceMeshPage'
};
