import * as React from 'react';
import { Provider } from 'react-redux';
import { mount, shallow } from 'enzyme';
import screenfull, { Screenfull } from 'screenfull';
import { WorkloadPodLogsComponent } from '../WorkloadPodLogs';
import { Dropdown, DropdownItem, KebabToggle } from '@patternfly/react-core';
import { store } from '../../../store/ConfigStore';

const defaultProps = () => ({
  kiosk: '',
  lastRefreshAt: 200,
  timeRange: {},
  namespace: 'namespace',
  workload: 'workload',
  pods: [
    {
      name: 'testingpod',
      createdAt: 'anytime',
      createdBy: [],
      status: 'any',
      appLabel: false,
      versionLabel: false,
      containers: [{ name: 'busybox', image: 'busybox:v1', isProxy: false, isReady: true }],
      istioContainers: [{ name: 'istio-proxy', image: 'istio:latest', isProxy: true, isReady: true }],
      serviceAccountName: 'namespace-testingpod'
    }
  ]
});

describe('WorkloadPodLogsComponent', () => {
  beforeEach(() => {
    jest.mock('screenfull');

    (screenfull as Screenfull).onchange = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    const wrapper = shallow(<WorkloadPodLogsComponent {...defaultProps()} />);
    expect(wrapper.exists()).toBeTruthy();
  });

  it('renders a kebab toggle dropdown', () => {
    const wrapper = shallow(<WorkloadPodLogsComponent {...defaultProps()} />);
    const kebabDropdownWrapper = wrapper
      .find(Dropdown)
      .findWhere(n => n.prop('toggle') && n.prop('toggle').type === KebabToggle);
    expect(wrapper.find(Dropdown).exists()).toBeTruthy();
    expect(kebabDropdownWrapper.exists()).toBeTruthy();
  });

  it('renders a log level action in the kebab', () => {
    // using 'mount' since the dropdowns are children of the kebab
    const wrapper = mount(
      <Provider store={store}>
        <WorkloadPodLogsComponent {...defaultProps()} />
      </Provider>
    );
    wrapper.find(KebabToggle).find('button').simulate('click');
    expect(
      wrapper
        .find(DropdownItem)
        .findWhere(n => n.key() === 'setLogLevelDebug')
        .exists()
    ).toBeTruthy();
  });

  it('does not render log level actions in the kebab when proxy not present', () => {
    let props = defaultProps();
    props.pods[0].istioContainers = [];
    const wrapper = mount(
      <Provider store={store}>
        <WorkloadPodLogsComponent {...props} />
      </Provider>
    );
    wrapper.find(KebabToggle).find('button').simulate('click');
    expect(
      wrapper
        .find(DropdownItem)
        .findWhere(n => n.key() === 'setLogLevelDebug')
        .exists()
    ).toBeFalsy();
  });

  it('calls set log level when action selected', () => {
    const api = require('../../../services/Api');
    const spy = jest.spyOn(api, 'setPodEnvoyProxyLogLevel');

    const wrapper = mount(
      <Provider store={store}>
        <WorkloadPodLogsComponent {...defaultProps()} />
      </Provider>
    );
    wrapper.find(KebabToggle).find('button').simulate('click');
    wrapper
      .find(DropdownItem)
      .findWhere(n => n.key() === 'setLogLevelDebug')
      .simulate('click');
    expect(spy).toHaveBeenCalled();
  });
});
