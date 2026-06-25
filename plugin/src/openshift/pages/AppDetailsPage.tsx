import * as React from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom-v5-compat';
import { Breadcrumb, BreadcrumbItem, Title, TitleSizes } from '@patternfly/react-core';

import { PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { ErrorPage } from 'openshift/components/ErrorPage';
import { AppDetailsPage } from 'pages/AppDetails/AppDetailsPage';
import { detailTitleMainStyle, detailPageTitleStyle } from 'styles/FlexStyles';
import type { AppId } from 'types/App';
import { useKialiTranslation } from 'utils/I18nUtils';

import { detailHeaderStyle, detailTitleRowStyle } from '../styles/GlobalStyle';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';

const AppDetailsPageOSSMC: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { pathname } = useLocation();
  const { namespace, app } = useParams<AppId>();
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('clusterName') || undefined;

  setRouterBasename(pathname);

  useInitKialiListeners();

  const errorPage = (
    <ErrorPage title={t('Application detail error')} message={t('Application is not defined correctly')}></ErrorPage>
  );

  if (namespace && app) {
    return (
      <KialiContainer>
        <div className={detailHeaderStyle}>
          <Breadcrumb>
            <BreadcrumbItem>
              <Link to="/ossmconsole/applications">{t('Applications')}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <Link to={`/ossmconsole/applications?namespaces=${namespace}`}>
                {t('Namespace: {{namespace}}', { namespace })}
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem isActive>{app}</BreadcrumbItem>
          </Breadcrumb>
          <div className={detailTitleRowStyle}>
            <PFBadge badge={PFBadges.App} size="global" />
            <div className={detailTitleMainStyle}>
              <Title headingLevel="h1" size={TitleSizes.xl} className={detailPageTitleStyle}>
                {app}
              </Title>
            </div>
          </div>
        </div>
        <AppDetailsPage appId={{ namespace, app, cluster }} />
      </KialiContainer>
    );
  } else {
    return errorPage;
  }
};

export default AppDetailsPageOSSMC;
