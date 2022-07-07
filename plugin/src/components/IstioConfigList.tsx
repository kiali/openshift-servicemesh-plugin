import * as React from 'react';
import {
    getGroupVersionKindForResource, K8sResourceCommon, ListPageBody, ListPageFilter, ListPageHeader,
    ResourceLink, RowFilter,
    RowProps,
    TableColumn,
    TableData, useActiveColumns, useK8sWatchResource, useListPageFilter, VirtualizedTable
} from "@openshift-console/dynamic-plugin-sdk";
import {initKialiListeners} from "../utils";
import {useParams} from "react-router";
import { sortable } from '@patternfly/react-table';
import {istioResources} from "../k8s/resources";

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
    const loaded = watches.every(([, loaded, error]) => !!(loaded || error));
    const [data, filteredData, onFilterChange] = useListPageFilter(
        flatData,
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