import type { EncodedExtension } from '@openshift-console/dynamic-plugin-sdk-webpack';

// The Console resolves %plugin__ossm-acm~Title% markers using the fleet-mesh locale bundle
// at dist/locales/{lang}/plugin__ossm-acm.json, served separately from the OSSMC namespace.
const consoleName = (name: string): string => `%plugin__ossm-acm~${name}%`;

const fleetMeshAvailableFlag: EncodedExtension = {
  type: 'console.flag',
  properties: {
    handler: { $codeRef: 'fleetMeshAvailableFlag' }
  }
};

// The perspective is NOT flag-gated due to a known OCP 4.22 Console bug
// (OCPBUGS-84047, https://github.com/openshift/console/issues/16295).
// Plugins registering perspectives with async feature flags hit a trilemma:
//   1. `required` flag on perspective → infinite loading spinner
//   2. `disallowed` flag on perspective + `perspective` on routes → redirect loop
//   3. `disallowed` flag + no `perspective` on routes → stuck perspective
// All three options are broken on 4.22 due to split-render behavior between
// PerspectiveContext and RouterContext after the react-router migration.
// Once the Console fix ships, restore the flag below to hide the perspective
// when ACM is not present on the cluster.
// Nav items ARE flag-gated so the sidebar is empty when ACM is absent, and pages
// handle the "not available" state gracefully via their hooks.
const fleetServiceMeshPerspective: EncodedExtension = {
  // flags: { required: ['FLEET_MESH_AVAILABLE'] },
  type: 'console.perspective',
  properties: {
    defaultPins: [],
    icon: { $codeRef: 'fleetPerspectiveIcon' },
    id: 'fleet-service-mesh',
    importRedirectURL: { $codeRef: 'fleetPerspective.importRedirectURL' },
    landingPageURL: { $codeRef: 'fleetPerspective.landingPageURL' },
    name: consoleName('Fleet Service Mesh')
  }
};

const overviewNavItem: EncodedExtension = {
  // flags: { required: ['FLEET_MESH_AVAILABLE'] },
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/overview',
    id: 'fleet-mesh-overview',
    name: consoleName('Overview'),
    perspective: 'fleet-service-mesh'
  }
};

const fleetMeshesNavItem: EncodedExtension = {
  // flags: { required: ['FLEET_MESH_AVAILABLE'] },
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/meshes',
    id: 'fleet-meshes',
    name: consoleName('Meshes'),
    perspective: 'fleet-service-mesh'
  }
};

const controlPlanesNavItem: EncodedExtension = {
  // flags: { required: ['FLEET_MESH_AVAILABLE'] },
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/control-planes',
    id: 'fleet-control-planes',
    name: consoleName('Control Planes'),
    perspective: 'fleet-service-mesh'
  }
};

// Routes are not flag-gated so deep-linked URLs remain resolvable even while the
// flag handler is still evaluating at startup.

const fleetMeshDetailRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetMeshDetailPage.default' },
    path: '/fleet-mesh/meshes/managed/:ns/:name',
    perspective: 'fleet-service-mesh'
  }
};

const discoveredMeshDetailRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetDiscoveredMeshDetailPage.default' },
    path: '/fleet-mesh/meshes/discovered/:meshID',
    perspective: 'fleet-service-mesh'
  }
};

const fleetMeshListRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetServiceMeshPage.default' },
    path: '/fleet-mesh/meshes',
    perspective: 'fleet-service-mesh'
  }
};

const controlPlaneDetailRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetControlPlaneDetailPage.default' },
    path: '/fleet-mesh/control-planes/:type/:cluster/:name',
    perspective: 'fleet-service-mesh'
  }
};

const controlPlanesRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetControlPlanesPage.default' },
    path: '/fleet-mesh/control-planes',
    perspective: 'fleet-service-mesh'
  }
};

const overviewRoute: EncodedExtension = {
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetOverviewPage.default' },
    path: '/fleet-mesh/overview',
    perspective: 'fleet-service-mesh'
  }
};

// Detail routes must be registered before their corresponding list routes because
// React Router v5 matches the first path whose prefix matches the current URL.
export const fleetMeshExtensions: EncodedExtension[] = [
  fleetMeshAvailableFlag,
  fleetServiceMeshPerspective,
  overviewNavItem,
  fleetMeshesNavItem,
  controlPlanesNavItem,
  fleetMeshDetailRoute,
  discoveredMeshDetailRoute,
  fleetMeshListRoute,
  controlPlaneDetailRoute,
  controlPlanesRoute,
  overviewRoute
];
