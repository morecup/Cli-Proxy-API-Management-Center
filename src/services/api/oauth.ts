/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';
import {
  isManagementOAuthProviderKey,
  normalizeManagementOAuthProviderKey,
} from '@/utils/providerKeys';

export type BuiltInOAuthProvider = 'codex' | 'anthropic' | 'antigravity' | 'kimi' | 'xai';

export interface OAuthStartResponse {
  url?: string;
  state?: string;
  flow?: string;
  login_url?: string;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface OAuthBrowserTicketResponse {
  status: 'ok';
  ticket: string;
  expires_in: number;
}

export interface ClaudeSessionImportResponse {
  status: 'ok';
  state: string;
  flow: 'session_key';
}

const WEBUI_SUPPORTED = new Set<string>(['codex', 'anthropic', 'antigravity', 'xai']);

const normalizeProviderForManagementPath = (provider: string): string => {
  const key = normalizeManagementOAuthProviderKey(provider);
  if (!isManagementOAuthProviderKey(key)) {
    throw new Error('Invalid OAuth provider');
  }
  return key;
};

export const oauthApi = {
  startAuth: (provider: string, proxyUrl?: string) => {
    const providerKey = normalizeProviderForManagementPath(provider);
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.has(providerKey)) {
      params.is_webui = true;
    }
    const normalizedProxyUrl = proxyUrl?.trim();
    if (providerKey === 'anthropic' && normalizedProxyUrl) {
      return apiClient.post<OAuthStartResponse>(
        `/${providerKey}-auth-url`,
        { proxy_url: normalizedProxyUrl },
        { params }
      );
    }
    return apiClient.get<OAuthStartResponse>(`/${providerKey}-auth-url`, {
      params: Object.keys(params).length ? params : undefined,
    });
  },

  getAuthStatus: (state: string) =>
    apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state },
    }),

  cancelAuthSession: (state: string) =>
    apiClient.delete<{ status: 'ok'; cancelled: boolean }>('/oauth-session', {
      params: { state },
    }),

  submitCallback: (provider: string, redirectUrl: string) => {
    const providerKey = normalizeProviderForManagementPath(provider);
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: providerKey,
      redirect_url: redirectUrl,
    });
  },

  submitMagicLink: (state: string, magicLink: string) =>
    apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: 'anthropic',
      state,
      magic_link: magicLink,
    }),

  importClaudeSessionKey: (sessionKey: string, proxyUrl?: string) => {
    const payload: { session_key: string; proxy_url?: string } = { session_key: sessionKey };
    const normalizedProxyUrl = proxyUrl?.trim();
    if (normalizedProxyUrl) {
      payload.proxy_url = normalizedProxyUrl;
    }
    return apiClient.post<ClaudeSessionImportResponse>('/claude-desktop/session-key', payload);
  },

  createClaudeBrowserTicket: (state: string) =>
    apiClient.post<OAuthBrowserTicketResponse>(
      `/oauth-session/${encodeURIComponent(state)}/browser-ticket`
    ),
};
