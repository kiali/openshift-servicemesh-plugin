import * as React from 'react';
import { ErrorState } from '@patternfly/react-component-groups';
import { ActionList, ActionListGroup, ActionListItem, Button, ButtonVariant } from '@patternfly/react-core';
import { useKialiTranslation } from 'utils/I18nUtils';

export interface OSSMCError {
  message?: string;
  title?: string;
}

/**
 * ErrorPage component following the OpenShift Console patterns
 * Based on ErrorBoundaryFallbackPage.tsx from openshift/console repository
 * Uses the exact same ErrorState component and pattern as OpenShift Console
 */
export const ErrorPage: React.FC<OSSMCError> = ({ title, message }) => {
  const { t } = useKialiTranslation();

  // Use i18n with fallback to provided props or default values
  const errorTitle = title || t('Something wrong happened');
  const errorMessage = message || t('An error occurred. Please try again.');

  return (
    <ErrorState
      titleText={errorTitle}
      defaultBodyText={t('An error occurred. Please try again.')}
      bodyText={errorMessage}
      headingLevel="h1"
      customFooter={
        <ActionList>
          <ActionListGroup>
            <ActionListItem>
              <Button variant={ButtonVariant.primary} onClick={() => window.location.reload()}>
                {t('Reload page')}
              </Button>
            </ActionListItem>
          </ActionListGroup>
        </ActionList>
      }
    />
  );
};
