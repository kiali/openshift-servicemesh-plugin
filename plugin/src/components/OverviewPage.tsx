import * as React from 'react';
import userProps, {getKialiUrl, initKialiListeners, kioskUrl} from '../kialiIntegration';

const OverviewPage = () => {
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

    const iFrameUrl = kialiUrl.baseUrl + '/console/overview/?' + kioskUrl() + '&' + kialiUrl.token + '&duration=' + userProps.duration + '&refreshtime' + userProps.refresh;
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

export default OverviewPage;