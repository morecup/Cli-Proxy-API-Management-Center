import { useState } from 'react';
import { ClaudeDesktopRuntimePanel } from '@/features/dashboard/components/ClaudeDesktopRuntimePanel';
import type { ClaudeDesktopRuntimesResponse } from '@/types/claudeDesktopRuntime';

// A local-only visual fixture: no API client, credentials or live account actions.
const data: ClaudeDesktopRuntimesResponse = {
  runtimes: ['telemetry-only', 'http-and-telemetry'].map((variant, index) => ({
    auth_id: `synthetic-${variant}`,
    label: `Synthetic: ${variant}`,
    disabled: false,
    runtime: {
      auth_id_hash: `synthetic-${index}`,
      state: 'active',
      can_promote: false,
      can_rollback: false,
      runtime_loaded: true,
      runtime_stopping: false,
      lifecycle_state: 'running',
      lifecycle_generation: 1,
      previous_exit: 'clean',
      control_plane: index
        ? {
            active: 2,
            initialization_failed: 1,
            retiring: 1,
            failed: 2,
            bridge_transcript_failed: 1,
            worker_state_read_failed: 1,
            worker_hydration_failed: 1,
            placeholder_pending: 3,
            placeholder_storage_failed: true,
            placeholder_sweep_failed: true,
            placeholder_used_preserved: 4,
            inbound_dispatched: 5,
            inbound_completed: 2,
            inbound_canceled: 1,
            inbound_failed: 1,
            inbound_unhandled: 1,
            inbound_execution_failed: 2,
          }
        : undefined,
      startup: {
        enabled: true,
        state: 'degraded',
        endpoint_count: 19,
        attempted: 19,
        completed: 19 - index,
        failed: index,
        skipped: 0,
        last_error_category: index ? 'upstream-5xx' : undefined,
        telemetry_error_category: 'update-event-projection-or-queue',
      },
    },
  })),
};

export function StartupDiagnosticsFixture() {
  const [refreshes, setRefreshes] = useState(0);
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: 'auto' }}>
      <p>Synthetic QA only — no live accounts. Refreshes: {refreshes}</p>
      <ClaudeDesktopRuntimePanel
        data={data}
        error={null}
        loading={false}
        operation={null}
        onRefresh={async () => {
          setRefreshes((value) => value + 1);
        }}
        onPromote={async () => null}
        onRollback={async () => null}
      />
    </main>
  );
}
