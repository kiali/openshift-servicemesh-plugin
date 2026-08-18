import type { FC } from 'react';
import { Label } from '@patternfly/react-core';
import type { K8sCondition } from '../types/common';
import { deriveStatus } from '../utils/statusUtils';
import { useKialiTranslation } from 'utils/I18nUtils';

interface LiteStatusProps {
  conditionType?: string;
  conditions?: K8sCondition[];
  isCompact?: boolean;
}

export const LiteStatus: FC<LiteStatusProps> = ({ conditions, conditionType, isCompact }) => {
  const { t } = useKialiTranslation();
  const { label, color } = deriveStatus(conditions, conditionType);
  return (
    <Label color={color} isCompact={isCompact}>
      {t(label)}
    </Label>
  );
};
