import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { IstioConfigId } from 'types/IstioConfigDetails';
import { IstioConfigDetailsPage } from 'pages/IstioConfigDetails/IstioConfigDetailsPage';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';

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

const IstioConfigMeshTab: React.FC<void> = () => {
  useInitKialiListeners();

  const location = useLocation();
  setHistory(location.pathname);

  const { name, ns, plural } = useParams<ResourceURLPathProps>();

  const istioConfigId: IstioConfigId = {
    namespace: ns!,
    objectType: configTypes[plural!.substring(plural!.lastIndexOf('~') + 1)].toLowerCase(),
    object: name!
  };

  return (
    <KialiContainer>
      <IstioConfigDetailsPage istioConfigId={istioConfigId}></IstioConfigDetailsPage>
    </KialiContainer>
  );
};

export default IstioConfigMeshTab;
