import type { EncodedExtension } from '@openshift-console/dynamic-plugin-sdk-webpack';
import { FLEET_MESH_AVAILABLE_FLAG } from './flags/constants';
import { OSSMC_INTERNAL_TECH_PREVIEW_FLAG } from '../openshift/flags/constants';

// The Console resolves %plugin__ossmconsole~Title% markers using the same locale
// bundle shared by the rest of the OSSMC plugin (plugin__ossmconsole namespace via useKialiTranslation).
const getConsoleTitle = (title: string): string => `%plugin__ossmconsole~${title}%`;

const fleetMeshAvailableFlag: EncodedExtension = {
  type: 'console.flag/hookProvider',
  properties: {
    handler: { $codeRef: 'fleetMeshAvailableFlag' }
  }
};

// Fleet UI requires both the customer opt-in (unsupported tech preview) and the existing
// ACM hub probe. All fleet extensions below share this single constant, so gating the entire
// subtree is a one-line change here rather than needing to touch every extension individually.
const fleetMeshRequiredFlags = { required: [FLEET_MESH_AVAILABLE_FLAG, OSSMC_INTERNAL_TECH_PREVIEW_FLAG] };

const fleetServiceMeshPerspective: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.perspective',
  properties: {
    defaultPins: [],
    icon: { $codeRef: 'fleetPerspectiveIcon' },
    id: 'fleet-service-mesh',
    importRedirectURL: { $codeRef: 'fleetPerspective.importRedirectURL' },
    landingPageURL: { $codeRef: 'fleetPerspective.landingPageURL' },
    name: getConsoleTitle('Fleet Service Mesh')
  }
};

const overviewNavItem: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/overview',
    id: 'fleet-mesh-overview',
    name: getConsoleTitle('Overview'),
    perspective: 'fleet-service-mesh'
  }
};

const fleetMeshesNavItem: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/meshes',
    id: 'fleet-meshes',
    name: getConsoleTitle('Meshes'),
    perspective: 'fleet-service-mesh'
  }
};

const controlPlanesNavItem: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.navigation/href',
  properties: {
    href: '/fleet-mesh/control-planes',
    id: 'fleet-control-planes',
    name: getConsoleTitle('Control Planes'),
    perspective: 'fleet-service-mesh'
  }
};

const fleetMeshDetailRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetMeshDetailPage.default' },
    path: '/fleet-mesh/meshes/managed/:ns/:name',
    perspective: 'fleet-service-mesh'
  }
};

const discoveredMeshDetailRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetDiscoveredMeshDetailPage.default' },
    path: '/fleet-mesh/meshes/discovered/:meshID',
    perspective: 'fleet-service-mesh'
  }
};

const fleetMeshListRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetServiceMeshPage.default' },
    path: '/fleet-mesh/meshes',
    perspective: 'fleet-service-mesh'
  }
};

const controlPlaneDetailRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetControlPlaneDetailPage.default' },
    path: '/fleet-mesh/control-planes/:type/:cluster/:name',
    perspective: 'fleet-service-mesh'
  }
};

const controlPlanesRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
  type: 'console.page/route',
  properties: {
    component: { $codeRef: 'fleetControlPlanesPage.default' },
    path: '/fleet-mesh/control-planes',
    perspective: 'fleet-service-mesh'
  }
};

const overviewRoute: EncodedExtension = {
  flags: fleetMeshRequiredFlags,
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
