import * as React from 'react';
import userProps, {getKialiUrl, initKialiListeners, kioskUrl} from '../../utils/KialiIntegration';

type ProjectMeshProps = {
    idObject: string;
}

export const ProjectMesh = (props: ProjectMeshProps) => {
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

    const iFrameUrl = kialiUrl.baseUrl +  '/console/graph/namespaces?namespaces=' + props.idObject + '&' + kioskUrl() + '&' + kialiUrl.token
    + '&duration=' + userProps.duration + '&timeRange=' + userProps.timeRange;
    return (
        <iframe
                src={iFrameUrl}
                style={{overflow: 'hidden', height: '100%', width: '100%' }}
                height="100%"
                width="100%"
            />
    )

}