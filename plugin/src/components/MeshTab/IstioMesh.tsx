import {
  AceValidations,
  Annotation,
  deleteIstioConfigDetail,
  EditorPreview,
  ErrorMsg,
  getErrorString,
  getIstioConfigDetail,
  getIstioObject,
  HelpMessage,
  IstioActionButtons,
  IstioConfigDetails,
  IstioConfigOverview,
  mergeJsonPatch,
  ObjectReference,
  ObjectValidation,
  parseLine,
  parseYamlValidations,
  PromisesRegistry,
  safeDumpOptions,
  ServiceReference,
  updateIstioConfigDetail,
  ValidationMessage,
  WorkloadReference
} from '@kiali/core-ui';
import { Drawer, DrawerContent, DrawerContentBody, DrawerHead, DrawerPanelContent } from '@patternfly/react-core';
import * as React from 'react';
import { useHistory } from 'react-router';
import * as jsYaml from 'js-yaml';
import { style } from 'typestyle';
import { getKialiConfig, KialiConfig } from '../../kialiIntegration';
import { AxiosError } from 'axios';

const editorStyle = style({
  //   width: 'calc(100% - 30px)',
  marginBottom: '15px',
  border: '1px solid black'
});

const editorDrawer = style({
  //   width: 'calc(100% - 30px)',
  margin: '15px'
});

const configTypes = {
  DestinationRule: 'DestinationRules',
  EnvoyFilter: 'EnvoyFilters',
  Gateway: 'Gateways',
  VirtualService: 'VirtualServices',
  ServiceEntry: 'ServiceEntries',
  Sidecar: 'Sidecars',
  WorkloadEntry: 'WorkloadEntries',
  WorkloadGroup: 'WorkloadGroups',
  AuthorizationPolicy: 'AuthorizationPolicies',
  PeerAuthentication: 'PeerAuthentications',
  RequestAuthentication: 'RequestAuthentications'
};

