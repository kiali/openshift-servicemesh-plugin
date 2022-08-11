import * as React from 'react';
import { getKialiUrl, initKialiListeners, kioskUrl } from '../kialiIntegration';

const GraphPage = () => {
    const [kialiUrl, setKialiUrl] = React.useState({
        baseUrl: '',
        token: '',
    });

    initKialiListeners();

    React.useEffect(() => {
        getKialiUrl()
            .then(ku => setKialiUrl(ku))
            .catch(e => console.error(e));
    }, []);

    const iFrameUrl = kialiUrl.baseUrl + '/console/graph/namespaces/?' + kioskUrl() + '&' + kialiUrl.token;
    return (
        <>
            <iframe
                src={iFrameUrl}
                style={{overflow: 'hidden', height: '100%', width: '100%' }}
                height="100%"
                width="100%"
            />
        </>
    );
};

export default GraphPage;