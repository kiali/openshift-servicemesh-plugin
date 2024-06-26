import { EncodedExtension } from '@openshift/dynamic-plugin-sdk-webpack';
import { K8sGroupVersionKind } from '@openshift-console/dynamic-plugin-sdk';

const OSSM_CONSOLE = 'ossmconsole';
const ADMIN = 'admin';

const getConsoleTitle = (title: string) => `%plugin__ossmconsole~${title}%`;

const enum Page {
  GRAPH = 'GraphPage',
  ISTIO = 'IstioConfigListPage',
  MESH = 'MeshPage',
  OVERVIEW = 'OverviewPage'
}

const enum Tab {
  ISTIO = 'IstioMeshTab',
  PROJECT = 'ProjectMeshTab',
  SERVICE = 'ServiceMeshTab',
  WORKLOAD = 'WorkloadMeshTab'
}

const K8sResource: { [key: string]: K8sGroupVersionKind } = {
  Project: {
    group: 'project.openshift.io',
    kind: 'Project',
    version: 'v1'
  },
  Pod: {
    group: '',
    kind: 'Pod',
    version: 'v1'
  },
  Deployment: {
    group: 'apps',
    kind: 'Deployment',
    version: 'v1'
  },
  DeploymentConfig: {
    group: 'apps.openshift.io',
    kind: 'DeploymentConfig',
    version: 'v1'
  },
  StatefulSet: {
    group: 'apps',
    kind: 'StatefulSet',
    version: 'v1'
  },
  Service: {
    group: '',
    kind: 'Service',
    version: 'v1'
  }
};

const istioResources: K8sGroupVersionKind[] = [
  {
    group: 'security.istio.io',
    version: 'v1',
    kind: 'AuthorizationPolicy'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'DestinationRule'
  },
  {
    group: 'networking.istio.io',
    version: 'v1alpha3',
    kind: 'EnvoyFilter'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'Gateway'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'Gateway'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'GRPCRoute'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'HTTPRoute'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1beta1',
    kind: 'ReferenceGrant'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TCPRoute'
  },
  {
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TLSRoute'
  },
  {
    group: 'security.istio.io',
    version: 'v1',
    kind: 'PeerAuthentication'
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ProxyConfig'
  },
  {
    group: 'security.istio.io',
    version: 'v1',
    kind: 'RequestAuthentication'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'ServiceEntry'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'Sidecar'
  },
  {
    group: 'telemetry.istio.io',
    version: 'v1',
    kind: 'Telemetry'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'VirtualService'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadEntry'
  },
  {
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadGroup'
  },
  {
    group: 'extensions.istio.io',
    version: 'v1alpha1',
    kind: 'WasmPlugin'
  }
];

const reduxReducer: EncodedExtension = {
  type: 'console.redux-reducer',
  properties: {
    scope: 'kiali',
    reducer: { $codeRef: 'ReduxReducer' }
  }
};

const consoleSection: EncodedExtension = {
  type: 'console.navigation/section',
  properties: {
    id: OSSM_CONSOLE,
    perspective: ADMIN,
    name: getConsoleTitle('Service Mesh')
  }
};

const consoleRoute = (id: string, title: string, pageRef: string, paths: string[]): EncodedExtension[] => {
  const routes = paths.map(path => ({
    type: 'console.page/route',
    properties: {
      exact: true,
      path: path,
      component: { $codeRef: pageRef }
    }
  }));

  return [
    ...routes,
    {
      type: 'console.navigation/href',
      properties: {
        id: `${OSSM_CONSOLE}_${id}`,
        name: getConsoleTitle(title),
        href: paths[0],
        perspective: ADMIN,
        section: OSSM_CONSOLE
      }
    }
  ];
};

const horizontalNav = (model: K8sGroupVersionKind, tabRef: string): EncodedExtension => ({
  type: 'console.tab/horizontalNav',
  properties: {
    model: model,
    page: {
      name: getConsoleTitle('Service Mesh'),
      href: OSSM_CONSOLE
    },
    component: { $codeRef: tabRef }
  }
});

const extensions: EncodedExtension[] = [
  reduxReducer,
  consoleSection,

  // Console routes for each OSSMC page
  ...consoleRoute('overview', 'Overview', Page.OVERVIEW, ['/ossmconsole/overview']),
  ...consoleRoute('graph', 'Traffic Graph', Page.GRAPH, [
    '/ossmconsole/graph',
    '/ossmconsole/graph/ns/:namespace/aggregates/:aggregate/:aggregateValue',
    '/ossmconsole/graph/ns/:namespace/applications/:app/versions/:version',
    '/ossmconsole/graph/ns/:namespace/applications/:app',
    '/ossmconsole/graph/ns/:namespace/services/:service',
    '/ossmconsole/graph/ns/:namespace/workloads/:workload'
  ]),
  ...consoleRoute('istio', 'Istio Config', Page.ISTIO, ['/k8s/all-namespaces/istio', '/k8s/ns/:ns/istio']),
  ...consoleRoute('mesh', 'Mesh', Page.MESH, ['/ossmconsole/mesh']),

  // K8s horizontal navs - service mesh tab of k8s resources
  horizontalNav(K8sResource.Project, Tab.PROJECT),
  horizontalNav(K8sResource.Pod, Tab.WORKLOAD),
  horizontalNav(K8sResource.Deployment, Tab.WORKLOAD),
  horizontalNav(K8sResource.DeploymentConfig, Tab.WORKLOAD),
  horizontalNav(K8sResource.StatefulSet, Tab.WORKLOAD),
  horizontalNav(K8sResource.Service, Tab.SERVICE),

  // Istio horizontal navs - service mesh tab of istio resources
  ...istioResources.map(istioResource => ({
    type: 'console.tab/horizontalNav',
    properties: {
      model: istioResource,
      page: {
        name: getConsoleTitle('Service Mesh'),
        href: OSSM_CONSOLE
      },
      component: { $codeRef: Tab.ISTIO }
    }
  }))
];

export default extensions;
