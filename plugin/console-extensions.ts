import { EncodedExtension } from '@openshift/dynamic-plugin-sdk-webpack';
import { K8sGroupVersionKind } from '@openshift-console/dynamic-plugin-sdk';

const OSSM_CONSOLE = 'ossmconsole';
const ADMIN = 'admin';
const KIALI_REACHABLE = 'KIALI_REACHABLE';

const getConsoleTitle = (title: string) => `%plugin__ossmconsole~${title}%`;

const enum Page {
  APPLICATION_DETAIL = 'AppDetailsPage',
  APPLICATIONS = 'AppListPage',
  GRAPH = 'GraphPage',
  ISTIO = 'IstioConfigListPage',
  ISTIO_NEW = 'IstioConfigNewPage',
  ISTIOS = 'IstiosPage',
  KIALIS = 'KialisPage',
  MESH = 'MeshPage',
  NAMESPACES = 'NamespacesPage',
  OVERVIEW = 'OverviewPage',
  SERVICE_DETAIL = 'ServiceDetailsPage',
  SERVICES = 'ServiceListPage',
  WORKLOADS = 'WorkloadListPage'
}

const enum Tab {
  ISTIO = 'IstioDetailsTab',
  NAMESPACE = 'NamespaceDetailsTab',
  SERVICE = 'ServiceDetailsTab',
  WORKLOAD = 'WorkloadDetailsTab'
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
  ReplicaSet: {
    group: 'apps',
    kind: 'ReplicaSet',
    version: 'v1'
  },
  StatefulSet: {
    group: 'apps',
    kind: 'StatefulSet',
    version: 'v1'
  },
  DaemonSet: {
    group: 'apps',
    kind: 'DaemonSet',
    version: 'v1'
  },
  Namespace: {
    group: '',
    kind: 'Namespace',
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

const kialiFlag: EncodedExtension = {
  type: 'console.flag/hookProvider',
  properties: {
    handler: { $codeRef: 'KialiFlag.useKialiFlag' }
  }
};

const reduxReducer: EncodedExtension = {
  type: 'console.redux-reducer',
  properties: {
    scope: 'kiali',
    reducer: { $codeRef: 'ReduxReducer' }
  },
  flags: {
    required: [KIALI_REACHABLE]
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

type Flags = { required?: string[]; disallowed?: string[] };

const consoleRoute = (id: string, title: string, pageRef: string, paths: string[], flags?: Flags): EncodedExtension[] => {
  const routes = paths.map(path => ({
    type: 'console.page/route',
    properties: {
      exact: true,
      path: path,
      component: { $codeRef: pageRef }
    },
    ...(flags && { flags })
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
      },
      ...(flags && { flags })
    }
  ];
};

const horizontalNav = (model: K8sGroupVersionKind, tabRef: string, flags?: Flags): EncodedExtension => ({
  type: 'console.tab/horizontalNav',
  properties: {
    model: model,
    page: {
      name: getConsoleTitle('Service Mesh'),
      href: OSSM_CONSOLE
    },
    component: { $codeRef: tabRef }
  },
  ...(flags && { flags })
});

const kialiRequired: Flags = { required: [KIALI_REACHABLE] };

const extensions: EncodedExtension[] = [
  kialiFlag,
  reduxReducer,
  consoleSection,

  // Kiali-dependent pages (only shown when Kiali backend is reachable)
  ...consoleRoute('overview', 'Overview', Page.OVERVIEW, [`/${OSSM_CONSOLE}/overview`], kialiRequired),
  ...consoleRoute('graph', 'Traffic Graph', Page.GRAPH, [
    `/${OSSM_CONSOLE}/graph`,
    `/${OSSM_CONSOLE}/graph/ns/:namespace/aggregates/:aggregate/:aggregateValue`,
    `/${OSSM_CONSOLE}/graph/ns/:namespace/applications/:app/versions/:version`,
    `/${OSSM_CONSOLE}/graph/ns/:namespace/applications/:app`,
    `/${OSSM_CONSOLE}/graph/ns/:namespace/services/:service`,
    `/${OSSM_CONSOLE}/graph/ns/:namespace/workloads/:workload`
  ], kialiRequired),
  ...consoleRoute('mesh', 'Mesh', Page.MESH, [`/${OSSM_CONSOLE}/mesh`], kialiRequired),
  {
    type: 'console.navigation/separator',
    properties: {
      id: `${OSSM_CONSOLE}_separator`,
      perspective: ADMIN,
      section: OSSM_CONSOLE
    },
    flags: kialiRequired
  },
  ...consoleRoute('namespaces', 'Namespaces', Page.NAMESPACES, [`/${OSSM_CONSOLE}/namespaces`], kialiRequired),
  ...consoleRoute('applications', 'Applications', Page.APPLICATIONS, [`/${OSSM_CONSOLE}/applications`], kialiRequired),
  {
    type: 'console.page/route',
    properties: {
      exact: true,
      path: `/${OSSM_CONSOLE}/applications/:namespace/:app`,
      component: { $codeRef: Page.APPLICATION_DETAIL }
    },
    flags: kialiRequired
  },
  ...consoleRoute('services', 'Services', Page.SERVICES, [`/${OSSM_CONSOLE}/services`], kialiRequired),
  {
    type: 'console.page/route',
    properties: {
      exact: true,
      path: `/${OSSM_CONSOLE}/services/:namespace/:service`,
      component: { $codeRef: Page.SERVICE_DETAIL }
    },
    flags: kialiRequired
  },
  ...consoleRoute('workloads', 'Workloads', Page.WORKLOADS, [`/${OSSM_CONSOLE}/workloads`], kialiRequired),
  ...consoleRoute('istio', 'Istio Config', Page.ISTIO, [`/${OSSM_CONSOLE}/istio`], kialiRequired),
  {
    type: 'console.page/route',
    properties: {
      exact: true,
      path: `/${OSSM_CONSOLE}/istio/new/:objectGroup/:objectVersion/:objectKind`,
      component: { $codeRef: Page.ISTIO_NEW }
    },
    flags: kialiRequired
  },

  // Always-visible pages (no Kiali dependency)
  ...consoleRoute('istios', 'Istios', Page.ISTIOS, [`/${OSSM_CONSOLE}/istios`]),
  ...consoleRoute('kialis', 'Kialis', Page.KIALIS, [`/${OSSM_CONSOLE}/kialis`]),

  // Kiali-dependent horizontal nav tabs
  horizontalNav(K8sResource.Project, Tab.NAMESPACE, kialiRequired),
  horizontalNav(K8sResource.Namespace, Tab.NAMESPACE, kialiRequired),
  horizontalNav(K8sResource.Pod, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.Deployment, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.DeploymentConfig, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.ReplicaSet, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.StatefulSet, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.DaemonSet, Tab.WORKLOAD, kialiRequired),
  horizontalNav(K8sResource.Service, Tab.SERVICE, kialiRequired),

  // Kiali-dependent Istio horizontal nav tabs
  ...istioResources.map(istioResource => ({
    type: 'console.tab/horizontalNav',
    properties: {
      model: istioResource,
      page: {
        name: getConsoleTitle('Service Mesh'),
        href: OSSM_CONSOLE
      },
      component: { $codeRef: Tab.ISTIO }
    },
    flags: kialiRequired
  }))
];

export default extensions;
