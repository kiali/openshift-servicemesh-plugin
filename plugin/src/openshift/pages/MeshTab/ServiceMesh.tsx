import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom-v5-compat';
import { ServiceId } from 'types/ServiceInfo';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { setRouterBasename, useInitKialiListeners } from '../../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ResourceURLPathProps } from 'openshift/utils/IstioResources';
import { useKialiTranslation } from 'utils/I18nUtils';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { meshTabPageStyle } from 'openshift/styles/GlobalStyle';

const ServiceMeshTab: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { ns, name } = useParams<ResourceURLPathProps>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Service detail error')} message={t('Service is not defined correctly')}></ErrorPage>
  );

  if (ns && name) {
    const serviceId: ServiceId = {
      namespace: ns,
      service: name
    };

    return (
      <KialiContainer className={meshTabPageStyle}>
        <ServiceDetailsPage serviceId={serviceId}></ServiceDetailsPage>
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default ServiceMeshTab;
