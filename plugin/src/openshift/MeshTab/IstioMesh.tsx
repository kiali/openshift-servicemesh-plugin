import { store, persistor, PersistGate, IstioConfigId } from '@kiali/types';
import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
// import { PersistGate } from 'redux-persist/integration/react';
import IstioConfigDetailsPage from '../../pages/IstioConfigDetails/IstioConfigDetailsPage';
import KialiControllerContainer from '../KialiController';

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
  const history = useHistory();
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
      <PersistGate loading={null} persistor={persistor}>
        <KialiControllerContainer>
          <IstioConfigDetailsPage istioConfigId={istioConfigId}></IstioConfigDetailsPage>
        </KialiControllerContainer>
      </PersistGate>
    </Provider>
  );
};

export default IstioConfigMeshTab;
