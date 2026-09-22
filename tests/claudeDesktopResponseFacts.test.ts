import { describe, expect, test } from 'bun:test';
import { summarizeClaudeDesktopTelemetry } from '../src/features/dashboard/claudeDesktopTelemetry';
import type { ClaudeDesktopTelemetryStatus } from '../src/types/claudeDesktopTelemetry';

describe('Claude Desktop response-fact diagnostics', () => {
  for (const status of [
    'awaiting-response-facts',
    'awaiting-sdk-prompt-facts',
    'fact-issue-storage-error',
  ]) {
    test(`a healthy runtime cannot hide another SDK runtime with ${status}`, () => {
      const ready: ClaudeDesktopTelemetryStatus = {
        enabled: true,
        required: true,
        state_path_configured: true,
        accounts: [],
        unsupported_endpoints: [],
        delivery_endpoints: [
          {
            role: 'sdk-event-logging',
            required: true,
            status: 'ready',
            transport_revision: 'synthetic',
            transport_protocol: 'http/1.1',
          },
        ],
      };
      const unresolved: ClaudeDesktopTelemetryStatus = {
        ...ready,
        delivery_endpoints: [
          {
            ...ready.delivery_endpoints![0],
            status,
            reason: 'retained telemetry fact scope cannot be restored or completed',
          },
        ],
      };
      for (const telemetry of [
        [ready, unresolved],
        [unresolved, ready],
      ]) {
        const summary = summarizeClaudeDesktopTelemetry({ telemetry });
        expect(summary.health).toBe('degraded');
        expect(summary.deliveryEndpoints[0]).toMatchObject({
          role: 'sdk-event-logging',
          status,
          reason: unresolved.delivery_endpoints![0].reason,
        });
      }
    });
  }

  test('an issue-only account stays degraded with empty queues and ready delivery', () => {
    const manager: ClaudeDesktopTelemetryStatus = {
      enabled: true,
      required: true,
      state_path_configured: true,
      unsupported_endpoints: [],
      delivery_endpoints: [
        {
          role: 'sdk-event-logging',
          required: true,
          status: 'ready',
          transport_revision: 'synthetic',
          transport_protocol: 'http/1.1',
        },
      ],
      accounts: [
        {
          auth_id_hash: 'synthetic-account-hash',
          profile_id: 'synthetic',
          desktop_version: '1.40609.0.0',
          endpoint_role: 'sdk-event-logging',
          health: 'degraded',
          pending: 0,
          sending: 0,
          dead_letters: 0,
          consecutive_failures: 0,
          queue_writable: true,
          fact_issues: {
            status: 'awaiting-sdk-prompt-facts',
            reason: '1 unresolved telemetry fact scope(s)',
            unresolved: 1,
            overflow: false,
            storage_error: false,
          },
        },
      ],
    };
    const summary = summarizeClaudeDesktopTelemetry({ telemetry: [manager] });
    expect(summary.health).toBe('degraded');
    expect(summary.pending + summary.sending + summary.deadLetters).toBe(0);
    expect(summary.accounts[0].fact_issues?.unresolved).toBe(1);
  });
});
