import * as React from 'react';
import { useLocation } from 'react-router-dom-v5-compat';
import { setRouterBasename, useInitKialiListeners } from '../utils/KialiIntegration';
import { KialiContainer } from 'openshift/components/KialiContainer';
import { MeshPage } from 'pages/Mesh/MeshPage';
import { paddingContainer } from 'openshift/styles/GlobalStyle';

const MeshPageOSSMC: React.FC<void> = () => {
  useInitKialiListeners();

  const { pathname } = useLocation();

  setRouterBasename(pathname);

  return (
    <KialiContainer>
      <div className={paddingContainer}>
        <MeshPage></MeshPage>
      </div>
    </KialiContainer>
  );
};

export default MeshPageOSSMC;
