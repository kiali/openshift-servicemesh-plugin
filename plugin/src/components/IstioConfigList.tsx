import * as React from 'react';
import {
    getGroupVersionKindForResource, K8sResourceCommon, ListPageBody, ListPageFilter, ListPageHeader,
    ResourceLink, RowFilter,
    RowProps,
    TableColumn,
    TableData, useActiveColumns, useK8sWatchResource, useListPageFilter, VirtualizedTable
} from '@openshift-console/dynamic-plugin-sdk';
import { getKialiUrl, initKialiListeners } from '../kialiIntegration';
import { useParams } from 'react-router';
import { sortable } from '@patternfly/react-table';
import { istioResources, referenceForRsc } from '../k8s/resources';
import * as API from '../k8s/api';
import {getValidation, IstioConfigsMap} from '../types/IstioConfigList';

const useIstioTableColumns = (namespace: string) => {
    const columns: TableColumn<K8sResourceCommon>[] = [
        {
            id: 'name',
            sort: 'metadata.name',
            title: 'Name',
            transforms: [sortable],

        },
        {
            id: 'namespace',
            sort: 'metadata.namespace',
            title: 'Namespace',
            transforms: [sortable],
        },
        {
            id: 'kind',
            sort: 'kind',
            title: 'Kind',
            transforms: [sortable],
        },
        {
            id: 'configuration',
            sort: 'validations',
            title: 'Configuration',
            transforms: [sortable],
        },
    ];

    const [activeColumns] = useActiveColumns<K8sResourceCommon>({
        columns: columns,
        showNamespaceOverride: false,
        columnManagementID: '',
    });

    return activeColumns;
};

const columns: TableColumn<K8sResourceCommon>[] = [
    {
        id: 'name',
        sort: 'metadata.name',
        title: 'Name',
        transforms: [sortable],

    },
    {
        id: 'namespace',
        sort: 'metadata.namespace',
        title: 'Namespace',
        transforms: [sortable],
    },
    {
        id: 'kind',
        sort: 'kind',
        title: 'Kind',
        transforms: [sortable],
    },
    {
        id: 'configuration',
        sort: 'validations',
        title: 'Configuration',
        transforms: [sortable],
    },
];

const Row = ({ obj, activeColumnIDs }: RowProps<K8sResourceCommon>) => {
    const groupVersionKind = getGroupVersionKindForResource(obj);
    return (
        <>
            <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
                <ResourceLink
                    groupVersionKind={groupVersionKind}
                    name={obj.metadata.name}
                    namespace={obj.metadata.namespace}
                />
            </TableData>
            <TableData id={columns[1].id} activeColumnIDs={activeColumnIDs}>
                {obj.metadata.namespace}
            </TableData>
            <TableData id={columns[2].id} activeColumnIDs={activeColumnIDs}>
                {obj.kind}
            </TableData>
            <TableData id={columns[3].id} activeColumnIDs={activeColumnIDs}>
                {obj['validations'] ? obj['validations'] : 'N/A'}
            </TableData>
        </>
    );
};

export const filters: RowFilter[] = [
    {
        filterGroupName: 'Kind',
        type: 'kind',
        reducer: (obj: K8sResourceCommon) => obj.kind,
        filter: (input, obj: K8sResourceCommon) => {
            if (!input.selected?.length) {
                return true;
            }

            return input.selected.includes(obj.kind);
        },
        items: istioResources.map(({ kind }) => ({ id: kind, title: kind })),
    },
];

type IstioTableProps = {
    columns: TableColumn<K8sResourceCommon>[];
    data: K8sResourceCommon[];
    unfilteredData: K8sResourceCommon[];
    loaded: boolean;
    loadError?: {
        message?: string;
    };
};

const IstioTable = ({
    columns,
    data,
    unfilteredData,
    loaded,
    loadError,
}: IstioTableProps) => {
    return (
        <VirtualizedTable<K8sResourceCommon>
            data={data}
            unfilteredData={unfilteredData}
            loaded={loaded}
            loadError={loadError}
            columns={columns}
            Row={Row}
        />
    );
};

const IstioConfigList = () => {
    const { ns } = useParams<{ ns: string }>();

    initKialiListeners();

    const [kialiValidations, setKialiValidations] = React.useState<IstioConfigsMap>(undefined);
    const prevResourceVersion = React.useRef<string[]>([]);

    const watches = istioResources.map(({ group, version, kind }) => {
        const [data, loaded, error] = useK8sWatchResource<K8sResourceCommon[]>({
            groupVersionKind: { group, version, kind },
            isList: true,
            namespace: ns,
            namespaced: true,
        });
        if (error) {
            console.error('Could not load', kind, error);
        }
        return [data, loaded, error];
    });

    const flatData = watches.map(([list]) => list).flat();
    const resourceVersion = flatData.map(r => referenceForRsc(r));
    const loaded = watches.every(([, loaded, error]) => !!(loaded || error));

    React.useEffect(() => {
        // Kiali validations should be fetched when:
        // - All watchers are loaded
        // - No new updates on the list of the objects
        const newUpdates =
            // Initial fetch
            (resourceVersion.length === 0 && prevResourceVersion.current.length === 0) ||
            // Different sizes
            resourceVersion.length != prevResourceVersion.current.length ||
            // Same size but different elements
            resourceVersion.some(v => !prevResourceVersion.current.includes(v));

        if (loaded && newUpdates) {
            getKialiUrl()
                .then(kialiUrl => {
                    API.getAllIstioConfigs(kialiUrl.baseUrl, kialiUrl.token)
                        .then(response => response.data)
                        .then((kialiValidations) => {
                            // Update the list of resources present when last fech of Kiali Validations
                            // Hooks need to maintain this "when to update" logic inside to avoid unnecessary fetches and renders
                            prevResourceVersion.current = Array.from(resourceVersion);
                            setKialiValidations(kialiValidations);
                        });
                })
                .catch(error => console.error('Could not connect to Kiali API', error));
        }
        // Deps trigger the hook, but those are not "enough", inner logic is needed to check changes
    }, [loaded, resourceVersion, prevResourceVersion]);

    // On new resources and/or validations, a combination task is required
    // This uses a "trick" to add a dynamic "validations" field to the K8sResourceCommon type
    // Probably it can be added a custom type, but that will trigger more refactoring on the standard classes used for tables and filters
    const combinedData = React.useMemo(() => {
        if (loaded && kialiValidations) {
            flatData.forEach(d => d['validations'] = getValidation(kialiValidations, d.kind, d.metadata.name, d.metadata.namespace))
        }
        return flatData;
    }, [flatData, kialiValidations, loaded])

    const [data, filteredData, onFilterChange] = useListPageFilter(
        combinedData,
        filters,
    );

    const columns = useIstioTableColumns(ns);
    return (
        <>
            <ListPageHeader title="Istio Config" />
            <ListPageBody>
                <ListPageFilter
                    data={data}
                    loaded={loaded}
                    rowFilters={filters}
                    onFilterChange={onFilterChange}
                />
                <IstioTable
                    columns={columns}
                    data={filteredData}
                    unfilteredData={data}
                    loaded={loaded}
                />
            </ListPageBody>
        </>
    );
};

export default IstioConfigList;