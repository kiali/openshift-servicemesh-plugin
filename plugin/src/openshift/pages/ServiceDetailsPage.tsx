import * as React from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom-v5-compat';
import { Breadcrumb, BreadcrumbItem, Title, TitleSizes } from '@patternfly/react-core';

import { KialiContainer } from 'openshift/components/KialiContainer';
import { PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { ServiceDetailsPage } from 'pages/ServiceDetails/ServiceDetailsPage';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { kialiStyle } from 'styles/StyleUtils';
import { ServiceId } from 'types/ServiceInfo';
import { useKialiTranslation } from 'utils/I18nUtils';
import { detailTitleMainStyle, detailPageTitleStyle } from 'styles/FlexStyles';
import { PFSpacer } from 'styles/PfSpacer';

import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

const headerStyle = kialiStyle({
  paddingBottom: '0.5rem'
});

const detailTitleRowStyle = kialiStyle({
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'nowrap',
  gap: PFSpacer.sm,
  marginTop: '1rem',
  minWidth: 0,
  width: '100%'
});

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
