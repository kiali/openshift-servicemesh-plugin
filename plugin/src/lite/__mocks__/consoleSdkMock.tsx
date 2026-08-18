import { rs } from '@rstest/core';
import type { ComponentType, FC, ReactNode } from 'react';
import { getMockTableRowKey } from '../../__mocks__/mockTableRowKey';

// Exports that lite pages need from @openshift-console/dynamic-plugin-sdk
// that are not already covered by the openshift sibling mock.
// The root plugin/src/__mocks__/consoleSdkMock.ts re-exports from all sibling mocks.
//
// Already covered by openshift mock (do NOT re-export here):
//   consoleFetchJSON, useActivePerspective

export const ResourceLink: FC<{ groupVersionKind?: unknown; kind?: string; name?: string; namespace?: string }> = ({
  name
}) => <span>{name ?? ''}</span>;

export const k8sPatch = rs.fn();

// Defaults to rejecting so tests that don't care about Route discovery don't need to mock it;
// KialisPage treats a rejected Route lookup as "no Route found" and falls back gracefully.
export const k8sGet = rs.fn(() => Promise.reject(new Error('not mocked')));

// Defaults to "allowed" so existing tests that don't care about RBAC keep passing unless a
// test explicitly overrides it to exercise the disabled/tooltip states.
export const useAccessReview = rs.fn(() => [true, false]);

export const useK8sWatchResource = rs.fn(() => [null, false, null]);

export const useListPageFilter = rs.fn((data: unknown[]) => [data ?? [], data ?? [], rs.fn()]);

export const useActiveColumns = rs.fn((opts: { columns?: { id: string }[] }) => [opts?.columns ?? [], true]);

export const ListPageHeader: FC<{ title: string }> = ({ title }) => <h1>{title}</h1>;

export const ListPageBody: FC<{ children?: ReactNode }> = ({ children }) => <div>{children}</div>;

export const ListPageFilter: FC<{
  data?: unknown[];
  hideLabelFilter?: boolean;
  loaded?: boolean;
  onFilterChange?: () => void;
}> = () => <div data-testid="list-page-filter" />;

export const VirtualizedTable: FC<{
  EmptyMsg?: ComponentType;
  NoDataEmptyMsg?: ComponentType;
  Row?: ComponentType<{ activeColumnIDs: Set<string>; obj: unknown; rowData?: unknown }>;
  columns?: { id: string }[];
  data?: unknown[];
  loadError?: unknown;
  loaded?: boolean;
  rowData?: unknown;
  unfilteredData?: unknown[];
}> = ({ data = [], loaded, loadError, columns = [], Row, NoDataEmptyMsg, rowData }) => {
  if (!loaded) return <div data-testid="loading" />;
  if (loadError) return <div data-testid="load-error">{String(loadError)}</div>;
  if (data.length === 0) {
    const NoData = NoDataEmptyMsg;
    return NoData ? <NoData /> : <div data-testid="no-data" />;
  }
  if (!Row) return null;
  const activeColumnIDs = new Set(columns.map(c => c.id));
  return (
    <table data-testid="table">
      <tbody>
        {data.map(obj => (
          <tr key={getMockTableRowKey(obj)}>
            <Row obj={obj} activeColumnIDs={activeColumnIDs} rowData={rowData} />
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const TableData: FC<{
  activeColumnIDs?: Set<string>;
  children?: ReactNode;
  id?: string;
}> = ({ children }) => <td>{children}</td>;

export const Timestamp: FC<{ timestamp?: string }> = ({ timestamp }) => (
  <span data-testid="timestamp">{timestamp}</span>
);
