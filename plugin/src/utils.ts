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
            if (kialiAction.startsWith('/namespaces')) {
                const webParamsIndex = kialiAction.indexOf('?');
                const webParams = webParamsIndex > -1 ? kialiAction.substring(webParamsIndex) : '';
                console.log('TODELETE webParams: '+ webParams);

                const namespacesLength = '/namespaces/'.length;
                const namespace = kialiAction.substring(namespacesLength,  kialiAction.indexOf('/', namespacesLength + 1));
                console.log('TODELETE namespace: '+ namespace);

                const detail = kialiAction.substring(namespacesLength + namespace.length, webParamsIndex > -1 ? webParamsIndex : kialiAction.length);
                console.log('TODELETE detail: '+ detail);

                let detailUrl = '';
                if (detail.startsWith('/applications')) {
                    // OpenShift Console doesn't have an "application" concept
                    // As the "app" concept is based on Pod "app" annotations, a start could be to show those pods
                    // TBD a better link i.e. the "App" concept used for Developer preview
                    const application = detail.substring('/applications/'.length);
                    detailUrl = '/k8s/ns/' + namespace + '/pods?labels=app%3D' + application;
                }
                if (detail.startsWith('/workloads')) {
                    // OpenShift Console doesn't have a "generic" workloads page
                    // 99% of the cases there is a 1-to-1 mapping between Workload -> Deployment
                    // YES, we have some old DeploymentConfig workloads there, but that can be addressed later
                    detailUrl = '/k8s/ns/' + namespace + '/deployments' + detail.substring('/workloads'.length) + '/servicemesh';
                    detailUrl += webParamsIndex > -1 ? webParams : '';
                }
                if (detail.startsWith('/services')) {
                    // OpenShift Console has a "services" list page
                    detailUrl = '/k8s/ns/' + namespace + detail + '/servicemesh';
                    detailUrl += webParamsIndex > -1 ? webParams : '';
                }

                console.log('TODELETE detailUrl: ' + detailUrl);
                history.push(detailUrl);
            }
        };
        window.addEventListener('message', kialiListener);
    }
}



