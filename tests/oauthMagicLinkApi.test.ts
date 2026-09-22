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
});
