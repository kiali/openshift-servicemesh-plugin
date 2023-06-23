import * as React from 'react';
import { useHistory } from 'react-router';
import { IstioMesh } from './IstioMesh';
import { ProjectMesh } from './ProjectMesh';
import { ServiceMesh } from './ServiceMesh';
import { WorkloadMesh } from './WorkloadMesh';

const kialiTypes = {
  services: 'services',
  pods: 'workloads',
  deployments: 'workloads',
  deploymentconfigs: 'workloads',
  statefulsets: 'workloads'
};

const configTypes = {
  DestinationRule: 'DestinationRules',
  EnvoyFilter: 'EnvoyFilters',
  Gateway: 'Gateways',
  VirtualService: 'VirtualServices',
  ServiceEntry: 'ServiceEntries',
  Sidecar: 'Sidecars',
  WorkloadEntry: 'WorkloadEntries',
  WorkloadGroup: 'WorkloadGroups',
  AuthorizationPolicy: 'AuthorizationPolicies',
  PeerAuthentication: 'PeerAuthentications',
  RequestAuthentication: 'RequestAuthentications'
};

const MeshTab = () => {
  // This parsing logic maps the location of the user in the OpenShift console to populate the iFrame url to
  // the proper target in the Kiali side
  // There is not a 1-to-1 mapping between OpenShift Console entities and Kiali Standalone, so the plugin decides
  // which is the best integration:
  // OpenShift Projects -> Service Mesh tab will point to the Kiali Graph
  // Kiali Application  -> OpenShift Console will point to a list of Pods filtered by "app" label
  // (There is an "application" concept under the OpenShift Developer perspective, but it's not a good fit for the moment)
  // OpenShift Pod      -> Kiali Workload
  //
  // This parsing logic can be improved to better cover corner cases.
  // Current logic can be considered PoC/Experimental but valid for first steps.
  const history = useHistory();
  const path = history.location.pathname.substr(8);
  const items = path.split('/');
  const namespace = items[0];
  const type = kialiTypes[items[1]];
  let id = items[2];

  if (items[1] === 'pods') {
    // This parsing is not good, it's only done in the PoC context, it can take the parent from the Pod labels
    let marks = 0;
    let j = id.length;
    while (j > 0) {
      if (id.charAt(j) === '-') {
        marks++;
      }
      if (marks === 2) {
        break;
      }
      j--;
    }
    if (j > 0) {
      id = id.substr(0, j);
    }
  }

  let component =
    type === 'workloads' ? (
      <WorkloadMesh namespace={namespace} idObject={id} />
    ) : (
      <ServiceMesh namespace={namespace} idObject={id} />
    );

  // Projects is a special case that will forward the graph in the iframe
  if (items[1] === 'projects') {
    component = <ProjectMesh idObject={id} />;
  } else if (!type) {
    const configType = configTypes[items[1].substring(items[1].lastIndexOf('~') + 1)].toLowerCase();
    component = <IstioMesh configType={configType} namespace={namespace} idObject={id} />;
  }

  return component;
};

export default MeshTab;
