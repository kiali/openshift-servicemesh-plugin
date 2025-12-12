import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { MeshPage } from 'pages/Mesh/MeshPage';

const MeshPageOSSMC: React.FC<void> = () => {
  const { pathname } = useLocation();

  setRouterBasename(pathname);

  useInitKialiListeners();

  return (
    <KialiContainer>
      <MeshPage></MeshPage>
    </KialiContainer>
  );
};

export default MeshPageOSSMC;
