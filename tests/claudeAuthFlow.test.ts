import { describe, expect, mock, test } from 'bun:test';
import { ClaudeAuthFlow, type ClaudeAuthProgress } from '../src/features/oauth/claudeAuthFlow';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function setup() {
  const api = {
    startAuth: mock(async () => ({ state: 'email-state', flow: 'magic_link' })),
    importClaudeSessionKey: mock(async () => ({
      status: 'ok' as const,
      state: 'key-state',
      flow: 'session_key' as const,
    })),
    submitMagicLink: mock(async () => ({ status: 'ok' as const })),
    getAuthStatus: mock(async (): Promise<{ status: 'wait' | 'ok' | 'error'; error?: string }> => ({
      status: 'wait',
    })),
    cancelAuthSession: mock(async () => ({ status: 'ok' as const, cancelled: true })),
  };
  const changes: ClaudeAuthProgress[] = [];
  const success = mock(() => {});
  let time = 0;
  const flow = new ClaudeAuthFlow(
    api,
    (value) => changes.push(value),
    success,
    () => time
  );
  return {
    api,
    flow,
    changes,
    success,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('Claude Desktop sign-in interaction', () => {
  test('an interrupted credential submission is not restored as confirmed processing', async () => {
    const { flow } = setup();
    flow.restore('magic_link', 'partially-started', false);
    await flush();
    expect(flow.progress.phase).toBe('attention');
    expect(flow.progress.issue).toBe('network');
    expect(flow.locked).toBe(true);
  });
  test('defaults to sessionKey; choosing email does not start authentication or poll', () => {
    const { api, flow } = setup();
    expect(flow.progress).toEqual({ method: 'session_key', phase: 'idle' });
    flow.select('magic_link');
    expect(flow.progress.phase).toBe('idle');
    expect(api.startAuth).not.toHaveBeenCalled();
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  test('sessionKey does not enter the email flow; proxy is passed and secrets are not retained', async () => {
    const { api, flow, changes, success } = setup();
    await flow.start(' secret-credential ', ' socks5h://proxy.test:1080 ');
    await flush();
    expect(api.importClaudeSessionKey).toHaveBeenCalledWith(
      'secret-credential',
      'socks5h://proxy.test:1080'
    );
    expect(api.startAuth).not.toHaveBeenCalled();
    expect(api.submitMagicLink).not.toHaveBeenCalled();
    expect(flow.progress.phase).toBe('verifying');
    expect(success).not.toHaveBeenCalled();
    expect(JSON.stringify(changes)).not.toContain('secret-credential');
    api.getAuthStatus.mockResolvedValue({ status: 'ok' });
    await flow.check();
    expect(flow.progress.phase).toBe('success');
    expect(flow.progress.state).toBeUndefined();
    expect(success).toHaveBeenCalledTimes(1);
  });

  test('email starts only on submission and submits link before polling', async () => {
    const { api, flow } = setup();
    flow.select('magic_link');
    api.submitMagicLink.mockImplementation(async () => {
      expect(api.getAuthStatus).not.toHaveBeenCalled();
      return { status: 'ok' };
    });
    await flow.start(' claude://example.test/link ', 'http://proxy.test');
    expect(api.startAuth).toHaveBeenCalledWith('anthropic', 'http://proxy.test');
    expect(api.submitMagicLink).toHaveBeenCalledWith('email-state', 'claude://example.test/link');
    expect(api.importClaudeSessionKey).not.toHaveBeenCalled();
    expect(flow.progress.phase).toBe('verifying');
  });

  test('blocks duplicate starts and method changes while active', async () => {
    const { api, flow } = setup();
    const start = flow.start('one', '');
    await flow.start('two', '');
    flow.select('magic_link');
    await start;
    expect(api.importClaudeSessionKey).toHaveBeenCalledTimes(1);
    expect(flow.progress.method).toBe('session_key');
  });

  test('cancels a delayed start when its server state arrives, without submitting the link', async () => {
    const { api, flow } = setup();
    let finish!: (value: { state: string; flow: string }) => void;
    api.startAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    flow.select('magic_link');
    const starting = flow.start('link', '');
    await flow.cancel();
    expect(flow.progress.phase).toBe('cancelling');
    finish({ state: 'late', flow: 'magic_link' });
    await starting;
    expect(api.cancelAuthSession).toHaveBeenCalledWith('late');
    expect(api.submitMagicLink).not.toHaveBeenCalled();
    expect(flow.progress.phase).toBe('cancelled');
    flow.select('session_key');
    expect(flow.locked).toBe(false);
  });

  test('ignores a stale poll response after cancellation', async () => {
    const { api, flow, success } = setup();
    let finish!: (value: { status: 'ok' }) => void;
    api.getAuthStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await flow.start('key', '');
    await flow.check();
    expect(api.getAuthStatus).toHaveBeenCalledTimes(1);
    await flow.cancel();
    finish({ status: 'ok' });
    await flush();
    expect(flow.progress.phase).toBe('cancelled');
    expect(success).not.toHaveBeenCalled();
  });

  test('reports success if authentication completed before the cancellation', async () => {
    const { api, flow, success } = setup();
    await flow.start('key', '');
    await flush();
    api.cancelAuthSession.mockResolvedValue({ status: 'ok', cancelled: false });
    api.getAuthStatus.mockResolvedValue({ status: 'ok' });
    await flow.cancel();
    expect(flow.progress.phase).toBe('success');
    expect(success).toHaveBeenCalledTimes(1);
  });

  test('long waits stop the spinner and allow a status retry', async () => {
    const { flow, advance } = setup();
    await flow.start('key', '');
    await flush();
    advance(180_000);
    await flow.check();
    expect(flow.progress.phase).toBe('attention');
    expect(flow.progress.issue).toBe('slow');
    await flow.check(true);
    expect(flow.progress.phase).toBe('verifying');
  });

  test('network errors retain the state and do not falsely report auth failure', async () => {
    const { api, flow } = setup();
    api.getAuthStatus.mockRejectedValue(new Error('offline'));
    await flow.start('key', '');
    await flush();
    expect(flow.progress.phase).toBe('attention');
    expect(flow.progress.state).toBe('key-state');
    api.getAuthStatus.mockResolvedValue({ status: 'error', error: 'expired' });
    await flow.check(true);
    expect(flow.progress.phase).toBe('error');
    expect(flow.locked).toBe(false);
  });

  test('failed cancellation stays locked and can be retried', async () => {
    const { api, flow } = setup();
    await flow.start('key', '');
    await flush();
    api.cancelAuthSession.mockRejectedValue(new Error('offline'));
    await flow.cancel();
    expect(flow.progress.issue).toBe('cancel');
    expect(flow.locked).toBe(true);
    api.cancelAuthSession.mockResolvedValue({ status: 'ok', cancelled: true });
    await flow.cancel();
    expect(flow.progress.phase).toBe('cancelled');
  });

  test('resumes an established session without reimporting credentials', async () => {
    const { api, flow } = setup();
    flow.restore('session_key', 'restored');
    await flush();
    expect(api.getAuthStatus).toHaveBeenCalledWith('restored');
    expect(api.importClaudeSessionKey).not.toHaveBeenCalled();
    expect(flow.progress.phase).toBe('verifying');
  });

  test('an unmounted start cancels the late session instead of reviving the UI', async () => {
    const { api, flow, changes } = setup();
    const starting = flow.start('key', '');
    flow.dispose();
    await starting;
    expect(api.cancelAuthSession).toHaveBeenCalledWith('key-state');
    expect(changes).toHaveLength(1);
  });
});
