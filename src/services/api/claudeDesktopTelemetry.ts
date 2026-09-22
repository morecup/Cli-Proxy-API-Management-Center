import type { ClaudeDesktopTelemetryResponse } from '@/types/claudeDesktopTelemetry';
import { apiClient } from './client';

const BASE_PATH = '/claude-desktop/telemetry';

export const claudeDesktopTelemetryApi = {
  getStatus: () => apiClient.get<ClaudeDesktopTelemetryResponse>(BASE_PATH),
  flush: () => apiClient.post<ClaudeDesktopTelemetryResponse>(`${BASE_PATH}/flush`),
  retryDeadLetters: () => apiClient.post<ClaudeDesktopTelemetryResponse>(`${BASE_PATH}/retry-dead`),
};
