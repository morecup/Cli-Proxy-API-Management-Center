import { afterEach, describe, expect, test } from 'bun:test';
import { summarizeClaudeDesktopTelemetry } from '../src/features/dashboard/claudeDesktopTelemetry';
import { apiClient } from '../src/services/api/client';
import { claudeDesktopTelemetryApi } from '../src/services/api/claudeDesktopTelemetry';
import type { ClaudeDesktopTelemetryResponse } from '../src/types/claudeDesktopTelemetry';
import observedScopeFixture from './fixtures/claudeDesktopObservedScope.json';

const originalGet = apiClient.get;
const originalPost = apiClient.post;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.post = originalPost;
});

describe('Claude Desktop telemetry management', () => {
  test('retains uncaptured production mappings without increasing captured coverage', () => {
    const response = structuredClone(observedScopeFixture) as ClaudeDesktopTelemetryResponse;
    const coverage = response.telemetry[0].live_emitter_coverage!;
    const original = coverage.live_endpoint_event_count;
    coverage.uncaptured_executable_endpoint_events = [
      {
        endpoint_role: 'sdk-event-logging',
        event_name: 'tengu_chain_timestamp_fallback',
        executable: true,
      },
    ];
    const summary = summarizeClaudeDesktopTelemetry(response);
    expect(summary.liveEmitterCoverage?.live_endpoint_event_count).toBe(original);
    expect(summary.liveEmitterCoverage?.observable_endpoint_event_count).toBe(303);
    expect(summary.liveEmitterCoverage?.uncaptured_executable_endpoint_events).toEqual(
      coverage.uncaptured_executable_endpoint_events
    );
  });
  test('preserves the real backend union without summing duplicate runtime universes', () => {
    const response = observedScopeFixture as ClaudeDesktopTelemetryResponse;
    const summary = summarizeClaudeDesktopTelemetry({
      telemetry: [...response.telemetry, ...response.telemetry],
    });
    const scope = summary.telemetryEvidence?.observed_scope;
    expect(scope?.policy).toBe('observations-not-completion');
    expect(scope?.sources.map((source) => source.endpoint_event_count)).toEqual([
      260, 65, 37, 55, 141, 64, 102, 121, 37, 129, 0, 9, 118,
    ]);
    expect(scope?.baseline_endpoint_event_count).toBe(260);
    expect(scope?.supplemental_endpoint_event_count).toBe(43);
    expect(summary.liveEmitterCoverage?.observable_event_name_count).toBe(231);
    expect(summary.liveEmitterCoverage?.observable_endpoint_event_count).toBe(303);
    expect(summary.liveEmitterCoverage?.endpoint_events).toHaveLength(303);
    expect(
      summary.liveEmitterCoverage?.endpoint_events?.filter((pair) => pair.executable)
    ).toHaveLength(42);
    expect(summary.telemetryEvidence?.corpus.event_name_count).toBe(189);
    expect(summary.telemetryEvidence?.corpus.flow_count).toBe(12109);
  });

  test('binds evidence and endpoint observations to the exact coverage runtime', () => {
    const evidence = (flow: number) => ({
      source_manifest_sha256: 'a'.repeat(64),
      capture_window: { first_captured_at: '', last_captured_at: '' },
      corpus: {
        flow_count: flow,
        http_scenario_count: 1,
        eligible_scenario_count: 1,
        telemetry_batch_flow_count: 1,
        event_count: 1,
        event_name_count: 1,
      },
      artifacts: [],
    });
    const endpoint = (flow: number) => ({
      role: 'segment',
      status: 'captured-delivery-enabled',
      transport_protocol: 'http/2',
      body_coverage: 'json-complete',
      flow_count: flow,
      scenario_count: 1,
      json_body_flow_count: flow,
      opaque_body_flow_count: 0,
      missing_body_flow_count: 0,
      reason: 'synthetic',
    });
    const base = {
      enabled: true,
      required: true,
      profile_id: 'same-id-different-snapshot',
      state_path_configured: true,
      accounts: [],
      unsupported_endpoints: [],
      live_emitter_coverage: {
        status: 'partial',
        captured_event_name_count: 231,
        live_event_name_count: 35,
        live_event_names: [],
        observable_endpoint_event_count: 303,
        live_endpoint_event_count: 42,
        renderer_runtime_metrics_source: 'unavailable',
        sdk_process_metrics_source: 'unavailable',
        transcript_size_source: 'caller-supplied',
      },
    };
    const first = {
      ...base,
      telemetry_evidence: evidence(10),
      observed_endpoints: [endpoint(10)],
      live_emitter_coverage: { ...base.live_emitter_coverage, live_endpoint_event_count: 200 },
    };
    const selected = {
      ...base,
      telemetry_evidence: evidence(12109),
      observed_endpoints: [endpoint(241)],
    };
    for (const telemetry of [
      [first, selected],
      [selected, first],
    ]) {
      const summary = summarizeClaudeDesktopTelemetry({ telemetry });
      expect(summary.telemetryEvidence).toBe(selected.telemetry_evidence);
      expect(summary.observedEndpoints).toEqual(selected.observed_endpoints);
      expect(summary.telemetryEvidenceProfileId).toBe(selected.profile_id);
      expect(summary.liveEmitterCoverage?.observable_endpoint_event_count).toBe(303);
    }
    const missing = summarizeClaudeDesktopTelemetry({
      telemetry: [
        first,
        {
          ...selected,
          telemetry_evidence: undefined,
          observed_endpoints: undefined,
        },
      ],
    });
    expect(missing.telemetryEvidence).toBeNull();
    expect(missing.observedEndpoints).toEqual([]);
  });

  test('legacy evidence without coverage remains one internally consistent snapshot', () => {
    const manager: ClaudeDesktopTelemetryResponse['telemetry'][number] = {
      enabled: false,
      required: false,
      profile_id: 'legacy',
      state_path_configured: false,
      accounts: [],
      unsupported_endpoints: [],
      telemetry_evidence: {
        source_manifest_sha256: 'b'.repeat(64),
        capture_window: { first_captured_at: '', last_captured_at: '' },
        corpus: {
          flow_count: 1,
          http_scenario_count: 1,
          eligible_scenario_count: 1,
          telemetry_batch_flow_count: 1,
          event_count: 1,
          event_name_count: 1,
        },
        artifacts: [],
      },
    };
    const summary = summarizeClaudeDesktopTelemetry({ telemetry: [manager] });
    expect(summary.telemetryEvidence).toBe(manager.telemetry_evidence!);
    expect(summary.telemetryEvidence?.observed_scope).toBeUndefined();
    expect(summary.telemetryEvidenceProfileId).toBe('legacy');
    expect(summary.liveEmitterCoverage).toBeNull();
  });

  test('does not hide a later incomplete runtime behind the first complete profile', () => {
    const complete = {
      enabled: true,
      required: true,
      profile_id: 'complete-profile',
      state_path_configured: true,
      accounts: [],
      unsupported_endpoints: [],
      live_emitter_coverage: {
        status: 'complete',
        captured_event_name_count: 10,
        live_event_name_count: 10,
        live_event_names: [],
        observable_endpoint_event_count: 12,
        live_endpoint_event_count: 12,
        renderer_runtime_metrics_source: 'unavailable',
        sdk_process_metrics_source: 'unavailable',
        transcript_size_source: 'caller-supplied',
      },
    };
    const incomplete = {
      ...complete,
      profile_id: 'partial-profile',
      live_emitter_coverage: {
        ...complete.live_emitter_coverage,
        status: 'partial',
        captured_event_name_count: 203,
        live_event_name_count: 23,
        observable_endpoint_event_count: 260,
        live_endpoint_event_count: 28,
      },
    };
    const unknown = { ...complete, live_emitter_coverage: undefined };
    for (const telemetry of [
      [complete, incomplete, unknown],
      [incomplete, complete, unknown],
    ]) {
      const summary = summarizeClaudeDesktopTelemetry({ telemetry });
      expect(summary.liveEmitterCoverage).toEqual(incomplete.live_emitter_coverage);
      expect(summary.liveEmitterCoverageProfileId).toBe('partial-profile');
      expect(summary.coverageRuntimeCount).toBe(3);
      expect(summary.missingCoverageRuntimeCount).toBe(1);
    }
  });

  test('keeps the degraded delivery endpoint and required flag across runtimes', () => {
    const base = {
      enabled: true,
      required: true,
      state_path_configured: true,
      accounts: [],
      unsupported_endpoints: [],
    };
    const ready = {
      ...base,
      delivery_endpoints: [
        {
          role: 'segment',
          required: true,
          status: 'ready',
          transport_revision: 'v1',
          transport_protocol: 'http/2',
        },
      ],
    };
    const missing = {
      ...base,
      delivery_endpoints: [
        { ...ready.delivery_endpoints[0], required: false, status: 'awaiting-enrollment-material' },
      ],
    };
    for (const telemetry of [
      [ready, missing],
      [missing, ready],
    ]) {
      const summary = summarizeClaudeDesktopTelemetry({ telemetry });
      expect(summary.deliveryEndpoints[0]?.status).toBe('awaiting-enrollment-material');
      expect(summary.deliveryEndpoints[0]?.required).toBe(true);
    }
  });

  test('uses the backend telemetry management routes', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const response: ClaudeDesktopTelemetryResponse = { telemetry: [] };
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return response;
    }) as typeof apiClient.get;
    apiClient.post = (async (url: string) => {
      calls.push({ method: 'POST', url });
      return response;
    }) as typeof apiClient.post;

    await claudeDesktopTelemetryApi.getStatus();
    await claudeDesktopTelemetryApi.flush();
    await claudeDesktopTelemetryApi.retryDeadLetters();

    expect(calls).toEqual([
      { method: 'GET', url: '/claude-desktop/telemetry' },
      { method: 'POST', url: '/claude-desktop/telemetry/flush' },
      { method: 'POST', url: '/claude-desktop/telemetry/retry-dead' },
    ]);
  });

  test('aggregates account queues and keeps disabled endpoint declarations', () => {
    const summary = summarizeClaudeDesktopTelemetry({
      telemetry: [
        {
          enabled: true,
          required: true,
          profile_id: 'claude-desktop/windows-x64/1.40609.0.0',
          desktop_version: '1.40609.0.0',
          transport_revision: 'desktop-event-logging/http2/no-user-agent/v1',
          transport_protocol: 'http/2',
          transport_evidence: 'current-wire-unverified',
          user_agent_policy: 'omit',
          state_path_configured: true,
          accounts: [
            {
              auth_id_hash: 'account-a',
              profile_id: 'claude-desktop/windows-x64/1.40609.0.0',
              desktop_version: '1.40609.0.0',
              endpoint_role: 'desktop-event-logging',
              health: 'healthy',
              pending: 2,
              sending: 1,
              dead_letters: 0,
              consecutive_failures: 0,
              queue_writable: true,
            },
            {
              auth_id_hash: 'account-b',
              profile_id: 'claude-desktop/windows-x64/1.40609.0.0',
              desktop_version: '1.40609.0.0',
              endpoint_role: 'desktop-event-logging',
              health: 'degraded',
              pending: 3,
              sending: 0,
              dead_letters: 4,
              consecutive_failures: 2,
              queue_writable: true,
            },
            {
              auth_id_hash: 'account-a',
              profile_id: 'claude-desktop/windows-x64/1.40609.0.0',
              desktop_version: '1.40609.0.0',
              endpoint_role: 'sdk-event-logging',
              health: 'healthy',
              pending: 7,
              sending: 2,
              dead_letters: 1,
              consecutive_failures: 1,
              queue_writable: true,
            },
          ],
          delivery_endpoints: [
            {
              role: 'renderer-event-logging',
              required: true,
              status: 'ready',
              transport_revision: 'desktop-event-logging/http2/no-user-agent/v1',
              transport_protocol: 'http/2',
              transport_evidence: 'current-wire-unverified',
              user_agent_policy: 'omit',
            },
            {
              role: 'sdk-event-logging',
              required: true,
              status: 'ready',
              transport_revision: 'sdk-event-logging/anthropic-node-http1/v1',
              transport_protocol: 'http/1.1',
              user_agent_policy: 'profile',
              auth_policy: 'oauth-bearer',
            },
            {
              role: 'segment',
              required: true,
              status: 'awaiting-enrollment-material',
              reason: 'runtime material has not been observed on an enrolled account',
              transport_revision: 'segment-v1',
              transport_protocol: 'http/2',
              user_agent_policy: 'profile',
              auth_policy: 'runtime-material',
            },
            {
              role: 'datadog-logs',
              telemetry_class: 'datadog-logs',
              required: true,
              status: 'ready',
              transport_revision: 'datadog-logs-v1',
              transport_protocol: 'http/1.1',
              user_agent_policy: 'profile',
              auth_policy: 'runtime-material',
            },
            {
              role: 'datadog-logs-browser',
              telemetry_class: 'datadog-logs',
              required: true,
              status: 'ready',
              transport_revision: 'datadog-logs-browser-v1',
              transport_protocol: 'http/1.1',
              user_agent_policy: 'profile',
              auth_policy: 'runtime-material',
            },
            {
              role: 'datadog-rum',
              required: true,
              status: 'ready',
              transport_revision: 'datadog-rum-v1',
              transport_protocol: 'http/2',
              user_agent_policy: 'profile',
              auth_policy: 'runtime-material',
            },
            {
              role: 'sentry',
              required: true,
              status: 'ready',
              transport_revision: 'sentry-v1',
              transport_protocol: 'http/2',
              user_agent_policy: 'profile',
              auth_policy: 'runtime-material',
            },
          ],
          telemetry_evidence: {
            source_manifest_sha256:
              '14641f99e8f9311d0c14022b6c008f68f8f9d559353bf1323a76ee293ef8982a',
            capture_window: {
              first_captured_at: '2026-08-29T21:00:41.744990-07:00',
              last_captured_at: '2026-08-31T21:14:19.092412-07:00',
            },
            corpus: {
              flow_count: 12109,
              http_scenario_count: 343,
              eligible_scenario_count: 454,
              telemetry_batch_flow_count: 777,
              event_count: 15769,
              event_name_count: 189,
            },
            artifacts: [
              {
                name: 'telemetry-profile',
                sha256: '5358414f73f7c21ab4217fad1d0f4be948ddcb3d3bd7611086f30e6d2b0dcd9c',
              },
            ],
          },
          observed_endpoints: [
            {
              role: 'desktop-event-logging',
              status: 'captured-delivery-enabled',
              transport_protocol: 'http/2',
              body_coverage: 'json-partial',
              flow_count: 532,
              scenario_count: 193,
              json_body_flow_count: 529,
              opaque_body_flow_count: 0,
              missing_body_flow_count: 3,
              event_count: 4068,
              maximum_batch_events: 50,
              maximum_batch_bytes: 115780,
              reason: 'captured and delivering',
            },
            {
              role: 'segment',
              status: 'captured-delivery-enabled',
              transport_protocol: 'http/2',
              body_coverage: 'json-complete',
              flow_count: 241,
              scenario_count: 153,
              json_body_flow_count: 241,
              opaque_body_flow_count: 0,
              missing_body_flow_count: 0,
              event_count: 925,
              reason: 'captured and delivering',
            },
            {
              role: 'sentry',
              status: 'captured-delivery-enabled',
              transport_protocol: 'http/2',
              body_coverage: 'sentry-envelope',
              flow_count: 21,
              scenario_count: 15,
              json_body_flow_count: 21,
              opaque_body_flow_count: 0,
              missing_body_flow_count: 0,
              event_count: 64,
              reason: 'captured and delivering',
            },
          ],
          live_emitter_coverage: {
            status: 'partial',
            coverage_policy: 'event-state-transition-observed-names',
            captured_event_name_count: 205,
            observable_event_name_count: 205,
            unmodeled_captured_event_count: 199,
            live_event_name_count: 6,
            declared_event_name_count: 8,
            observable_endpoint_event_count: 260,
            live_endpoint_event_count: 29,
            unmodeled_endpoint_event_count: 231,
            unverified_declared_event_names: ['declared_only_a', 'declared_only_b'],
            live_event_names: [
              'desktop_ccd_message_cycle_outcome',
              'desktop_ccd_message_cycle_start',
              'desktop_ccd_session_initialized',
              'tengu_api_cache_breakpoints',
              'tengu_api_retry',
              'tengu_api_success',
            ],
            renderer_runtime_metrics_source: 'unavailable',
            sdk_process_metrics_source: 'unavailable',
            transcript_size_source: 'caller-supplied',
          },
          transport_fidelity: {
            client_hello_status: 'captured-current-wire',
            client_hello_preset: 'chromium-148-v140609',
            observed_chromium_version: '148.0.7778.280',
            http2_stream_mode: 'multiplexed',
          },
          unsupported_endpoints: [
            {
              role: 'intercom-metrics',
              status: 'excluded-non-claude-telemetry',
              reason: 'not a Claude telemetry role',
            },
          ],
        },
      ],
    });

    expect(summary).toMatchObject({
      enabled: true,
      required: true,
      health: 'degraded',
      pending: 12,
      sending: 3,
      deadLetters: 5,
      consecutiveFailures: 3,
      desktopVersion: '1.40609.0.0',
      transportProtocol: 'http/2',
      transportEvidence: 'current-wire-unverified',
      userAgentPolicy: 'omit',
      statePathConfigured: true,
    });
    expect(summary.accounts.map((account) => account.endpoint_role)).toEqual([
      'desktop-event-logging',
      'desktop-event-logging',
      'sdk-event-logging',
    ]);
    expect(summary.deliveryEndpoints).toMatchObject([
      {
        role: 'datadog-logs',
        telemetry_class: 'datadog-logs',
        status: 'ready',
        transport_protocol: 'http/1.1',
      },
      {
        role: 'datadog-logs-browser',
        telemetry_class: 'datadog-logs',
        status: 'ready',
        transport_protocol: 'http/1.1',
      },
      { role: 'datadog-rum', status: 'ready', transport_protocol: 'http/2' },
      { role: 'renderer-event-logging', transport_protocol: 'http/2' },
      {
        role: 'sdk-event-logging',
        status: 'ready',
        transport_protocol: 'http/1.1',
        auth_policy: 'oauth-bearer',
      },
      {
        role: 'segment',
        status: 'awaiting-enrollment-material',
        reason: 'runtime material has not been observed on an enrolled account',
      },
      { role: 'sentry', status: 'ready', transport_protocol: 'http/2' },
    ]);
    expect(summary.telemetryEvidence?.corpus).toMatchObject({
      flow_count: 12109,
      http_scenario_count: 343,
      event_count: 15769,
    });
    expect(summary.observedEndpoints.map((endpoint) => [endpoint.role, endpoint.status])).toEqual([
      ['desktop-event-logging', 'captured-delivery-enabled'],
      ['segment', 'captured-delivery-enabled'],
      ['sentry', 'captured-delivery-enabled'],
    ]);
    expect(summary.liveEmitterCoverage).toMatchObject({
      status: 'partial',
      coverage_policy: 'event-state-transition-observed-names',
      captured_event_name_count: 205,
      observable_event_name_count: 205,
      unmodeled_captured_event_count: 199,
      live_event_name_count: 6,
      declared_event_name_count: 8,
      observable_endpoint_event_count: 260,
      live_endpoint_event_count: 29,
      unmodeled_endpoint_event_count: 231,
      unverified_declared_event_names: ['declared_only_a', 'declared_only_b'],
      renderer_runtime_metrics_source: 'unavailable',
      sdk_process_metrics_source: 'unavailable',
    });
    expect(summary.transportFidelity).toEqual({
      client_hello_status: 'captured-current-wire',
      client_hello_preset: 'chromium-148-v140609',
      observed_chromium_version: '148.0.7778.280',
      http2_stream_mode: 'multiplexed',
    });
    expect(summary.unsupportedEndpoints.map((endpoint) => endpoint.role)).toEqual([
      'intercom-metrics',
    ]);
  });

  test('reports required telemetry without durable state as unhealthy', () => {
    const summary = summarizeClaudeDesktopTelemetry({
      telemetry: [
        {
          enabled: false,
          required: true,
          state_path_configured: false,
          accounts: [],
          unsupported_endpoints: [],
        },
      ],
    });

    expect(summary.health).toBe('unhealthy');
    expect(summary.statePathConfigured).toBe(false);
    expect(summary.telemetryEvidence).toBeNull();
    expect(summary.observedEndpoints).toEqual([]);
    expect(summary.liveEmitterCoverage).toBeNull();
    expect(summary.transportFidelity).toBeNull();
  });

  test('reports missing required auxiliary material as degraded', () => {
    const summary = summarizeClaudeDesktopTelemetry({
      telemetry: [
        {
          enabled: true,
          required: true,
          state_path_configured: true,
          accounts: [],
          delivery_endpoints: [
            {
              role: 'segment',
              required: true,
              status: 'awaiting-enrollment-material',
              reason: 'encrypted runtime material is unavailable',
              transport_revision: 'segment-v1',
              transport_protocol: 'http/2',
            },
          ],
          unsupported_endpoints: [],
        },
      ],
    });

    expect(summary.health).toBe('degraded');
    expect(summary.deliveryEndpoints[0]).toMatchObject({
      role: 'segment',
      status: 'awaiting-enrollment-material',
      reason: 'encrypted runtime material is unavailable',
    });
  });
});
