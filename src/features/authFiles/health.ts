import type { AuthFileItem, CredentialHealth, CredentialHealthState } from '@/types/authFile';

const HEALTH_STATES = new Set<CredentialHealthState>([
  'credential_revoked',
  'account_disabled',
  'organization_disabled',
  'authentication_failed',
  'permission_denied',
  'rate_limited',
]);

const timestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1970
    ? date.toISOString()
    : undefined;
};

export function normalizeCredentialHealth(value: unknown): CredentialHealth | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entry = value as Record<string, unknown>;
  const state = entry.state as CredentialHealthState;
  const firstObservedAt = timestamp(entry.first_observed_at ?? entry.firstObservedAt);
  const lastObservedAt = timestamp(entry.last_observed_at ?? entry.lastObservedAt);
  const httpStatus = entry.http_status ?? entry.httpStatus;
  if (
    !HEALTH_STATES.has(state) ||
    !firstObservedAt ||
    !lastObservedAt ||
    lastObservedAt < firstObservedAt ||
    (httpStatus !== 401 && httpStatus !== 403 && httpStatus !== 429) ||
    (entry.source !== 'upstream_response' && entry.source !== 'historical_log')
  ) {
    return undefined;
  }
  return {
    state,
    message: typeof entry.message === 'string' ? entry.message : '',
    httpStatus,
    firstObservedAt,
    lastObservedAt,
    resolvedAt: timestamp(entry.resolved_at ?? entry.resolvedAt),
    source: entry.source,
  };
}

export function getAuthFileHealthState(
  file: AuthFileItem
): CredentialHealthState | 'runtime_quarantined' | 'unavailable' | undefined {
  if (file.credentialHealth && !file.credentialHealth.resolvedAt) {
    return file.credentialHealth.state;
  }
  if (file.runtimeState === 'quarantined') return 'runtime_quarantined';
  if (file.unavailable === true || file.status === 'error') return 'unavailable';
  return undefined;
}

export function isSevereAuthFileHealth(file: AuthFileItem): boolean {
  const state = getAuthFileHealthState(file);
  return (
    state === 'credential_revoked' ||
    state === 'account_disabled' ||
    state === 'organization_disabled' ||
    state === 'runtime_quarantined'
  );
}
