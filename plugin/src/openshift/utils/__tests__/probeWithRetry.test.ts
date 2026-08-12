import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { probeWithRetry } from '../probeWithRetry';

function mockResponse(init: { headers?: { get: (name: string) => string }; ok: boolean }): Response {
  return init as unknown as Response;
}

describe('probeWithRetry', () => {
  beforeEach(() => {
    rstest.useFakeTimers();
  });

  afterEach(() => {
    rstest.clearAllMocks();
    rstest.useRealTimers();
  });

  it('sets flag to true when the endpoint responds ok', async () => {
    rstest.mocked(consoleFetch).mockResolvedValueOnce(mockResponse({ ok: true }));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it('sets flag to false immediately when the endpoint responds not ok, without retrying', async () => {
    rstest.mocked(consoleFetch).mockResolvedValueOnce(mockResponse({ ok: false }));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 2);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it('sets flag to false immediately when consoleFetch rejects with a definitive HttpError, without retrying', async () => {
    // Console's runtime consoleFetch rejects (rather than resolving with ok: false) for
    // non-2xx responses, throwing an HttpError-shaped object with a numeric `.code`.
    rstest.mocked(consoleFetch).mockRejectedValueOnce({ code: 404, message: 'Not Found' });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and succeeds on second attempt', async () => {
    rstest
      .mocked(consoleFetch)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(mockResponse({ ok: true }));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
    expect(consoleFetch).toHaveBeenCalledTimes(2);
  });

  it('sets flag to false after all retries are exhausted', async () => {
    rstest.mocked(consoleFetch).mockRejectedValue(new Error('network'));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(consoleFetch).toHaveBeenCalledTimes(4); // attempt 0 + 3 retries
  });

  it('uses exponential backoff delays between retries', async () => {
    rstest.mocked(consoleFetch).mockRejectedValue(new Error('network'));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 2);

    // Flush the initial fetch rejection
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleFetch).toHaveBeenCalledTimes(1);

    // First retry is scheduled at 250ms; should not fire before then
    rstest.advanceTimersByTime(249);
    await Promise.resolve();
    expect(consoleFetch).toHaveBeenCalledTimes(1);

    // Exactly at 250ms the first retry fires
    rstest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleFetch).toHaveBeenCalledTimes(2);
  });

  it('sets flag to false immediately when content-type does not match expectedContentType, without retrying', async () => {
    rstest.mocked(consoleFetch).mockResolvedValueOnce(
      mockResponse({
        ok: true,
        headers: { get: () => 'text/html' }
      })
    );
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 2, 'application/json');
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it('sets flag to true when content-type matches expectedContentType', async () => {
    rstest.mocked(consoleFetch).mockResolvedValueOnce(
      mockResponse({
        ok: true,
        headers: { get: () => 'application/json; charset=utf-8' }
      })
    );
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3, 'application/json');
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
  });
});
