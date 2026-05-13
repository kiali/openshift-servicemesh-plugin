import * as React from 'react';
import { useParams, useLocation, Link } from 'react-router-dom-v5-compat';
import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core';

import { KialiContainer } from 'openshift/components/KialiContainer';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { kialiStyle } from 'styles/StyleUtils';
import { ServiceId } from 'types/ServiceInfo';
import { useKialiTranslation } from 'utils/I18nUtils';

import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

const headerStyle = kialiStyle({
  paddingBottom: '1.5rem'
});

const ServiceDetailsPageOSSMC: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { namespace, service } = useParams<ServiceId>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Service detail error')} message={t('Service is not defined correctly')}></ErrorPage>
  );

  if (namespace && service) {
    return (
      <KialiContainer>
        <div className={headerStyle}>
          <Breadcrumb>
            <BreadcrumbItem>
              <Link to="/ossmconsole/services">{t('Services')}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <Link to={`/ossmconsole/services?namespaces=${namespace}`}>
                {t('Namespace: {{namespace}}', { namespace })}
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem isActive>{service}</BreadcrumbItem>
          </Breadcrumb>
        </div>
        <ServiceDetailsPage serviceId={{ namespace, service }} />
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default ServiceDetailsPageOSSMC;
