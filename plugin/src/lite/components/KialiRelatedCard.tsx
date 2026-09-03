import type { FC } from 'react';
import { ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm
} from '@patternfly/react-core';
import { routeGVK, type LiteKialiResource } from '../types/kiali';
import { getKialiServiceTarget } from '../utils/kialiServiceTarget';
import { getKialiStandaloneUrl } from '../utils/kialiObserveLinks';
import { useKialiTranslation } from 'utils/I18nUtils';

interface KialiRelatedCardProps {
  resource: LiteKialiResource;
  routeHostMap: Map<string, string>;
}

export const KialiRelatedCard: FC<KialiRelatedCardProps> = ({ resource, routeHostMap }) => {
  const { t } = useKialiTranslation();
  const { name, namespace } = getKialiServiceTarget(resource);
  const serviceAccountName = `${name}-service-account`;
  const standaloneUrl = getKialiStandaloneUrl(resource, routeHostMap);
  const hasRoute = !!standaloneUrl && !resource.spec?.server?.web_fqdn?.trim();

  if (!namespace || !name) {
    return null;
  }

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Related')}</strong>
      </CardTitle>
      <CardBody>
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Deployment')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="Deployment" name={name} namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Service')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="Service" name={name} namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          {hasRoute && (
            <DescriptionListGroup>
              <DescriptionListTerm>
                <strong>{t('Route')}</strong>
              </DescriptionListTerm>
              <DescriptionListDescription>
                <ResourceLink groupVersionKind={routeGVK} name={name} namespace={namespace} />
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Service Account')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="ServiceAccount" name={serviceAccountName} namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('ConfigMap')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="ConfigMap" name={name} namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </CardBody>
    </Card>
  );
};
