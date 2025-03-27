import { parseTempoUrl } from '../KialiIntegration';

describe('parseTempoUrl', () => {
  it('should be correct', () => {
    const url = "https://tempo-sample-my-instance-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('should be correct', () => {
    const url = "http://tempo-sample.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });

  it('should be correct', () => {
    const url = "https://tempo-sample-my-instance.tempo.svc.cluster.local:8080/api/traces/v1/"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('should be correct', () => {
    const url = "http://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.instance).toEqual('sample');
    expect(parsed?.namespace).toEqual('tempo');
  });

  it('should be correct', () => {
    const url = "https://tempo-sample-query-frontend.tempo.svc:3200"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeUndefined();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });


});
