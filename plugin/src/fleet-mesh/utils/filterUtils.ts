import type { FilterValue, RowSearchFilter as SdkRowSearchFilter } from '@openshift-console/dynamic-plugin-sdk';

export type RowSearchFilter<R> = SdkRowSearchFilter<R>;

export function fuzzyCaseInsensitive(filter: string | undefined, value: string): boolean {
  if (!filter) return true;
  return value.toLowerCase().includes(filter.toLowerCase());
}

export type { FilterValue };
