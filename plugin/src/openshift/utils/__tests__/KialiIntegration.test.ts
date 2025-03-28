import { parseTempoUrl } from '../KialiIntegration';

describe('parseTempoUrl', () => {
  it('url for multi tenant should be correct', () => {
    const url = "https://tempo-sample-my-instance-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for multi tenant not secure should be correct', () => {
    const url = "http://tempo-sample.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });

  it('url for multi tenant url with no tenant should be correct', () => {
    const url = "https://tempo-sample-my-instance.tempo.svc.cluster.local:8080/api/traces/v1/"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('url for single tenant and http should be correct', () => {
    const url = "http://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.instance).toEqual('sample');
    expect(parsed?.namespace).toEqual('tempo');
  });

  it('url for single tenant and https should be correct', () => {
    const url = "https://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });


});
