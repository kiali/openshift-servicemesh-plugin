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
import { resolveIstiodDeploymentName } from '../utils/relatedResourceUtils';
import { useKialiTranslation } from 'utils/I18nUtils';

interface IstioRelatedCardProps {
  activeRevisionName: string | undefined;
  controlPlaneNamespace: string | undefined;
}

export const IstioRelatedCard: FC<IstioRelatedCardProps> = ({ activeRevisionName, controlPlaneNamespace }) => {
  const { t } = useKialiTranslation();
  const namespace = controlPlaneNamespace?.trim();

  if (!namespace) {
    return null;
  }

  const istiodName = resolveIstiodDeploymentName(activeRevisionName);

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Related')}</strong>
      </CardTitle>
      <CardBody>
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Control Plane Namespace')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="Namespace" name={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('istiod Deployment')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink kind="Deployment" name={istiodName} namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <strong>{t('Control Plane Pods')}</strong>
            </DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink displayName={t('Pods')} kind="Pod" namespace={namespace} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </CardBody>
    </Card>
  );
};
