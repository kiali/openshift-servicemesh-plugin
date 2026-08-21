import type { FC } from 'react';
import { Tooltip } from '@patternfly/react-core';
import { truncateMiddle } from '../utils/truncateMiddle';

interface KialiVersionDisplayProps {
  notSpecifiedLabel: string;
  value: string | undefined;
}

export const KialiVersionDisplay: FC<KialiVersionDisplayProps> = ({ notSpecifiedLabel, value }) => {
  if (!value) {
    return <>{notSpecifiedLabel}</>;
  }
  if (value.length <= 28) {
    return <>{value}</>;
  }
  const truncated = truncateMiddle(value);
  return (
    <Tooltip content={value}>
      <span data-testid="kiali-version-display">{truncated}</span>
    </Tooltip>
  );
};
