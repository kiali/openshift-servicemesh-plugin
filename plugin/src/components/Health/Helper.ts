import * as React from 'react';
import { Status } from '@kiali/types';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export const createIcon = (status: Status, size?: Size) => {
  return React.createElement(status.icon, { color: status.color, size: size, className: status.class });
};
