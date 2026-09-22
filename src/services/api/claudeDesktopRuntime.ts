import type {
  ClaudeDesktopRuntimeAccount,
  ClaudeDesktopRuntimeOperationResponse,
  ClaudeDesktopRuntimesResponse,
  ClaudeDesktopSession,
  ClaudeDesktopRemoteStart,
  ClaudeDesktopLocalView,
  ClaudeDesktopUIObservation,
} from '@/types/claudeDesktopRuntime';
import { apiClient } from './client';

const BASE_PATH = '/claude-desktop/runtimes';
const runtimePath = (authId: string) => `${BASE_PATH}/${encodeURIComponent(authId)}`;

export const claudeDesktopRuntimeApi = {
  createLocal: (authId: string, body: { model: string; folder: string; message: string }) =>
    apiClient.post<ClaudeDesktopLocalView>(`${runtimePath(authId)}/sessions/local`, body),
  getLocal: (authId: string, sessionId: string) =>
    apiClient.get<ClaudeDesktopLocalView>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/local`
    ),
  sendLocal: (authId: string, sessionId: string, generation: string, message: string) =>
    apiClient.post<ClaudeDesktopLocalView>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { expected_generation: generation, message },
      { timeout: 0 }
    ),
  resumeLocal: (authId: string, sessionId: string, generation: string) =>
    apiClient.post<ClaudeDesktopLocalView>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/local-resume`,
      { expected_generation: generation }
    ),
  observeUI: (authId: string, body: ClaudeDesktopUIObservation) =>
    apiClient.post<void>(`${runtimePath(authId)}/ui-observations`, body),
  list: () => apiClient.get<ClaudeDesktopRuntimesResponse>(BASE_PATH),
  get: (authId: string) => apiClient.get<ClaudeDesktopRuntimeAccount>(runtimePath(authId)),
  promote: (authId: string) =>
    apiClient.post<ClaudeDesktopRuntimeOperationResponse>(`${runtimePath(authId)}/promote`),
  rollback: (authId: string) =>
    apiClient.post<ClaudeDesktopRuntimeOperationResponse>(`${runtimePath(authId)}/rollback`),
  sessions: (authId: string) =>
    apiClient.get<{ sessions: ClaudeDesktopSession[] }>(`${runtimePath(authId)}/sessions`),
  checkSessionHeartbeats: (authId: string) =>
    apiClient.post<void>(`${runtimePath(authId)}/sessions/heartbeat-check`),
  startRemote: (authId: string, body: ClaudeDesktopRemoteStart) =>
    apiClient.post<{ session: ClaudeDesktopSession }>(
      `${runtimePath(authId)}/sessions/remote`,
      body
    ),
  attachRemote: (authId: string, sessionId: string, queryId: string) =>
    apiClient.post<{ session: ClaudeDesktopSession }>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/attach`,
      { expected_query_id: queryId }
    ),
  stopSession: (authId: string, sessionId: string, queryId: string) =>
    apiClient.post<{ session: ClaudeDesktopSession }>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/stop`,
      { expected_query_id: queryId }
    ),
  resumeSession: (authId: string, sessionId: string, generation: string) =>
    apiClient.post<{ session: ClaudeDesktopSession }>(
      `${runtimePath(authId)}/sessions/${encodeURIComponent(sessionId)}/resume`,
      { expected_generation: generation }
    ),
};
