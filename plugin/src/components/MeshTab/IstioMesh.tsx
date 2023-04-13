import * as React from 'react';
import userProps, {getKialiUrl, initKialiListeners, kioskUrl} from '../../kialiIntegration';

type IstioMeshProps = {
    configType: string;
    namespace: string;
    idObject: string;
}

export const IstioMesh = (props: IstioMeshProps) => {
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

    const iFrameUrl = kialiUrl.baseUrl + '/console/namespaces/' + props.namespace + '/istio/' + props.configType + '/' + props.idObject + '?' + kioskUrl() + '&'
    + kialiUrl.token + '&duration=' + userProps.duration + '&timeRange=' + userProps.timeRange;
    return (
        <iframe
                src={iFrameUrl}
                style={{overflow: 'hidden', height: '100%', width: '100%' }}
                height="100%"
                width="100%"
            />
    )

}