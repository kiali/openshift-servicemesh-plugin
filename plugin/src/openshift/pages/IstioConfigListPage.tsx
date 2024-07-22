import * as React from 'react';
import {
  getGroupVersionKindForResource,
  K8sGroupVersionKind,
  ListPageBody,
  ListPageCreateDropdown,
  ListPageFilter,
  ListPageHeader,
  ResourceIcon,
  ResourceLink,
  RowFilter,
  RowProps,
  TableColumn,
  TableData,
  useActiveColumns,
  useListPageFilter,
  VirtualizedTable
} from '@openshift-console/dynamic-plugin-sdk';
import { Link, useNavigate, useParams } from 'react-router-dom-v5-compat';
import { sortable } from '@patternfly/react-table';
import { istioResources, referenceFor } from '../utils/IstioResources';
import { IstioObject, ObjectValidation, StatusCondition } from 'types/IstioObjects';
import { ValidationObjectSummary } from 'components/Validations/ValidationObjectSummary';
import { filterByName, filterByNamespaces, IstioConfigItem, toIstioItems } from 'types/IstioConfigList';
import * as API from 'services/Api';
import { PromisesRegistry } from 'utils/CancelablePromises';
import { getIstioObject, getReconciliationCondition } from 'utils/IstioConfigUtils';
import { ErrorPage, OSSMCError } from 'openshift/components/ErrorPage';
import { ApiError } from 'types/Api';
import { useKialiTranslation } from 'utils/I18nUtils';
import { OSSM_CONSOLE } from 'openshift/utils/KialiIntegration';
import { serverConfig } from 'config';

interface IstioConfigObject extends IstioObject {
  reconciledCondition?: StatusCondition;
  validation?: ObjectValidation;
}

const useGetColumns: () => TableColumn<IstioConfigObject>[] = () => {
  const { t } = useKialiTranslation();

  return [
    {
      id: 'name',
      sort: 'metadata.name',
      title: t('Name'),
      transforms: [sortable]
    },
    {
      id: 'namespace',
      sort: 'metadata.namespace',
      title: t('Namespace'),
      transforms: [sortable]
    },
    {
      id: 'kind',
      sort: 'kind',
      title: t('Kind'),
      transforms: [sortable]
    },
    {
      id: 'configuration',
      sort: 'validation.valid',
      title: t('Configuration'),
      transforms: [sortable]
    }
  ];
};

const useIstioTableColumns = (): TableColumn<IstioConfigObject>[] => {
  const [activeColumns] = useActiveColumns<IstioConfigObject>({
    columns: useGetColumns(),
    showNamespaceOverride: true,
    columnManagementID: ''
  });

  return activeColumns;
};

const Row: React.FC<RowProps<IstioConfigObject>> = ({ obj, activeColumnIDs }) => {
  const groupVersionKind = getGroupVersionKindForResource(obj);
  const nsGroupVersionKind: K8sGroupVersionKind = {
    group: '',
    version: 'v1',
    kind: 'Namespace'
  };

  const columns = useGetColumns();

  const istioObjectPath = `/k8s/ns/${obj.metadata.namespace}/${referenceFor(groupVersionKind)}/${
    obj.metadata.name
  }/${OSSM_CONSOLE}`;

  return (
    <>
      <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
        <>
          <ResourceIcon groupVersionKind={groupVersionKind} />
          <Link to={istioObjectPath}>{obj.metadata.name}</Link>
        </>
      </TableData>
      <TableData id={columns[1].id} activeColumnIDs={activeColumnIDs}>
        <ResourceLink
          groupVersionKind={nsGroupVersionKind}
          name={obj.metadata.namespace}
          namespace={obj.metadata.namespace}
        />
      </TableData>
      <TableData id={columns[2].id} activeColumnIDs={activeColumnIDs}>
        {obj.kind + (obj.apiVersion?.includes('k8s') ? ' (K8s)' : '')}
      </TableData>
      <TableData id={columns[3].id} activeColumnIDs={activeColumnIDs}>
        {obj.validation ? (
          <Link to={istioObjectPath}>
            <ValidationObjectSummary
              id={`${obj.metadata.name}-config-validation`}
              validations={[obj.validation]}
              reconciledCondition={obj.reconciledCondition}
            />
          </Link>
        ) : (
          <>N/A</>
        )}
      </TableData>
    </>
  );
};

const filters: RowFilter[] = [
  {
    filterGroupName: 'Kind',
    type: 'kind',
    reducer: (obj: IstioConfigObject) => {
      const groupVersionKind = getGroupVersionKindForResource(obj);
      return `${groupVersionKind?.group}.${obj.kind}`;
    },
    filter: (input, obj: IstioConfigObject) => {
      if (!input.selected?.length) {
        return true;
      }

      const groupVersionKind = getGroupVersionKindForResource(obj);
      return input.selected.includes(`${groupVersionKind.group}.${obj.kind}`);
    },
    items: istioResources.map(({ group, kind, title }) => ({
      id: `${group}.${kind}`,
      title: title ? title : kind
    }))
  }
];

type IstioTableProps = {
  columns: TableColumn<IstioConfigObject>[];
  data: IstioConfigObject[];
  loadError?: OSSMCError;
  loaded: boolean;
  unfilteredData: IstioConfigObject[];
};

