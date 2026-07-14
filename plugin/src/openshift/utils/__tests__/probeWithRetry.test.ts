import { probeWithRetry } from '../probeWithRetry';

describe('probeWithRetry', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof rstest.fn>;

  beforeEach(() => {
    rstest.useFakeTimers();
    originalFetch = global.fetch;
    mockFetch = rstest.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    rstest.useRealTimers();
  });

  it('sets flag to true when the endpoint responds ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sets flag to false when the endpoint responds not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and succeeds on second attempt', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ok: true });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sets flag to false after all retries are exhausted', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3);
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
    expect(mockFetch).toHaveBeenCalledTimes(4); // attempt 0 + 3 retries
  });

  it('uses exponential backoff delays between retries', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 2);

    // Flush the initial fetch rejection
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // First retry is scheduled at 1000ms; should not fire before then
    rstest.advanceTimersByTime(999);
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Exactly at 1000ms the first retry fires
    rstest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sets flag to false when content-type does not match expectedContentType', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' }
    });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3, 'application/json');
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', false);
  });

  it('sets flag to true when content-type matches expectedContentType', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json; charset=utf-8' }
    });
    const setFlag = rstest.fn();
    probeWithRetry('/test-url', 'TEST_FLAG', setFlag, 3, 'application/json');
    await rstest.runAllTimersAsync();
    expect(setFlag).toHaveBeenCalledWith('TEST_FLAG', true);
  });
});
