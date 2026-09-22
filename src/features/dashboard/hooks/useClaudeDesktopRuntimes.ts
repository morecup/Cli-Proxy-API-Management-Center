import { useCallback, useEffect, useState } from 'react';
import { claudeDesktopRuntimeApi } from '@/services/api';
import type { ApiError } from '@/types';
import type {
  ClaudeDesktopRuntimeOperationResponse,
  ClaudeDesktopRuntimesResponse,
} from '@/types/claudeDesktopRuntime';

export type ClaudeDesktopRuntimeOperation = {
  authId: string;
  kind: 'promote' | 'rollback';
} | null;

export function useClaudeDesktopRuntimes(enabled: boolean) {
  const [data, setData] = useState<ClaudeDesktopRuntimesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<ClaudeDesktopRuntimeOperation>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await claudeDesktopRuntimeApi.list());
      setSupported(true);
      setError(null);
    } catch (cause) {
      const apiError = cause as ApiError;
      if (apiError.status === 404) {
        setSupported(false);
        setError(null);
      } else {
        setError(apiError.message);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const runOperation = useCallback(
    async (authId: string, kind: 'promote' | 'rollback') => {
      if (!enabled || operation) return null;
      setOperation({ authId, kind });
      try {
        const response: ClaudeDesktopRuntimeOperationResponse =
          kind === 'promote'
            ? await claudeDesktopRuntimeApi.promote(authId)
            : await claudeDesktopRuntimeApi.rollback(authId);
        setData((current) =>
          current
            ? {
                runtimes: current.runtimes.map((entry) =>
                  entry.auth_id === authId ? { ...entry, runtime: response.runtime } : entry
                ),
              }
            : current
        );
        setError(null);
        return response;
      } catch (cause) {
        const apiError = cause as ApiError;
        setError(apiError.message);
        throw cause;
      } finally {
        setOperation(null);
      }
    },
    [enabled, operation]
  );

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    data,
    loading,
    supported,
    error,
    operation,
    refresh,
    promote: (authId: string) => runOperation(authId, 'promote'),
    rollback: (authId: string) => runOperation(authId, 'rollback'),
  };
}