const IstioTable: React.FC<IstioTableProps> = ({ columns, data, unfilteredData, loaded, loadError }) => {
  return (
    <VirtualizedTable<IstioConfigObject>
      data={data}
      unfilteredData={unfilteredData}
      loaded={loaded}
      loadError={loadError}
      columns={columns}
      Row={Row}
    />
  );
};

const newIstioResourceList = {
  authorizationPolicy: 'AuthorizationPolicy',
  gateway: 'Gateway',
  k8sGateway: 'K8sGateway',
  k8sReferenceGrant: 'K8sReferenceGrant',
  peerAuthentication: 'PeerAuthentication',
  requestAuthentication: 'RequestAuthentication',
  serviceEntry: 'ServiceEntry',
  sidecar: 'Sidecar'
};

const setKindApiVersion = (istioItems: IstioConfigItem[]): void => {
  // Fulfill kind and apiVersion values until https://github.com/kiali/kiali/issues/7452 is fixed
  istioItems.forEach(istioItem => {
    const istioResource = istioResources.find(item => item.id.toLowerCase() === istioItem.type.toLowerCase());

    if (istioResource) {
      istioItem[istioResource.id].kind = istioResource.kind;
      istioItem[istioResource.id].apiVersion = `${istioResource.group}/${istioResource.version}`;
    }
  });
};

const IstioConfigListPage: React.FC<void> = () => {
  const { t } = useKialiTranslation();
  const { ns } = useParams<{ ns: string }>();
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const [listItems, setListItems] = React.useState<IstioConfigObject[]>([]);
  const [loadError, setLoadError] = React.useState<OSSMCError>();
  const navigate = useNavigate();

  const promises = React.useMemo(() => new PromisesRegistry(), []);

  // Fetch the Istio configs, convert to istio items and map them into flattened list items
  const fetchIstioConfigs = React.useCallback(async (): Promise<IstioConfigItem[]> => {
    const validate = await promises
      .register('getStatus', API.getStatus())
      .then(response => response.data.istioEnvironment.istioAPIEnabled)
      .catch(error => {
        setLoadError({ title: error.response?.statusText, message: error.response?.data.error });
        return false;
      });

    if (ns) {
      const getIstioConfigData = promises.register('getIstioConfig', API.getIstioConfig(ns, [], validate, '', ''));

      return getIstioConfigData
        .then(response => {
          const istioItems = toIstioItems(response.data);

          setKindApiVersion(istioItems);

          return istioItems;
        })
        .catch((error: ApiError) => {
          setLoadError({ title: error.response?.statusText, message: error.response?.data.error });
          return [];
        });
    } else {
      // If no namespace is selected, get istio config for all namespaces
      const getNamespacesData = promises.register('getNamespaces', API.getNamespaces());
      const getIstioConfigData = promises.register('getIstioConfig', API.getAllIstioConfigs([], validate, '', ''));

      return Promise.all([getNamespacesData, getIstioConfigData])
        .then(response => {
          // convert istio objects from all namespaces
          const namespaces = response[0].data.map(item => item.name);

          const istioItems = toIstioItems(filterByNamespaces(filterByName(response[1].data, []), namespaces));

          setKindApiVersion(istioItems);

          return istioItems;
        })
        .catch((error: ApiError) => {
          setLoadError({ title: error.response?.statusText, message: error.response?.data.error });
          return [];
        });
    }
  }, [ns, promises]);

  const onCreate = (reference: string): void => {
    const groupVersionKind = istioResources.find(res => res.id === reference) as K8sGroupVersionKind;
    const path = `/k8s/ns/${ns ?? 'default'}/${referenceFor(groupVersionKind)}/~new`;
    navigate(path);
  };

  React.useEffect(() => {
    // initialize page
    setLoaded(false);
    setLoadError(undefined);

    fetchIstioConfigs().then(istioConfigs => {
      const istioConfigObjects = istioConfigs.map(istioConfig => {
        const istioConfigObject = getIstioObject(istioConfig) as IstioConfigObject;
        istioConfigObject.validation = istioConfig.validation;
        istioConfigObject.reconciledCondition = getReconciliationCondition(istioConfig);

        return istioConfigObject;
      });

      setListItems(istioConfigObjects);

      setLoaded(true);
    });
  }, [fetchIstioConfigs]);

  let newIstioResourceItems = {};

  // don't include gateway API objects if it is not enabled
  for (const key in newIstioResourceList) {
    if (key.startsWith('k8s')) {
      if (serverConfig.gatewayAPIEnabled) {
        newIstioResourceItems[key] = newIstioResourceList[key];
      }
    } else {
      newIstioResourceItems[key] = newIstioResourceList[key];
    }
  }

  const [data, filteredData, onFilterChange] = useListPageFilter(listItems, filters);

  const columns = useIstioTableColumns();

  return (
    <>
      {loadError ? (
        <ErrorPage title={loadError.title} message={loadError.message}></ErrorPage>
      ) : (
        <>
          <ListPageHeader title={t('Istio Config')}>
            <ListPageCreateDropdown items={newIstioResourceList} onClick={onCreate}>
              {t('Create')}
            </ListPageCreateDropdown>
          </ListPageHeader>
          <ListPageBody>
            <ListPageFilter data={data} loaded={loaded} rowFilters={filters} onFilterChange={onFilterChange} />
            <IstioTable
              columns={columns}
              data={filteredData}
              unfilteredData={data}
              loaded={loaded}
              loadError={loadError}
            />
          </ListPageBody>
        </>
      )}
    </>
  );
};

export default IstioConfigListPage;
