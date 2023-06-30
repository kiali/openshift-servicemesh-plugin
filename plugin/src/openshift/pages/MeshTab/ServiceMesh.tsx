import * as React from 'react';
import { Provider } from 'react-redux';
import { useHistory } from 'react-router';
import { store } from 'store/ConfigStore';
import ServiceId from 'types/ServiceId';
import ServiceDetailsPage from 'pages/ServiceDetails/ServiceDetailsPage';
import { KialiController } from '../../components/KialiController';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';

const ServiceMeshTab = () => {
  useInitKialiListeners();

  const history = useHistory();
  setHistory(history.location.pathname);

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
      <KialiController>
        <ServiceDetailsPage serviceId={serviceId}></ServiceDetailsPage>
      </KialiController>
    </Provider>
  );
};

export default ServiceMeshTab;
