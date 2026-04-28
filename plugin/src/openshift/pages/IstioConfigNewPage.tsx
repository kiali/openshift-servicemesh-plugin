import * as React from 'react';
import { useLocation, useParams } from 'react-router-dom-v5-compat';
import { IstioConfigNewPage } from 'pages/IstioConfigNew/IstioConfigNewPage';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';

const IstioConfigNewPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();
  const { objectGroup, objectVersion, objectKind } = useParams<{
    objectGroup: string;
    objectKind: string;
    objectVersion: string;
  }>();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <IstioConfigNewPage objectGVK={{ Group: objectGroup!, Version: objectVersion!, Kind: objectKind! }} />
    </KialiContainer>
  );
};

export default IstioConfigNewPageOSSMC;
