import { useHistory } from "react-router";

export const properties = {
    // This API is hardcoded but:
    // 'servicemesh' is the name of the plugin, it can be considered "fixed" in the project
    // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
    pluginConfig: '/api/plugins/servicemesh/plugin-config.json',
}

// This Config type should be mapped with the 'plugin-config.json' file
export type Config = {
    kialiUrl: string;
}

export const kioskUrl = () => {
    let kiosk = 'kiosk=' +  window.location.protocol + '//' + window.location.host;
    // We assume that the url web params are in a format that can be added to a Kiali URL passed to the iframe
    if (window.location.search.indexOf('?') > -1) {
        kiosk = kiosk + '&' + window.location.search.substring(1);
    }
    return kiosk;
}

let kialiListener = undefined;

export const initKialiListeners = () => {
    if (!kialiListener) {
        const history = useHistory();

        kialiListener = (ev) => {
            const kialiAction= ev.data;
            if (typeof kialiAction !== "string") {
                return;
            }
            console.log('ServiceMesh Listener: ' + kialiAction);
            // const osConsole = window.location.protocol + '//' + window.location.host;
            // Transform Kiali domain messages into Plugin info that helps to navigate
            if (kialiAction.startsWith('/graph/namespaces')) {
                const servicemeshUrl = kialiAction.replace('graph/namespaces', 'servicemeshgraph');
                history.push(servicemeshUrl);
            }
            if (kialiAction.startsWith('/istio')) {
                const istioConfigUrl = kialiAction.replace('istio', 'istioconfig');
                history.push(istioConfigUrl);
            }
        };
        window.addEventListener('message', kialiListener);
    }
}



