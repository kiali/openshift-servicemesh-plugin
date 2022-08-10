import * as React from 'react';
import {initKialiListeners, kioskUrl, properties} from "../utils";
import { consoleFetch } from "@openshift-console/dynamic-plugin-sdk";

const IstioConfigList = () => {
    const [kialiUrl, setKialiUrl] = React.useState({
        baseUrl: '',
        token: '',
    });

    initKialiListeners();

    React.useEffect(() => {
        consoleFetch(properties.pluginConfig)
            .then((response) => {
                const headerOauthToken = response.headers.get('oauth_token');
                const kialiToken = 'oauth_token=';
                response.json().then((payload) => {
                    setKialiUrl({
                        baseUrl: payload.kialiUrl,
                        token: kialiToken  + (
                            headerOauthToken && headerOauthToken.startsWith('Bearer ') ?
                                headerOauthToken.substring('Bearer '.length) : ''
                        ),
                    });
                });
            })
            .catch((e) => console.error(e));
    }, []);

    const iFrameUrl = kialiUrl.baseUrl + '/console/istio?' + kioskUrl() + '&' + kialiUrl.token;
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

export default IstioConfigList;