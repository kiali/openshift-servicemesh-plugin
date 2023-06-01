import { store, persistor, PersistGate, ServiceId } from '@kiali/types';
import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
import ServiceDetailsPage from '../../pages/ServiceDetails/ServiceDetailsPage';
import KialiController from '../KialiController';

const ServiceMeshTab = () => {
  const history = useHistory();
  const path = history.location.pathname.substring(8);
  const items = path.split('/');
  const namespace = items[0];
  const service = items[2];

  const serviceId: ServiceId = {
    namespace,
    service
  };

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <KialiController>
          <ServiceDetailsPage serviceId={serviceId}></ServiceDetailsPage>
        </KialiController>
      </PersistGate>
    </Provider>
  );
};

export default ServiceMeshTab;
