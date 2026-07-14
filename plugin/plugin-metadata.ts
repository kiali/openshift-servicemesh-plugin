import { ConsolePluginBuildMetadata } from '@openshift-console/dynamic-plugin-sdk-webpack';
import { fleetMeshModules } from './src/fleet-mesh/fleet-mesh-modules';

const metadata: ConsolePluginBuildMetadata = {
  name: 'ossmconsole',
  version: '2.30.0',
  displayName: 'OpenShift Service Mesh Console',
  description: 'Provides Service Mesh/Istio Observability',
  exposedModules: {
    AppDetailsPage: './openshift/pages/AppDetailsPage',
    AppListPage: './openshift/pages/AppListPage',
    GraphPage: './openshift/pages/GraphPage',
    IstioConfigListPage: './openshift/pages/IstioConfigListPage',
    IstioConfigNewPage: './openshift/pages/IstioConfigNewPage',
    IstioDetailsTab: './openshift/pages/ServiceMeshTabs/IstioDetailsTab',
    kialiAvailableFlag: './openshift/flags/kialiAvailableFlag',
    MeshPage: './openshift/pages/MeshPage',
    NamespaceDetailsTab: './openshift/pages/ServiceMeshTabs/NamespaceDetailsTab',
    NamespacesPage: './openshift/pages/NamespacesPage',
    OverviewPage: './openshift/pages/OverviewPage',
    ReduxReducer: './kiali/reducers/index.ts',
    ServiceDetailsPage: './openshift/pages/ServiceDetailsPage',
    ServiceDetailsTab: './openshift/pages/ServiceMeshTabs/ServiceDetailsTab',
    ServiceListPage: './openshift/pages/ServiceListPage',
    WorkloadDetailsTab: './openshift/pages/ServiceMeshTabs/WorkloadDetailsTab',
    WorkloadListPage: './openshift/pages/WorkloadListPage',
    ...fleetMeshModules
  },
  dependencies: {
    '@console/pluginAPI': '*'
  }
};

export default metadata;
