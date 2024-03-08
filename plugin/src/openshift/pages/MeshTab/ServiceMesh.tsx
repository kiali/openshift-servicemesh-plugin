import * as React from 'react';
import { useHistory } from 'react-router';
import { ServiceId } from 'types/ServiceId';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { configure } from 'mobx';

// Configure MobX to isolate different versions (from OCP 4.15 and OSSMC 1.73)
configure({ isolateGlobalState: true });

const ServiceMeshTab: React.FC<void> = () => {
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
    <KialiContainer>
      <ServiceDetailsPage serviceId={serviceId}></ServiceDetailsPage>
    </KialiContainer>
  );
};

export default ServiceMeshTab;
