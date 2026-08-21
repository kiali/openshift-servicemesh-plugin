import type { FC } from 'react';
import { CheckCircleIcon } from '@patternfly/react-icons';
import { Tooltip } from '@patternfly/react-core';
import { useKialiTranslation } from 'utils/I18nUtils';

interface ConsoleConnectionIconProps {
  active: boolean;
  statusUnknown?: boolean;
}

export const ConsoleConnectionIcon: FC<ConsoleConnectionIconProps> = ({ active, statusUnknown }) => {
  const { t } = useKialiTranslation();

  if (statusUnknown) {
    return (
      <Tooltip
        content={t(
          'Unable to determine Console integration status: insufficient permissions to view OSSMConsole resources.'
        )}
      >
        <span>-</span>
      </Tooltip>
    );
  }

  if (active) {
    return (
      <Tooltip content={t('This Kiali instance is configured as the backend for the Service Mesh Console plugin.')}>
        <CheckCircleIcon
          aria-label={t('Connected to Console')}
          color="var(--pf-t--global--icon--color--status--success--default)"
        />
      </Tooltip>
    );
  }

  return <span>-</span>;
};
