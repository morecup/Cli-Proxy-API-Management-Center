import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { claudeDesktopRuntimeApi } from '../src/services/api/claudeDesktopRuntime';
import {
  controlPlaneHealth,
  controlPlaneIssues,
  startupErrorCategories,
} from '../src/features/dashboard/claudeDesktopRuntime';
import type {
  ClaudeDesktopRuntimeAccount,
  ClaudeDesktopRuntimeOperationResponse,
  ClaudeDesktopRuntimesResponse,
} from '../src/types/claudeDesktopRuntime';

const originalGet = apiClient.get;
const originalPost = apiClient.post;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.post = originalPost;
});

describe('Claude Desktop runtime management', () => {
  const tasks = {
    queries: 1,
    initialization_failed: 0,
    total: 3,
    running: 1,
    completed: 1,
    failed: 0,
    killed: 1,
    pending_events: 2,
    persistence_failed: 0,
    delivery_failed: 0,
  };
  const control = {
    active: 2,
    initialization_failed: 0,
    retiring: 1,
    failed: 0,
    placeholder_pending: 3,
    placeholder_storage_failed: false,
    placeholder_sweep_failed: false,
    placeholder_used_preserved: 1,
  };
  test('control failures remain visible independently of startup', () => {
    const failed = {
      ...control,
      initialization_failed: 1,
      failed: 2,
      placeholder_storage_failed: true,
      placeholder_sweep_failed: true,
    };
    expect(controlPlaneIssues(failed)).toEqual([
      'initialization_failed',
      'retirement_failed',
      'placeholder_storage_failed',
      'placeholder_sweep_failed',
    ]);
    expect(controlPlaneHealth(failed)).toBe('degraded');
  });
  test('task failures degrade the panel independently of main input success', () => {
    const failed = {
      ...tasks,
      initialization_failed: 1,
      failed: 1,
      persistence_failed: 1,
      delivery_failed: 1,
    };
    expect(controlPlaneIssues(control, failed)).toEqual([
      'agent_initialization_failed',
      'agent_execution_failed',
      'agent_persistence_failed',
      'agent_delivery_failed',
    ]);
    expect(controlPlaneHealth(control, failed)).toBe('degraded');
    expect(controlPlaneHealth(undefined, failed)).toBe('degraded');
    expect(controlPlaneHealth(control, tasks)).toBe('observed');
    expect(controlPlaneHealth(control, { ...tasks, pending_events: -1 })).toBe('unavailable');
    expect(controlPlaneHealth(control)).toBe('observed');
  });
  test('pending placeholders and retirement are not invented failures', () => {
    expect(controlPlaneIssues(control)).toEqual([]);
    expect(controlPlaneHealth(control)).toBe('observed');
  });
  test('failed worker-state read remains visible after successful registration and serialization', () => {
    const restored = JSON.parse(JSON.stringify({ ...control, worker_state_read_failed: 1 }));
    expect(restored.initialization_failed).toBe(0);
    expect(controlPlaneIssues(restored)).toEqual(['worker_state_read_failed']);
    expect(controlPlaneHealth(restored)).toBe('degraded');
    expect(controlPlaneHealth({ ...restored, worker_state_read_failed: 0 })).toBe('observed');
  });
  test('bridge transcript failure is distinct from worker retirement and survives unload', () => {
    const restored = JSON.parse(
      JSON.stringify({ ...control, active: 0, retiring: 0, bridge_transcript_failed: 1 })
    );
    expect(controlPlaneIssues(restored)).toEqual(['bridge_transcript_failed']);
    expect(controlPlaneHealth(restored)).toBe('degraded');
    expect(controlPlaneIssues({ ...restored, bridge_transcript_failed: 0 })).toEqual([]);
  });
  test('remote history failure is not hidden by successful worker registration', () => {
    const restored = JSON.parse(JSON.stringify({ ...control, worker_hydration_failed: 1 }));
    expect(controlPlaneIssues(restored)).toEqual(['worker_hydration_failed']);
    expect(controlPlaneHealth(restored)).toBe('degraded');
    expect(controlPlaneHealth({ ...restored, worker_hydration_failed: 0 })).toBe('observed');
  });
  test('a stopped runtime still displays its persisted cleanup failure', () => {
    const restored = JSON.parse(
      JSON.stringify({
        runtime_loaded: false,
        runtime_stopping: false,
        lifecycle_state: 'stopped',
        startup: { state: 'stopped' },
        control_plane: { ...control, active: 0, retiring: 0, failed: 1 },
      })
    );
    expect(restored.runtime_loaded).toBe(false);
    expect(controlPlaneHealth(restored.control_plane)).toBe('degraded');
    expect(controlPlaneIssues(restored.control_plane)).toEqual(['retirement_failed']);
  });
  test('missing and legacy recovery status do not claim healthy', () => {
    expect(controlPlaneHealth()).toBe('unavailable');
    expect(
      controlPlaneHealth({ active: 0, initialization_failed: 0, retiring: 0, failed: 0 })
    ).toBe('unavailable');
    expect(controlPlaneHealth({ ...control, placeholder_pending: -1 })).toBe('unavailable');
    expect(controlPlaneHealth({ ...control, placeholder_sweep_failed: undefined })).toBe(
      'unavailable'
    );
  });
  test('startup shows telemetry failures independently from HTTP failures', () => {
    const startup = {
      enabled: true,
      state: 'degraded',
      endpoint_count: 19,
      attempted: 19,
      completed: 19,
      failed: 0,
      skipped: 0,
      telemetry_error_category: 'update-event-projection-or-queue',
    };
    expect(startupErrorCategories(startup)).toEqual(['update-event-projection-or-queue']);
    expect(startupErrorCategories({ ...startup, last_error_category: 'upstream-5xx' })).toEqual([
      'upstream-5xx',
      'update-event-projection-or-queue',
    ]);
    expect(startupErrorCategories({ ...startup, telemetry_error_category: undefined })).toEqual([]);
  });
  test('feature refresh failure remains visible after successful application startup', () => {
    const startup = {
      enabled: true,
      state: 'degraded',
      endpoint_count: 19,
      attempted: 19,
      completed: 19,
      failed: 0,
      skipped: 0,
      feature_refresh_attempted: 2,
      feature_refresh_completed: 1,
      feature_refresh_failed: 1,
      feature_refresh_error: 'upstream-5xx',
    };
    expect(startupErrorCategories(startup)).toEqual(['upstream-5xx']);
    expect(startupErrorCategories({ ...startup, last_error_category: 'upstream-5xx' })).toEqual([
      'upstream-5xx',
    ]);
    expect(startupErrorCategories({ ...startup, feature_refresh_error: undefined })).toEqual([]);
  });
  test('uses encoded account runtime lifecycle routes', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const account: ClaudeDesktopRuntimeAccount = {
      auth_id: 'claude/account one',
      disabled: false,
      runtime: {
        auth_id_hash: 'account-hash',
        state: 'quarantined',
        can_promote: true,
        can_rollback: false,
        runtime_loaded: false,
        runtime_stopping: false,
        startup: {
          enabled: true,
          state: 'degraded',
          endpoint_count: 19,
          attempted: 12,
          completed: 11,
          failed: 1,
          skipped: 7,
          last_error_category: 'missing-session-key',
        },
      },
    };
    const list: ClaudeDesktopRuntimesResponse = { runtimes: [account] };
    const operation: ClaudeDesktopRuntimeOperationResponse = {
      status: 'ok',
      operation: 'promote',
      runtime: { ...account.runtime, state: 'active', can_promote: false },
    };
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return url.endsWith('/runtimes') ? list : account;
    }) as typeof apiClient.get;
    apiClient.post = (async (url: string) => {
      calls.push({ method: 'POST', url });
      return operation;
    }) as typeof apiClient.post;

    await claudeDesktopRuntimeApi.list();
    await claudeDesktopRuntimeApi.get(account.auth_id);
    await claudeDesktopRuntimeApi.promote(account.auth_id);
    await claudeDesktopRuntimeApi.rollback(account.auth_id);

    expect(calls).toEqual([
      { method: 'GET', url: '/claude-desktop/runtimes' },
      { method: 'GET', url: '/claude-desktop/runtimes/claude%2Faccount%20one' },
      { method: 'POST', url: '/claude-desktop/runtimes/claude%2Faccount%20one/promote' },
      { method: 'POST', url: '/claude-desktop/runtimes/claude%2Faccount%20one/rollback' },
    ]);
  });
});
