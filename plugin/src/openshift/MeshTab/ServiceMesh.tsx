import * as React from 'react';
import userProps, { getKialiUrl, initKialiListeners, kioskUrl } from '../../kialiIntegration';

type ServiceMeshProps = {
  namespace: string;
  idObject: string;
};

export const ServiceMesh = (props: ServiceMeshProps) => {
  const [kialiUrl, setKialiUrl] = React.useState({
    baseUrl: '',
    token: ''
  });

  initKialiListeners();

  React.useEffect(() => {
    getKialiUrl()
      .then(ku => setKialiUrl(ku))
      .catch(e => console.error(e));
  }, []);

  const iFrameUrl =
    kialiUrl.baseUrl +
    '/console/namespaces/' +
    props.namespace +
    '/services/' +
    props.idObject +
    '?' +
    kioskUrl() +
    '&' +
    kialiUrl.token +
    '&duration=' +
    userProps.duration +
    '&timeRange=' +
    userProps.timeRange;
  return (
    <iframe
      title="serviceMesh"
      src={iFrameUrl}
      style={{ overflow: 'hidden', height: '100%', width: '100%' }}
      height="100%"
      width="100%"
    />
  );
};
