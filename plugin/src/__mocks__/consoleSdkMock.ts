// Neutral re-exporter that combines the OSSMC and fleet-mesh mocks for
// @openshift-console/dynamic-plugin-sdk into a single module. The rstest
// alias points here so neither subtree's mock file needs to be modified.
//
// Exports from openshift/__mocks__/consoleSdkMock:
//   useK8sWatchResource, useListPageFilter, useActiveColumns,
//   ListPageHeader, ListPageBody, ListPageFilter, VirtualizedTable,
//   TableData, Timestamp
//
// Exports from fleet-mesh/__mocks__/consoleSdkMock:
//   (same hook/component names, scoped to fleet-mesh tests via alias)
//
// If both files ever export the same name, TypeScript will error here.
// Add the new name to only one of the two source files to avoid collision.
export * from '../openshift/__mocks__/consoleSdkMock';
export * from '../fleet-mesh/__mocks__/consoleSdkMock';
