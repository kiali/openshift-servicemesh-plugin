import { ConsolePluginBuildMetadata } from '@openshift-console/dynamic-plugin-sdk-webpack';

const metadata: ConsolePluginBuildMetadata = {
  name: 'ossmconsole',
  version: '2.27.0',
  displayName: 'OpenShift Service Mesh Console',
  description: 'Provides Service Mesh/Istio Observability',
  exposedModules: {
    AppDetailsPage: './openshift/pages/AppDetailsPage',
    AppListPage: './openshift/pages/AppListPage',
    GraphPage: './openshift/pages/GraphPage',
    IstioConfigListPage: './openshift/pages/IstioConfigListPage',
    IstioConfigNewPage: './openshift/pages/IstioConfigNewPage',
    IstioDetailsTab: './openshift/pages/ServiceMeshTabs/IstioDetailsTab',
    MeshPage: './openshift/pages/MeshPage',
    NamespacesPage: './openshift/pages/NamespacesPage',
    OverviewPage: './openshift/pages/OverviewPage',
    NamespaceDetailsTab: './openshift/pages/ServiceMeshTabs/NamespaceDetailsTab',
    ReduxReducer: './openshift/utils/Reducer.ts',
    ServiceDetailsTab: './openshift/pages/ServiceMeshTabs/ServiceDetailsTab',
    WorkloadDetailsTab: './openshift/pages/ServiceMeshTabs/WorkloadDetailsTab'
  },
  dependencies: {
    '@console/pluginAPI': '*'
  }
};

export default metadata;
