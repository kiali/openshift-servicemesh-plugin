import {parseTempoUrl} from "../KialiIntegration";

describe('parseTempoUrl', () => {
  it('should be correct', () => {
    const url = "https://tempo-sample-my-instance-gateway.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });

  it('should return the same array', () => {
    const url = "http://tempo-sample.tempo.svc.cluster.local:8080/api/traces/v1/default"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toEqual('default');
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample');
  });

  it('should return the same array', () => {
    const url = "https://tempo-sample-my-instance.tempo.svc.cluster.local:8080/api/traces/v1/"
    const parsed = parseTempoUrl(url)
    expect(parsed?.tenant).toBeNull();
    expect(parsed?.namespace).toEqual('tempo');
    expect(parsed?.instance).toEqual('sample-my-instance');
  });
});
