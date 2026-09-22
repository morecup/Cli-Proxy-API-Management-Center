// An isolated real-component route with synthetic data and no production API.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from '@/i18n';
import '@/styles/global.scss';
import { ClaudeDesktopRuntimePanel } from '@/features/dashboard/components/ClaudeDesktopRuntimePanel';
import { claudeDesktopRuntimeApi } from '@/services/api/claudeDesktopRuntime';
import type { ClaudeDesktopRuntimeStatus } from '@/types/claudeDesktopRuntime';

claudeDesktopRuntimeApi.sessions = async () => ({ sessions: [] });

const base: ClaudeDesktopRuntimeStatus = {
  auth_id_hash: 'synthetic-account-hash',
  state: 'active',
  can_promote: false,
  can_rollback: false,
  runtime_loaded: true,
  runtime_stopping: false,
  startup: {
    enabled: true,
    state: 'ready',
    endpoint_count: 19,
    attempted: 19,
    completed: 19,
    failed: 0,
    skipped: 0,
  },
  control_plane: {
    active: 1,
    initialization_failed: 0,
    retiring: 0,
    failed: 0,
    placeholder_pending: 0,
    placeholder_storage_failed: false,
    placeholder_sweep_failed: false,
    placeholder_used_preserved: 0,
    inbound_dispatched: 1,
    inbound_completed: 1,
    inbound_canceled: 0,
    inbound_execution_failed: 0,
  },
};

export function Fixture() {
  const [mode, setMode] = useState('failures');
  const [, setLanguage] = useState('en');
  const runtime: ClaudeDesktopRuntimeStatus = {
    ...base,
    ...(mode === 'legacy'
      ? {}
      : {
          agent_tasks: {
            queries: 1,
            initialization_failed: mode === 'failures' ? 1 : 0,
            total: 3,
            running: 1,
            completed: 1,
            failed: mode === 'failures' ? 1 : 0,
            killed: 0,
            pending_events: 2,
            persistence_failed: mode === 'failures' ? 1 : 0,
            delivery_failed: mode === 'failures' ? 1 : 0,
          },
        }),
  };
  return (
    <main style={{ maxWidth: 1100, margin: '24px auto', padding: 24 }}>
      <p>Offline synthetic fixture — no real account or capture.</p>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {['en', 'zh-CN', 'zh-TW', 'ru'].map((language) => (
          <button
            key={language}
            onClick={() => void i18n.changeLanguage(language).then(() => setLanguage(language))}
          >
            {language}
          </button>
        ))}
        {['failures', 'pending', 'legacy'].map((value) => (
          <button key={value} onClick={() => setMode(value)}>
            {value}
          </button>
        ))}
      </nav>
      <ClaudeDesktopRuntimePanel
        data={{
          runtimes: [
            {
              auth_id: 'synthetic-agent-account',
              label: 'Synthetic agent execution',
              disabled: false,
              runtime,
            },
          ],
        }}
        loading={false}
        error={null}
        operation={null}
        onRefresh={async () => {}}
        onPromote={async () => null}
        onRollback={async () => null}
      />
    </main>
  );
}

void i18n
  .changeLanguage('en')
  .then(() => createRoot(document.getElementById('root')!).render(<Fixture />));
