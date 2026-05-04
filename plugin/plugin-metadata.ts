import { ConsolePluginBuildMetadata } from '@openshift-console/dynamic-plugin-sdk-webpack';

const metadata: ConsolePluginBuildMetadata = {
  name: 'ossmconsole',
  version: '2.26.0',
  displayName: 'OpenShift Service Mesh Console',
  description: 'Provides Service Mesh/Istio Observability',
  exposedModules: {
    AppDetailsPage: './openshift/pages/AppDetailsPage',
    AppListPage: './openshift/pages/AppListPage',
    GraphPage: './openshift/pages/GraphPage',
    IstioConfigListPage: './openshift/pages/IstioConfigListPage',
    IstioConfigNewPage: './openshift/pages/IstioConfigNewPage',
    IstioMeshTab: './openshift/pages/MeshTab/IstioMesh',
    MeshPage: './openshift/pages/MeshPage',
    NamespacesPage: './openshift/pages/NamespacesPage',
    OverviewPage: './openshift/pages/OverviewPage',
    ProjectMeshTab: './openshift/pages/MeshTab/ProjectMesh',
    ReduxReducer: './openshift/utils/Reducer.ts',
    ServiceMeshTab: './openshift/pages/MeshTab/ServiceMesh',
    WorkloadMeshTab: './openshift/pages/MeshTab/WorkloadMesh'
  },
  dependencies: {
    '@console/pluginAPI': '*'
  }
};

export default metadata;
