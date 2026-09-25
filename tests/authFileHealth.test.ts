import { describe, expect, test } from 'bun:test';
import { normalizeAuthFilesResponse } from '../src/services/api/authFiles';
import { getAuthFileHealthState, isSevereAuthFileHealth } from '../src/features/authFiles/health';
import { isProblemAuthFile } from '../src/features/authFiles/constants';

const observation = {
  state: 'credential_revoked',
  message: 'OAuth access token has been revoked.',
  http_status: 401,
  first_observed_at: '2026-09-24T10:47:16Z',
  last_observed_at: '2026-09-24T10:51:40Z',
  source: 'historical_log',
};

const normalize = (health = observation, extra = {}) =>
  normalizeAuthFilesResponse({
    files: [
      {
        name: 'claude.json',
        disabled: false,
        status: 'active',
        credential_health: health,
        ...extra,
      },
    ],
  }).files[0];

describe('credential health visibility', () => {
  test('an enabled card with a historical revoked token remains a visible problem', () => {
    const file = normalize(observation, { runtime_state: 'quarantined' });
    expect(file.disabled).toBe(false);
    expect(getAuthFileHealthState(file)).toBe('credential_revoked');
    expect(file.credentialHealth?.firstObservedAt).toBe('2026-09-24T10:47:16.000Z');
    expect(file.credentialHealth?.source).toBe('historical_log');
    expect(isSevereAuthFileHealth(file)).toBe(true);
    expect(isProblemAuthFile(file)).toBe(true);
  });

  test('quarantine and ordinary permission errors are not labelled as an account ban', () => {
    const isolated = normalizeAuthFilesResponse({
      files: [{ name: 'a', runtime_state: 'quarantined' }],
    }).files[0];
    expect(getAuthFileHealthState(isolated)).toBe('runtime_quarantined');
    expect(isProblemAuthFile(isolated)).toBe(true);
    const denied = normalize({ ...observation, state: 'permission_denied', http_status: 403 });
    expect(getAuthFileHealthState(denied)).toBe('permission_denied');
    expect(isSevereAuthFileHealth(denied)).toBe(false);
  });

  test('resolved observations retain their timestamps without remaining active problems', () => {
    const file = normalize(
      { ...observation, state: 'rate_limited', http_status: 429 },
      {
        credential_health: {
          ...observation,
          state: 'rate_limited',
          http_status: 429,
          resolved_at: '2026-09-24T11:00:00Z',
        },
      }
    );
    expect(file.credentialHealth?.resolvedAt).toBe('2026-09-24T11:00:00.000Z');
    expect(getAuthFileHealthState(file)).toBeUndefined();
    expect(isProblemAuthFile(file)).toBe(false);
  });

  test('invalid observations cannot produce a ban badge or invalid timestamp', () => {
    expect(normalize({ ...observation, state: 'unknown' }).credentialHealth).toBeUndefined();
    expect(
      normalize({ ...observation, first_observed_at: 'bad-date' }).credentialHealth
    ).toBeUndefined();
    expect(normalize({ ...observation, http_status: 500 }).credentialHealth).toBeUndefined();
  });

  test('deliberately disabled files keep the evidence but remain excluded from bulk problem deletion', () => {
    const file = normalize(observation, { disabled: true });
    expect(getAuthFileHealthState(file)).toBe('credential_revoked');
    expect(isProblemAuthFile(file)).toBe(false);
  });
});
