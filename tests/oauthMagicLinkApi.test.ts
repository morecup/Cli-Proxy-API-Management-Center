import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { oauthApi } from '../src/services/api/oauth';

const originalGet = apiClient.get;
const originalPost = apiClient.post;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.post = originalPost;
});

describe('Claude Desktop magic-link API', () => {
  test('requests the Web UI flow and preserves the magic-link response fields', async () => {
    const calls: Array<{ url: string; params?: unknown }> = [];
    apiClient.get = (async (url: string, config?: { params?: unknown }) => {
      calls.push({ url, params: config?.params });
      return {
        status: 'ok',
        state: 'desktop-state',
        flow: 'magic_link',
        login_url: 'https://claude.ai/login?client=desktop',
      };
    }) as typeof apiClient.get;

    const response = await oauthApi.startAuth('anthropic');

    expect(calls).toEqual([
      {
        url: '/anthropic-auth-url',
        params: { is_webui: true },
      },
    ]);
    expect(response).toEqual({
      status: 'ok',
      state: 'desktop-state',
      flow: 'magic_link',
      login_url: 'https://claude.ai/login?client=desktop',
    });
  });

  test('submits the link with the backend OAuth session state', async () => {
    const calls: Array<{ url: string; data?: unknown }> = [];
    apiClient.post = (async (url: string, data?: unknown) => {
      calls.push({ url, data });
      return { status: 'ok' };
    }) as typeof apiClient.post;

    await oauthApi.submitMagicLink(
      'desktop-state',
      'claude://claude.ai/magic-link?anon_id=example#nonce:email'
    );

    expect(calls).toEqual([
      {
        url: '/oauth-callback',
        data: {
          provider: 'anthropic',
          state: 'desktop-state',
          magic_link: 'claude://claude.ai/magic-link?anon_id=example#nonce:email',
        },
      },
    ]);
  });

  test('starts Claude login with the account proxy in the authenticated request body', async () => {
    const calls: Array<{ url: string; data?: unknown; params?: unknown }> = [];
    apiClient.post = (async (url: string, data?: unknown, config?: { params?: unknown }) => {
      calls.push({ url, data, params: config?.params });
      return { status: 'ok', state: 'desktop-proxy-state', flow: 'magic_link' };
    }) as typeof apiClient.post;

    await oauthApi.startAuth('anthropic', ' socks5h://user:password@1.2.3.4:1080 ');

    expect(calls).toEqual([
      {
        url: '/anthropic-auth-url',
        data: { proxy_url: 'socks5h://user:password@1.2.3.4:1080' },
        params: { is_webui: true },
      },
    ]);
  });

  test('imports a sessionKey only in the authenticated management request body', async () => {
    const calls: Array<{ url: string; data?: unknown }> = [];
    apiClient.post = (async (url: string, data?: unknown) => {
      calls.push({ url, data });
      return { status: 'ok', state: 'session-import-state', flow: 'session_key' };
    }) as typeof apiClient.post;

    const response = await oauthApi.importClaudeSessionKey(
      'sk-ant-sid-user-session',
      'http://proxy.example.test:8080'
    );

    expect(calls).toEqual([
      {
        url: '/claude-desktop/session-key',
        data: {
          session_key: 'sk-ant-sid-user-session',
          proxy_url: 'http://proxy.example.test:8080',
        },
      },
    ]);
    expect(response).toEqual({
      status: 'ok',
      state: 'session-import-state',
      flow: 'session_key',
    });
  });
});
