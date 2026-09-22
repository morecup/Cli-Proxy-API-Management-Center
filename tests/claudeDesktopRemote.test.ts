import { afterEach, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { claudeDesktopRuntimeApi } from '../src/services/api/claudeDesktopRuntime';
import {
  controlPlaneIssues,
  controlPlaneHealth,
} from '../src/features/dashboard/claudeDesktopRuntime';

const get = apiClient.get;
const post = apiClient.post;
afterEach(() => {
  apiClient.get = get;
  apiClient.post = post;
});

test('remote operations preserve exact account/session/query and creation cannot graft', async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  apiClient.get = (async (url: string) => {
    calls.push({ url });
    return { sessions: [] };
  }) as typeof apiClient.get;
  apiClient.post = (async (url: string, body: unknown) => {
    calls.push({ url, body });
    return { session: {} };
  }) as typeof apiClient.post;
  const body = {
    remote_session_id: 'cse_remote',
    folder: 'C:/synthetic',
    model: 'claude-sonnet-5',
  };
  await claudeDesktopRuntimeApi.sessions('auth/one');
  await claudeDesktopRuntimeApi.startRemote('auth/one', body);
  await claudeDesktopRuntimeApi.attachRemote('auth/one', 'local/two', 'generation');
  await claudeDesktopRuntimeApi.stopSession('auth/one', 'local/two', 'generation');
  await claudeDesktopRuntimeApi.resumeSession('auth/one', 'local/two', 'durable-generation');
  expect(calls).toEqual([
    { url: '/claude-desktop/runtimes/auth%2Fone/sessions' },
    { url: '/claude-desktop/runtimes/auth%2Fone/sessions/remote', body },
    {
      url: '/claude-desktop/runtimes/auth%2Fone/sessions/local%2Ftwo/attach',
      body: { expected_query_id: 'generation' },
    },
    {
      url: '/claude-desktop/runtimes/auth%2Fone/sessions/local%2Ftwo/stop',
      body: { expected_query_id: 'generation' },
    },
    {
      url: '/claude-desktop/runtimes/auth%2Fone/sessions/local%2Ftwo/resume',
      body: { expected_generation: 'durable-generation' },
    },
  ]);
});

test('admission is not model completion and unsupported inbound work is degraded', () => {
  const status = {
    active: 1,
    initialization_failed: 0,
    retiring: 0,
    failed: 0,
    inbound_dispatched: 4,
    inbound_completed: 1,
    inbound_failed: 1,
    inbound_unhandled: 1,
    inbound_execution_failed: 2,
  };
  expect(controlPlaneHealth(status)).toBe('degraded');
  expect(controlPlaneIssues(status)).toEqual([
    'inbound_failed',
    'inbound_unhandled',
    'inbound_execution_failed',
  ]);
});
