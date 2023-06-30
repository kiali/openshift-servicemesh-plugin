import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
import { store } from 'store/ConfigStore';
import { IstioConfigId } from 'types/IstioConfigDetails';
// import IstioConfigDetailsPage from '../../pages/IstioConfigDetails/IstioConfigDetailsPage';
import IstioConfigDetailsPage from 'pages/IstioConfigDetails/IstioConfigDetailsPage';
import { KialiController } from '../../components/KialiController';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';

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

const IstioConfigMeshTab = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[0];
  const objectType = configTypes[items[1].substring(items[1].lastIndexOf('~') + 1)].toLowerCase();
  const object = items[2];

  const istioConfigId: IstioConfigId = {
    namespace,
    objectType,
    object
  };

  return (
    <Provider store={store}>
      <KialiController>
        <IstioConfigDetailsPage istioConfigId={istioConfigId}></IstioConfigDetailsPage>
      </KialiController>
    </Provider>
  );
};

export default IstioConfigMeshTab;
