import * as React from 'react';
import {properties} from "../properties";
import { consoleFetchJSON } from "@openshift-console/dynamic-plugin-sdk";

const OverviewPage = () => {
    const [kialiBaseUrl, setKialiBaseUrl] = React.useState();

    React.useEffect(() => {
        consoleFetchJSON(properties.pluginConfig)
            .then((response) => {
                setKialiBaseUrl(response.kialiUrl);
            })
            .catch((e) => console.error(e));
    }, []);

    return (
        <>
            <iframe
                src={kialiBaseUrl + '/console/overview/?kiosk=true'}
                style={{overflow: 'hidden', height: '100%', width: '100%' }}
                height="100%"
                width="100%"
            />
        </>
    );
};

export default OverviewPage;