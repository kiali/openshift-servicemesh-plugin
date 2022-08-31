import * as React from 'react';
import { RouteComponentProps } from 'react-router-dom';
import {
  IstioConfigDetails,
  IstioConfigId,
} from '../../types/IstioConfigDetails';
import * as API from '../../k8s/api';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import {
  ObjectReference,
  ObjectValidation,
  ValidationMessage,
} from '../../types/IstioObjects';
import { RenderComponentScroll } from '../../components/Nav/Page';
import './IstioConfigDetailsPage.css';
import { getIstioObject } from '../../utils/IstioConfigUtils';
import { style } from 'typestyle';
import {
  Drawer,
  DrawerContent,
  DrawerHead,
  DrawerPanelContent,
} from '@patternfly/react-core';
import IstioConfigOverview from './IstioConfigOverview';
import {getKialiProxy} from "../../kialiIntegration";

// Enables the search box for the ACEeditor
require('ace-builds/src-noconflict/ext-searchbox');

const rightToolbarStyle = style({
  zIndex: 500
});

const editorDrawer = style({
  margin: '0'
});

interface IstioConfigDetailsState {
  istioObjectDetails?: IstioConfigDetails;
  istioValidations?: ObjectValidation;
}

class IstioConfigDetailsPage extends React.Component<RouteComponentProps<IstioConfigId>, IstioConfigDetailsState> {

  constructor(props: RouteComponentProps<IstioConfigId>) {
    super(props);
  }

  fetchIstioObjectDetails = () => {
    this.fetchIstioObjectDetailsFromProps(this.props.match.params);
  };

  fetchIstioObjectDetailsFromProps = (props: IstioConfigId) => {
    const kialiProxy = getKialiProxy();
    API.getIstioConfig(kialiProxy, props.namespace, props.objectType, props.object)
      .then(resultConfigDetails => {
        this.setState(
          {
            istioObjectDetails: resultConfigDetails.data,
            istioValidations: resultConfigDetails.data.validation,
          },
          () => this.resizeEditor()
        );
      })
      .catch(error => {
      });
  };

  componentDidMount() {
    this.fetchIstioObjectDetails();
  }

  getStatusMessages = (istioConfigDetails?: IstioConfigDetails): ValidationMessage[] => {
    const istioObject = getIstioObject(istioConfigDetails);
    return istioObject && istioObject.status && istioObject.status.validationMessages
      ? istioObject.status.validationMessages
      : ([] as ValidationMessage[]);
  };

  objectReferences = (istioConfigDetails?: IstioConfigDetails): ObjectReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.objectReferences || ([] as ObjectReference[]);
  };

  renderDetails = () => {
    const istioStatusMsgs = this.getStatusMessages(this.state.istioObjectDetails);

    const objectReferences = this.objectReferences(this.state.istioObjectDetails);
    // TODO References
    // const serviceReferences = this.serviceReferences(this.state.istioObjectDetails);
    // const workloadReferences = this.workloadReferences(this.state.istioObjectDetails);


    const panelContent = (
      <DrawerPanelContent>
        <DrawerHead>
          <div>
            <>
              {this.state.istioObjectDetails && (
                <IstioConfigOverview
                  istioObjectDetails={this.state.istioObjectDetails}
                  istioValidations={this.state.istioValidations}
                  statusMessages={istioStatusMsgs}
                  objectReferences={objectReferences}
                />
              )}
            </>
          </div>
        </DrawerHead>
      </DrawerPanelContent>
    );

    return (
      <div className={`object-drawer ${editorDrawer}`}>
        <Drawer isExpanded={true} isInline={true}>
          <DrawerContent panelContent={panelContent}>
          </DrawerContent>
        </Drawer>
      </div>
    );
  };

  render() {
    return (
      <>
        <RenderComponentScroll>{this.renderDetails()}</RenderComponentScroll>
      </>
    );
  }
}

export default IstioConfigDetailsPage;
