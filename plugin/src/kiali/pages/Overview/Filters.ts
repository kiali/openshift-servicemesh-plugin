import { i18n } from 'i18n';
import {
  ActiveFiltersInfo,
  FILTER_ACTION_APPEND,
  AllFilterTypes,
  RunnableFilter,
  FilterValue
} from '../../types/Filters';
import { DEGRADED, FAILURE, HEALTHY, NOT_READY } from '../../types/Health';
import { NamespaceInfo } from '../../types/NamespaceInfo';
import { MTLSStatuses } from '../../types/TLSStatus';
import { TextInputTypes } from '@patternfly/react-core';

export const nameFilter: RunnableFilter<NamespaceInfo> = {
  category: i18n.t('Namespace'),
  placeholder: i18n.t('Filter by Namespace'),
  filterType: TextInputTypes.text,
  action: FILTER_ACTION_APPEND,
  filterValues: [],
  run: (namespace: NamespaceInfo, filters: ActiveFiltersInfo) =>
    filters.filters.some(f => namespace.name.includes(f.value))
};

export const mtlsValues: FilterValue[] = [
  { id: 'enabled', title: i18n.t('Enabled') },
  { id: 'partiallyEnabled', title: i18n.t('Partially Enabled') },
  { id: 'disabled', title: i18n.t('Disabled') }
];

const statusMap = new Map<string, string>([
  [MTLSStatuses.ENABLED, i18n.t('Enabled')],
  [MTLSStatuses.PARTIALLY, i18n.t('Partially Enabled')],
  [MTLSStatuses.NOT_ENABLED, i18n.t('Disabled')],
  [MTLSStatuses.DISABLED, i18n.t('Disabled')]
]);

export const mtlsFilter: RunnableFilter<NamespaceInfo> = {
  category: i18n.t('mTLS'),
  placeholder: i18n.t('Filter by mTLS'),
  filterType: AllFilterTypes.select,
  action: FILTER_ACTION_APPEND,
  filterValues: mtlsValues,
  run: (ns: NamespaceInfo, filters: ActiveFiltersInfo) => {
    return ns.tlsStatus ? filters.filters.some(f => statusMap.get(ns.tlsStatus!.status) === f.value) : false;
  }
};

export const labelFilter: RunnableFilter<NamespaceInfo> = {
  category: i18n.t('Namespace Label'),
  placeholder: i18n.t('Filter by Namespace Label'),
  filterType: AllFilterTypes.nsLabel,
  action: FILTER_ACTION_APPEND,
  filterValues: [],
  run: (ns: NamespaceInfo, filters: ActiveFiltersInfo) => {
    return filters.filters.some(f => {
      if (f.value.includes('=')) {
        const [k, v] = f.value.split('=');
        return v.split(',').some(val => !!ns.labels && k in ns.labels && ns.labels[k].startsWith(val));
      } else {
        return !!ns.labels && Object.keys(ns.labels).some(label => label.startsWith(f.value));
      }
    });
  }
};

interface HealthFilters {
  noFilter: boolean;
  showInError: boolean;
  showInNotReady: boolean;
  showInSuccess: boolean;
  showInWarning: boolean;
}

const healthValues: FilterValue[] = [
  { id: NOT_READY.name, title: NOT_READY.name },
  { id: FAILURE.name, title: FAILURE.name },
  { id: DEGRADED.name, title: DEGRADED.name },
  { id: HEALTHY.name, title: HEALTHY.name }
];

const summarizeHealthFilters = (healthFilters: ActiveFiltersInfo): HealthFilters => {
  if (healthFilters.filters.length === 0) {
    return {
      noFilter: true,
      showInNotReady: true,
      showInError: true,
      showInWarning: true,
      showInSuccess: true
    };
  }

  let showInNotReady = false,
    showInError = false,
    showInWarning = false,
    showInSuccess = false;

  healthFilters.filters.forEach(f => {
    switch (f.value) {
      case NOT_READY.name:
        showInNotReady = true;
        break;
      case FAILURE.name:
        showInError = true;
        break;
      case DEGRADED.name:
        showInWarning = true;
        break;
      case HEALTHY.name:
        showInSuccess = true;
        break;
      default:
    }
  });

  return {
    noFilter: false,
    showInNotReady: showInNotReady,
    showInError: showInError,
    showInWarning: showInWarning,
    showInSuccess: showInSuccess
  };
};

export const healthFilter: RunnableFilter<NamespaceInfo> = {
  category: i18n.t('Health'),
  placeholder: i18n.t('Filter by Application Health'),
  filterType: AllFilterTypes.select,
  action: FILTER_ACTION_APPEND,
  filterValues: healthValues,
  run: (ns: NamespaceInfo, filters: ActiveFiltersInfo) => {
    const { showInNotReady, showInError, showInWarning, showInSuccess, noFilter } = summarizeHealthFilters(filters);

    return noFilter
      ? true
      : ns.status
      ? (showInNotReady && ns.status.inNotReady.length > 0) ||
        (showInError && ns.status.inError.length > 0) ||
        (showInWarning && ns.status.inWarning.length > 0) ||
        (showInSuccess &&
          ns.status.inSuccess.length > 0 &&
          ns.status.inError.length === 0 &&
          ns.status.inWarning.length === 0)
      : false;
  }
};

export const availableFilters: RunnableFilter<NamespaceInfo>[] = [nameFilter, healthFilter, mtlsFilter, labelFilter];
