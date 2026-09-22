import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

const callerOwnedConfig = {
  apiKey: 'claude-secret',
  baseUrl: 'https://api.anthropic.com',
};

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

describe('Claude legacy request fields', () => {
  test('ignores legacy request fields from the backend', () => {
    const config = normalizeConfigResponse({
      'claude-api-key': [
        {
          'api-key': 'claude-secret',
          'base-url': 'https://api.anthropic.com',
          'fingerprint-profile': 'legacy-profile',
          'experimental-cch-signing': true,
        },
      ],
    });

    expect(config.claudeApiKeys).toEqual([
      {
        apiKey: 'claude-secret',
        baseUrl: 'https://api.anthropic.com',
      },
    ]);
  });

  test('removes legacy request fields when saving a Claude key', async () => {
    const calls: Array<{ url: string; data?: unknown }> = [];
    apiClient.get = (async () => ({
      'claude-api-key': [
        {
          'api-key': 'claude-secret',
          'base-url': 'https://api.anthropic.com',
          'fingerprint-profile': 'legacy-profile',
          'experimental-cch-signing': true,
          'future-field': 'preserved',
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (url: string, data?: unknown) => {
      calls.push({ url, data });
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateClaudeConfig(
      'claude-secret',
      'https://api.anthropic.com',
      callerOwnedConfig
    );

    expect(calls).toEqual([
      {
        url: '/claude-api-key',
        data: [
          {
            'api-key': 'claude-secret',
            'base-url': 'https://api.anthropic.com',
            'future-field': 'preserved',
          },
        ],
      },
    ]);
  });
});
