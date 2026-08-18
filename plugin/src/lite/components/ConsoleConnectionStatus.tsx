import type { FC } from 'react';
import { Label, Tooltip } from '@patternfly/react-core';
import { useKialiTranslation } from 'utils/I18nUtils';

interface ConsoleConnectionStatusProps {
  active: boolean;
  isCompact?: boolean;
  statusUnknown?: boolean;
}

export const ConsoleConnectionStatus: FC<ConsoleConnectionStatusProps> = ({ active, isCompact, statusUnknown }) => {
  const { t } = useKialiTranslation();

  if (statusUnknown) {
    return (
      <Tooltip
        content={t(
          'Unable to determine Console integration status: insufficient permissions to view OSSMConsole resources.'
        )}
      >
        <Label color="grey" isCompact={isCompact}>
          {t('Unknown')}
        </Label>
      </Tooltip>
    );
  }

  if (active) {
    return (
      <Tooltip content={t('This Kiali instance is configured as the backend for the Service Mesh Console plugin.')}>
        <Label color="green" isCompact={isCompact}>
          {t('Active')}
        </Label>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('This Kiali instance is not configured as the backend for the Service Mesh Console plugin.')}>
      <Label color="grey" isCompact={isCompact}>
        {t('Inactive')}
      </Label>
    </Tooltip>
  );
};