const IstioConfigMeshTab = () => {
  const history = useHistory();
  const path = history.location.pathname.substr(8);
  const items = path.split('/');
  const namespace = items[0];
  const objectType = configTypes[items[1].substring(items[1].lastIndexOf('~') + 1)].toLowerCase();
  const objectId = items[2];
  // initKialiListeners();

  const [kialiConfig, setKialiConfig] = React.useState<KialiConfig>(undefined);
  const [istioObjectDetails, setIstioObjectDetails] = React.useState<IstioConfigDetails>(undefined);
  const [istioValidations, setIstioValidations] = React.useState<ObjectValidation>(undefined);
  const [originalIstioObjectDetails, setOriginalIstioObjectDetails] = React.useState<IstioConfigDetails>(undefined);
  const [originalIstioValidations, setOriginalIstioValidations] = React.useState<ObjectValidation>(undefined);
  const [isModified, setIsModified] = React.useState<boolean>(false);
  const [isRemoved, setIsRemoved] = React.useState<boolean>(false);
  const [yamlModified, setYamlModified] = React.useState<string>(undefined);
  const [yamlValidations, setYamlValidations] = React.useState<AceValidations>(undefined);
  const [currentTab, setCurrentTab] = React.useState<string>(undefined);
  const [isExpanded, setIsExpanded] = React.useState<boolean>(true);
  const [selectedEditorLine, setSelectedEditorLine] = React.useState<string>(undefined);
  const [error, setError] = React.useState<ErrorMsg>(undefined);
  const [isLoading, setLoading] = React.useState(true);
  const promises = new PromisesRegistry();
  const istioAPIEnabled = kialiConfig?.status?.istioEnvironment?.istioAPIEnabled;

  const getStatusMessages = (istioConfigDetails?: IstioConfigDetails): ValidationMessage[] => {
    const istioObject = getIstioObject(istioConfigDetails);
    return istioObject && istioObject.status && istioObject.status.validationMessages
      ? istioObject.status.validationMessages
      : ([] as ValidationMessage[]);
  };

  // Not all Istio types have an overview card
  const hasOverview = (): boolean => {
    return true;
  };

  const showCards = (refPresent: boolean, istioStatusMsgs: ValidationMessage[]): boolean => {
    return refPresent || hasOverview() || istioStatusMsgs.length > 0;
  };

  const getObjectReferences = (istioConfigDetails?: IstioConfigDetails): ObjectReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.objectReferences || ([] as ObjectReference[]);
  };

  const getServiceReferences = (istioConfigDetails?: IstioConfigDetails): ServiceReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.serviceReferences || ([] as ServiceReference[]);
  };

  const getWorkloadReferences = (istioConfigDetails?: IstioConfigDetails): ServiceReference[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.references?.workloadReferences || ([] as WorkloadReference[]);
  };

  const getHelpMessages = (istioConfigDetails?: IstioConfigDetails): HelpMessage[] => {
    const details: IstioConfigDetails = istioConfigDetails || ({} as IstioConfigDetails);
    return details.help || ([] as HelpMessage[]);
  };

  const injectGalleyError = (error: AxiosError): AceValidations => {
    const msg: string[] = getErrorString(error).split(':');
    const errMsg: string = msg.slice(1, msg.length).join(':');
    const anno: Annotation = {
      column: 0,
      row: 0,
      text: errMsg,
      type: 'error'
    };

    return { annotations: [anno], markers: [] };
  };

  const canUpdate = () => {
    return istioObjectDetails !== undefined && istioObjectDetails.permissions.update;
  };

  const onCancel = () => {
    history.goBack();
  };

  const onDelete = () => {
    deleteIstioConfigDetail(namespace, objectType, objectId)
      .then(() => history.goBack())
      .catch(error => {
        console.error('Could not delete IstioConfig details.');
        // AlertUtils.addError('Could not delete IstioConfig details.', error);
      });
  };

  const onUpdate = () => {
    jsYaml.safeLoadAll(yamlModified, (objectModified: object) => {
      const jsonPatch = JSON.stringify(mergeJsonPatch(objectModified, getIstioObject(istioObjectDetails))).replace(
        new RegExp('"(,null)+]', 'g'),
        '"]'
      );
      updateIstioConfigDetail(namespace, objectType, objectId, jsonPatch)
        .then(() => {
          const targetMessage = `${namespace} / ${objectType} / ${objectId}`;
          console.log(targetMessage);
          //   AlertUtils.add('Changes applied on ' + targetMessage, 'default', MessageType.SUCCESS);
          // TODO Load istio object details
          //   fetchIstioObjectDetails();
        })
        .catch(error => {
          //   AlertUtils.addError('Could not update IstioConfig details.', error);
          console.error('Could not update IstioConfig details.');
          setYamlValidations(injectGalleyError(error));
        });
    });
  };

  const onRefresh = () => {
    let refresh = true;
    if (isModified) {
      refresh = window.confirm('You have unsaved changes, are you sure you want to refresh ?');
    }
    if (refresh) {
      // TODO Load istio object details
      //   fetchIstioObjectDetails();
    }
  };

  const onDrawerToggle = () => {
    setIsExpanded(!isExpanded);
    //   () => this.resizeEditor()
  };

  const fetchYaml = () => {
    if (isModified) {
      return yamlModified;
    }
    const istioObject = getIstioObject(istioObjectDetails);
    return istioObject ? jsYaml.dump(istioObject, safeDumpOptions) : '';
  };

  const onEditorChange = (value: string) => {
    setIsModified(true);
    setYamlModified(value);
    setIstioValidations(undefined);
    setYamlValidations(parseYamlValidations(value));
  };

  const onCursorChange = (e: any) => {
    const line = parseLine(fetchYaml(), e.cursor.row);
    setSelectedEditorLine(line);
  };

  const fetchIstioConfigs = async (): Promise<IstioConfigDetails> => {
    const validate = istioAPIEnabled ? true : false;

    return promises.register(
      'istioConfigDetail',
      getIstioConfigDetail(namespace, objectType, objectId, validate).then(response => {
        return response.data;
      })
    );
  };

  React.useEffect(() => {
    getKialiConfig()
      .then(kialiConfig => {
        setKialiConfig(kialiConfig);
      })
      .catch(error => console.error('Error getting Kiali API config', error));
  }, []);

  React.useEffect(() => {
    if (kialiConfig) {
      fetchIstioConfigs()
        .then(istioConfigDetail => {
          setIstioObjectDetails(istioConfigDetail);
          setOriginalIstioObjectDetails(istioConfigDetail);
          setIstioValidations(istioConfigDetail.validation);
          setOriginalIstioValidations(istioConfigDetail.validation);
          setIsModified(false);
          // setIsExpanded(isExpanded(istioConfigDetail));
          // setYamlModified(''),
          //   resizeEditor()
        })
        .catch(error => {
          const msg: ErrorMsg = {
            title: 'No Istio object is selected',
            description: objectId + ' is not found in the mesh'
          };
          setIsRemoved(true);
          setError(msg);
          //   AlertUtils.addError(
          //     `Could not fetch Istio object type [${props.objectType}] name [${props.object}] in namespace [${props.namespace}].`,
          //     error
          //   );
          console.error(
            `Could not fetch Istio object type [${objectType}] name [${objectId}] in namespace [${namespace}].`
          );
        });
    }
  }, [kialiConfig]);

  const istioStatusMsgs = getStatusMessages(istioObjectDetails);

  const objectReferences = getObjectReferences(istioObjectDetails);
  const serviceReferences = getServiceReferences(istioObjectDetails);
  const workloadReferences = getWorkloadReferences(istioObjectDetails);
  const helpMessages = getHelpMessages(istioObjectDetails);

  const yamlSource = fetchYaml();

  const panelContent = (
    <DrawerPanelContent>
      <DrawerHead>
        {istioObjectDetails && (
          <IstioConfigOverview
            istioObjectDetails={istioObjectDetails}
            istioValidations={istioValidations}
            namespace={istioObjectDetails?.namespace.name}
            statusMessages={istioStatusMsgs}
            objectReferences={objectReferences}
            serviceReferences={serviceReferences}
            workloadReferences={workloadReferences}
            helpMessages={helpMessages}
            selectedLine={selectedEditorLine}
            // kiosk={this.props.kiosk}
            istioAPIEnabled={istioAPIEnabled}
          />
        )}
      </DrawerHead>
    </DrawerPanelContent>
  );

  const yamlErrors = !!(yamlValidations?.markers.length > 0);

  const editor = istioObjectDetails ? (
    <div className={editorDrawer}>
      <div className={editorStyle}>
        <EditorPreview
          onChange={onEditorChange}
          yaml={istioObjectDetails ? yamlSource : undefined}
          onCursorChange={onCursorChange}
        />
      </div>
      <IstioActionButtons
        objectName={objectId}
        readOnly={!canUpdate()}
        canUpdate={canUpdate() && isModified && !isRemoved && !yamlErrors}
        onCancel={onCancel}
        onUpdate={onUpdate}
        onRefresh={onRefresh}
        showOverview={false}
        overview={isExpanded}
        onOverview={onDrawerToggle}
      />
    </div>
  ) : null;

  return (
    <>
      <Drawer isExpanded={isExpanded} isInline={true}>
        <DrawerContent panelContent={showCards ? panelContent : undefined}>
          <DrawerContentBody>{editor}</DrawerContentBody>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default IstioConfigMeshTab;
