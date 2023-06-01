import { DecoratedGraphElements, FetchParams, TimeInMilliseconds } from '@kiali/types';

export type GraphData = {
  elements: DecoratedGraphElements;
  elementsChanged: boolean; // true if current elements differ from previous fetch, can be used as an optimization.
  errorMessage?: string;
  fetchParams: FetchParams;
  isLoading: boolean;
  isError?: boolean;
  timestamp: TimeInMilliseconds;
};
