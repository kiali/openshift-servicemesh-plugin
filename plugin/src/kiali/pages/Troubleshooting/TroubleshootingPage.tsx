import * as React from 'react';
import { Button, Spinner } from '@patternfly/react-core';

import type { OpenOLSFn } from './types';

type TroubleshootingPageProps = {
  isLightspeedRunning?: boolean;
  openOLS?: OpenOLSFn;
};

export const TroubleshootingPage: React.FC<TroubleshootingPageProps> = ({ isLightspeedRunning, openOLS }) => {
  if (!isLightspeedRunning) {
    return <div> OLS is not Running </div>;
  }

  if (!openOLS) {
    return <Spinner />;
  }

  return (
    <div>
      <Button onClick={() => openOLS('How do I talk with Kiali?')}>Open OLS with prompt</Button>
    </div>
  );
};
