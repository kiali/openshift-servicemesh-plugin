import { Label, Tooltip } from '@patternfly/react-core';
import type { FC } from 'react';
import type { OperatorStatus } from '../utils/operatorPresence';
import { useKialiTranslation } from 'utils/I18nUtils';

/** Compact per-cluster label for the OSSM operator install status. */
export const OperatorStatusLabel: FC<{ status: OperatorStatus }> = ({ status }) => {
  const { t } = useKialiTranslation();
  if (status === 'installed') {
    return (
      <Label color="green" isCompact>
        {t('Installed')}
      </Label>
    );
  }
  if (status === 'unknown') {
    return (
      <Label color="grey" isCompact>
        {t('Unknown')}
      </Label>
    );
  }
  return (
    <Tooltip content={t('The control plane cannot come up on this cluster until the OSSM operator is installed.')}>
      <Label color="orange" isCompact>
        {t('Missing')}
      </Label>
    </Tooltip>
  );
};
