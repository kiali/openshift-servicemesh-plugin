import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { ServiceId } from 'types/ServiceId';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { useInitKialiListeners } from '../../utils/KialiIntegration';
import { setHistory } from 'app/History';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { grayContainer } from 'openshift/styles/GlobalStyle';

const ServiceMeshTab: React.FC<void> = () => {
  useInitKialiListeners();

  const location = useLocation();
  setHistory(location.pathname);

  const { ns, name } = useParams<ResourceURLPathProps>();

  const serviceId: ServiceId = {
    namespace: ns!,
    service: name!
  };

  return (
    <KialiContainer>
      <div className={grayContainer}>
        <ServiceDetailsPage serviceId={serviceId}></ServiceDetailsPage>
      </div>
    </KialiContainer>
  );
};

export default ServiceMeshTab;
