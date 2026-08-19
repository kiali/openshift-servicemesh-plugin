import React from 'react';
import type { FC } from 'react';
import { EmptyState, EmptyStateBody, EmptyStateVariant } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { useKialiTranslation } from 'utils/I18nUtils';

export const OSSM_OPERATORHUB_HREF = '/catalog/ns/openshift-operators?keyword=OpenShift+Service+Mesh';

/** Shown when istios.sailoperator.io is not registered (OSSM Operator not installed). */
export const OssmOperatorMissingEmptyState: FC = () => {
  const { t } = useKialiTranslation();

  return (
    <EmptyState
      headingLevel="h2"
      icon={SearchIcon}
      titleText={t('OSSM Operator is not installed')}
      variant={EmptyStateVariant.lg}
    >
      <EmptyStateBody>
        {t('The Istio custom resource definition was not found on this cluster. Install the OSSM Operator from the')}{' '}
        <a href={OSSM_OPERATORHUB_HREF}>{t('OperatorHub')}</a> {t('to manage Istio control planes.')}
      </EmptyStateBody>
    </EmptyState>
  );
};
