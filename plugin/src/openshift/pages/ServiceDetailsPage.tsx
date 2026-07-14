import * as React from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router';
import { Breadcrumb, BreadcrumbItem, Title, TitleSizes } from '@patternfly/react-core';

import { PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { detailTitleMainStyle, detailPageTitleStyle } from 'styles/FlexStyles';
import type { ServiceId } from 'types/ServiceInfo';
import { useKialiTranslation } from 'utils/I18nUtils';

import { detailHeaderStyle, detailTitleRowStyle } from '../styles/GlobalStyle';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

const ServiceDetailsPageOSSMC: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { namespace, service } = useParams<ServiceId>();
  const [searchParams] = useSearchParams();
  const isExternal = searchParams.get('type') === 'External';

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Service detail error')} message={t('Service is not defined correctly')}></ErrorPage>
  );

  if (namespace && service) {
    return (
      <KialiContainer>
        <div className={detailHeaderStyle}>
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
          <div className={detailTitleRowStyle}>
            <PFBadge badge={isExternal ? PFBadges.ExternalService : PFBadges.Service} size="global" />
            <div className={detailTitleMainStyle}>
              <Title headingLevel="h1" size={TitleSizes.xl} className={detailPageTitleStyle}>
                {service}
              </Title>
            </div>
          </div>
        </div>
        <ServiceDetailsPage serviceId={{ namespace, service }} />
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default ServiceDetailsPageOSSMC;
