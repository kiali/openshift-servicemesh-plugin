// Neutral re-exporter that combines the OSSMC, fleet-mesh, and lite mocks for
// @openshift-console/dynamic-plugin-sdk into a single module. The rstest
// alias points here so neither subtree's mock file needs to be modified.
//
// Exports from openshift/__mocks__/consoleSdkMock:
//   consoleFetch, consoleFetchJSON, useActivePerspective, getGroupVersionKindForResource
//
// Exports from fleet-mesh/__mocks__/consoleSdkMock:
//   useK8sWatchResource, useListPageFilter, useActiveColumns,
//   ListPageHeader, ListPageBody, ListPageFilter, VirtualizedTable,
//   TableData, Timestamp
//
// Exports from lite/__mocks__/consoleSdkMock:
//   ResourceLink, k8sGet, k8sPatch, useAccessReview
//
// If any two files ever export the same name, TypeScript will error here.
// Add the new name to only one of the three source files to avoid collision.
export * from '../openshift/__mocks__/consoleSdkMock';
export * from '../fleet-mesh/__mocks__/consoleSdkMock';
export * from '../lite/__mocks__/consoleSdkMock';
