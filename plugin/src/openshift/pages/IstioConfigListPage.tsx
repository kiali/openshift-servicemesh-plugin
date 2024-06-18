import * as React from 'react';
import {
  getGroupVersionKindForResource,
  K8sGroupVersionKind,
  ListPageBody,
  ListPageCreateDropdown,
  ListPageFilter,
  ListPageHeader,
  ResourceLink,
  RowFilter,
  RowProps,
  TableColumn,
  TableData,
  useActiveColumns,
  useListPageFilter,
  VirtualizedTable
} from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
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

  return (
    <>
      <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
        <ResourceLink groupVersionKind={groupVersionKind} name={obj.metadata.name} namespace={obj.metadata.namespace} />
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
          <ValidationObjectSummary
            id={`${obj.metadata.name}-config-validation`}
            validations={[obj.validation]}
            reconciledCondition={obj.reconciledCondition}
          />
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
  authorization_policy: 'AuthorizationPolicy',
  gateway: 'Gateway',
  k8s_gateway: 'K8sGateway',
  peer_authentication: 'PeerAuthentication',
  request_authentication: 'RequestAuthentication',
  service_entry: 'ServiceEntry',
  sidecar: 'Sidecar'
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
          return toIstioItems(response.data);
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
          let istioItems: IstioConfigItem[] = [];
          // convert istio objects from all namespaces
          const namespaces = response[0].data.map(item => item.name);

          istioItems = toIstioItems(filterByNamespaces(filterByName(response[1].data, []), namespaces));

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
