import { useState } from 'react';
import i18n from '../../src/i18n';
import { ClaudeDesktopTelemetryPanel } from '../../src/features/dashboard/components/ClaudeDesktopTelemetryPanel';
import type { ClaudeDesktopTelemetryResponse } from '../../src/types/claudeDesktopTelemetry';
import snapshot from './claudeDesktopObservedScope.json';
import '../../src/styles/global.scss';

// Generated from TestClaudeDesktopTelemetryFullObservedScope with an empty
// temporary account directory. This fixture has no API client or credentials.
export function ScopeFixture() {
  const [locale, setLocale] = useState('zh-CN');
  const [mode, setMode] = useState('union');
  const [refreshes, setRefreshes] = useState(0);
  const data = structuredClone(snapshot) as ClaudeDesktopTelemetryResponse;
  const manager = data.telemetry[0];
  if (mode === 'uncaptured') {
    manager.live_emitter_coverage!.uncaptured_executable_endpoint_events = [
      { endpoint_role: 'datadog-logs-browser', event_name: 'error', executable: true },
      ...[
        'tengu_chain_parallel_tr_recovered',
        'tengu_chain_parent_cycle',
        'tengu_chain_timestamp_fallback',
      ].map((event_name) => ({ endpoint_role: 'sdk-event-logging', event_name, executable: true })),
    ];
  }
  if (mode === 'legacy') {
    delete manager.telemetry_evidence?.observed_scope;
    delete manager.live_emitter_coverage?.endpoint_events;
  }
  if (mode === 'mixed') {
    data.telemetry.unshift({
      ...manager,
      profile_id: 'synthetic-complete-first',
      telemetry_evidence: undefined,
      observed_endpoints: [],
      live_emitter_coverage: {
        ...manager.live_emitter_coverage!,
        status: 'complete',
        observable_endpoint_event_count: 1,
        live_endpoint_event_count: 1,
      },
    });
  }
  return (
    <main style={{ maxWidth: 1200, margin: '24px auto', padding: 16 }}>
      <h1>Synthetic scope verification — no live account or API calls</h1>
      <label>
        Language{' '}
        <select
          aria-label="Language"
          value={locale}
          onChange={(event) => {
            setLocale(event.target.value);
            void i18n.changeLanguage(event.target.value);
          }}
        >
          {['zh-CN', 'zh-TW', 'en', 'ru'].map((language) => (
            <option key={language}>{language}</option>
          ))}
        </select>
      </label>{' '}
      <label>
        Fixture{' '}
        <select aria-label="Fixture" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="union">union</option>
          <option value="legacy">legacy</option>
          <option value="mixed">mixed</option>
          <option value="uncaptured">uncaptured</option>
        </select>
      </label>
      <p>Local refreshes: {refreshes}</p>
      <ClaudeDesktopTelemetryPanel
        data={data}
        error={null}
        loading={false}
        operation={null}
        onRefresh={async () => {
          setRefreshes((value) => value + 1);
        }}
        onFlush={async () => null}
        onRetryDeadLetters={async () => null}
      />
    </main>
  );
}
