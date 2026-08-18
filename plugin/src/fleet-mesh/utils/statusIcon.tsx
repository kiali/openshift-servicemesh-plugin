import type { ReactNode } from 'react';
import { Label } from '@patternfly/react-core';

/** Returns a compact colored PatternFly Label for a K8s condition status string. */
export function statusIcon(status: string): ReactNode {
  const color = status === 'True' ? 'green' : status === 'Unknown' ? 'grey' : 'red';
  return (
    <Label color={color} isCompact>
      {status}
    </Label>
  );
}
