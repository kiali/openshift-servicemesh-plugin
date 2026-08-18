import type { FC } from 'react';
import { Label } from '@patternfly/react-core';
import type { K8sCondition } from '../types/common';
import { useKialiTranslation } from 'utils/I18nUtils';
import { deriveStatus } from '../utils/statusUtils';

interface MeshStatusProps {
  conditionType?: string;
  conditions?: K8sCondition[];
  isCompact?: boolean;
}

/** Renders a colored PatternFly Label reflecting the status of a K8s condition (default: "Ready"). */
export const MeshStatus: FC<MeshStatusProps> = ({ conditions, conditionType, isCompact }) => {
  const { t } = useKialiTranslation();
  const { label, color } = deriveStatus(conditions, conditionType);
  return (
    <Label color={color} isCompact={isCompact}>
      {t(label)}
    </Label>
  );
};
