import {
  aceOptions,
  AceValidations,
  Annotation,
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
  parseHelpAnnotations,
  parseKialiValidations,
  parseLine,
  parseYamlValidations,
  PromisesRegistry,
  safeDumpOptions,
  ServiceReference,
  updateIstioConfigDetail,
  ValidationMessage,
  WorkloadReference
} from '@kiali/core-ui';
import {
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent
} from '@patternfly/react-core';
import * as React from 'react';
import { useHistory } from 'react-router';
import AceEditor from 'react-ace';
import ReactAce from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import 'ace-builds/src-noconflict/ext-searchbox';
import * as jsYaml from 'js-yaml';
import { style } from 'typestyle';
import { getKialiConfig, KialiConfig } from '../../kialiIntegration';
import { AxiosError } from 'axios';
import { K8sGroupVersionKind, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { istioResources } from '../../k8s/resources';

const editorStyle = style({
  marginBottom: '15px',
  border: '1px solid #8b8d8f',
  $nest: {
    '& .istio-validation-error': {
      position: 'absolute',
      background: 'rgba(204, 0, 0, 0.5)'
    },

    '& .istio-validation-warning': {
      position: 'absolute',
      background: 'rgba(236, 122, 8, 0.5)'
    },

    '& .istio-validation-info': {
      position: 'absolute',
      background: '#d1d1d1'
    },

    '& div.ace_gutter-cell.ace_info': {
      // backgroundImage: 'none',
      // $nest: {
      //   '&::before': {
      //     content: '\E92b',
      //     fontFamily: 'pficon',
      //     left: '5px',
      //     position: 'absolute'
      //   }
      // }
    }
  }
});

const editorDrawer = style({
  margin: '15px'
});

const drawerStyle = style({
  zIndex: 0
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

  const [kialiConfig, setKialiConfig] = React.useState<KialiConfig>(undefined);
  const [istioObjectDetails, setIstioObjectDetails] = React.useState<IstioConfigDetails>(undefined);
  const [istioValidations, setIstioValidations] = React.useState<ObjectValidation>(undefined);
  const [isModified, setIsModified] = React.useState<boolean>(false);
  const [yamlModified, setYamlModified] = React.useState<string>(undefined);
  const [yamlValidations, setYamlValidations] = React.useState<AceValidations>(undefined);
  const [isExpanded, setIsExpanded] = React.useState<boolean>(true);
  const [selectedEditorLine, setSelectedEditorLine] = React.useState<string>(undefined);
  // const [error, setError] = React.useState<ErrorMsg>(undefined);
  const [load, setLoad] = React.useState(true);
  const promises = new PromisesRegistry();
  const istioAPIEnabled = kialiConfig?.status?.istioEnvironment?.istioAPIEnabled;
  const editorRef = React.createRef<ReactAce>();

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

  const getShowCards = (refPresent: boolean, istioStatusMsgs: ValidationMessage[]): boolean => {
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

  const getIsExpanded = (istioConfigDetails?: IstioConfigDetails) => {
    let isExpanded = false;
    if (istioConfigDetails) {
      isExpanded = getShowCards(
        getObjectReferences(istioConfigDetails).length > 0,
        getStatusMessages(istioConfigDetails)
      );
    }
    return isExpanded;
  };

  const resizeEditor = () => {
    if (editorRef.current) {
      const editor = editorRef.current!['editor'];
      // The Drawer has an async animation that needs a timeout before to resize the editor
      setTimeout(() => {
        editor.resize(true);
      }, 250);
    }
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
          setLoad(true);
        })
        .catch(error => {
          //   AlertUtils.addError('Could not update IstioConfig details.', error);
          console.error('Could not update IstioConfig details.' + error);
          setYamlValidations(injectGalleyError(error));
        });
    });
  };

  const onDrawerClose = () => {
    setIsExpanded(false);
    resizeEditor();
  };

  const onRefresh = () => {
    let refresh = true;
    if (isModified) {
      refresh = window.confirm('You have unsaved changes, are you sure you want to refresh ?');
    }
    if (refresh) {
      setLoad(true);
    }
  };

  // Aux function to calculate rows for 'status' and 'managedFields' which are typically folded
  const getFoldRanges = (yaml: string | undefined): any => {
    const range = {
      startRow: -1,
      endRow: -1
    };

    if (yaml) {
      const ylines = yaml.split('\n');
      ylines.forEach((line: string, i: number) => {
        // Counting spaces to check managedFields, yaml is always processed with that structure so this is safe
        if (line.startsWith('status:') || line.startsWith('  managedFields:')) {
          if (range.startRow === -1) {
            range.startRow = i;
          } else if (range.startRow > i) {
            range.startRow = i;
          }
        }
        if (line.startsWith('spec:') && range.startRow !== -1) {
          range.endRow = i;
        }
      });
    }

    return range;
  };

  const onDrawerToggle = () => {
    setIsExpanded(!isExpanded);
    resizeEditor();
  };

  const fetchYaml = () => {
    if (isModified) {
      return yamlModified;
    }
    const istioObject = getIstioObject(istioObjectDetails);
    return istioObject ? jsYaml.safeDump(istioObject, safeDumpOptions) : '';
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

  const linkTemplate = (name: string, namespace: string, objectType: string) => {
    let groupVersionKind: K8sGroupVersionKind;

    switch (objectType) {
      case 'service':
        groupVersionKind = { group: '', version: 'v1', kind: 'Service' };
        break;
      // TODO add objectType in workloadReferences to know exact workload type
      case 'workload':
        groupVersionKind = { group: 'apps', version: 'v1', kind: 'Deployment' };
        break;
      case 'gateway':
        groupVersionKind = { group: 'networking.istio.io', version: 'v1beta1', kind: 'Gateway' };
        break;
      default:
        groupVersionKind = istioResources.find(resource => resource.kind.toLowerCase() === objectType);
        break;
    }

    return <ResourceLink groupVersionKind={groupVersionKind} name={name} namespace={namespace} />;
  };

  React.useEffect(() => {
    getKialiConfig()
      .then(kialiConfig => {
        setKialiConfig(kialiConfig);
      })
      .catch(error => console.error('Error getting Kiali API config', error));
  }, []);

  React.useEffect(() => {
    if (kialiConfig && load) {
      fetchIstioConfigs()
        .then(istioConfigDetail => {
          setIstioObjectDetails(istioConfigDetail);
          setIstioValidations(istioConfigDetail.validation);
          setIsModified(false);
          setIsExpanded(getIsExpanded(istioConfigDetail));
          setYamlModified('');
          resizeEditor();
        })
        .catch(error => {
          // const msg: ErrorMsg = {
          //   title: 'No Istio object is selected',
          //   description: objectId + ' is not found in the mesh'
          // };
          // setError(msg);
          //   AlertUtils.addError(
          //     `Could not fetch Istio object type [${props.objectType}] name [${props.object}] in namespace [${props.namespace}].`,
          //     error
          //   );
          console.error(
            `Could not fetch Istio object type [${objectType}] name [${objectId}] in namespace [${namespace}]. ${error}`
          );
        })
        .finally(() => {
          setLoad(false);
        });
    }
  }, [kialiConfig, load]);

  React.useEffect(() => {
    // Hack to force redisplay of annotations after update
    // See https://github.com/securingsincity/react-ace/issues/300
    if (editorRef.current) {
      const editor = editorRef.current!['editor'];

      editor.onChangeAnnotation();

      // Fold status and/or managedFields fields
      const { startRow, endRow } = getFoldRanges(fetchYaml());
      if (!isModified) {
        editor.session.foldAll(startRow, endRow, 0);
      }
    }
  });

  const yamlSource = fetchYaml();
  const istioStatusMsgs = getStatusMessages(istioObjectDetails);

  const objectReferences = getObjectReferences(istioObjectDetails);
  const serviceReferences = getServiceReferences(istioObjectDetails);
  const workloadReferences = getWorkloadReferences(istioObjectDetails);
  const helpMessages = getHelpMessages(istioObjectDetails);

  const refPresent = objectReferences.length > 0;
  const showCards = getShowCards(refPresent, istioStatusMsgs);

  let editorValidations: AceValidations = {
    markers: [],
    annotations: []
  };
  if (!isModified) {
    editorValidations = parseKialiValidations(yamlSource, istioValidations);
  } else {
    if (yamlValidations) {
      editorValidations.markers = yamlValidations.markers;
      editorValidations.annotations = yamlValidations.annotations;
    }
  }

  const helpAnnotations = parseHelpAnnotations(yamlSource, helpMessages);
  helpAnnotations.forEach(ha => editorValidations.annotations.push(ha));

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
            istioAPIEnabled={istioAPIEnabled}
            linkTemplate={linkTemplate}
          />
        )}
        <DrawerActions>
          <DrawerCloseButton onClick={onDrawerClose} />
        </DrawerActions>
      </DrawerHead>
    </DrawerPanelContent>
  );

  const yamlErrors = !!(yamlValidations?.markers.length > 0);

  const editor = istioObjectDetails ? (
    <div className={editorDrawer}>
      <AceEditor
        ref={editorRef}
        mode="yaml"
        theme="eclipse"
        onChange={onEditorChange}
        width={'100%'}
        className={editorStyle}
        wrapEnabled={true}
        readOnly={!canUpdate()}
        setOptions={aceOptions}
        value={istioObjectDetails ? yamlSource : undefined}
        annotations={editorValidations.annotations}
        markers={editorValidations.markers}
        onCursorChange={onCursorChange}
      />
      <IstioActionButtons
        objectName={objectId}
        readOnly={!canUpdate()}
        canUpdate={canUpdate() && isModified && !yamlErrors}
        onCancel={onCancel}
        onUpdate={onUpdate}
        onRefresh={onRefresh}
        showOverview={showCards}
        overview={isExpanded}
        onOverview={onDrawerToggle}
      />
    </div>
  ) : null;

  return (
    <Drawer className={drawerStyle} isExpanded={isExpanded} isInline={true}>
      <DrawerContent panelContent={showCards ? panelContent : undefined}>
        <DrawerContentBody>{editor}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};

export default IstioConfigMeshTab;
