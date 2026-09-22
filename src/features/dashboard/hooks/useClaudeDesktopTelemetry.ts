import { useCallback, useEffect, useState } from 'react';
import { claudeDesktopTelemetryApi } from '@/services/api';
import type { ApiError } from '@/types';
import type { ClaudeDesktopTelemetryResponse } from '@/types/claudeDesktopTelemetry';

type TelemetryOperation = 'flush' | 'retry-dead' | null;

export function useClaudeDesktopTelemetry(enabled: boolean) {
  const [data, setData] = useState<ClaudeDesktopTelemetryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<TelemetryOperation>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await claudeDesktopTelemetryApi.getStatus());
      setError(null);
      setSupported(true);
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
    async (nextOperation: Exclude<TelemetryOperation, null>) => {
      if (!enabled || operation) return null;
      setOperation(nextOperation);
      try {
        const response =
          nextOperation === 'flush'
            ? await claudeDesktopTelemetryApi.flush()
            : await claudeDesktopTelemetryApi.retryDeadLetters();
        setData(response);
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
    error,
    loading,
    supported,
    operation,
    refresh,
    flush: () => runOperation('flush'),
    retryDeadLetters: () => runOperation('retry-dead'),
  };
}
