import type {
  ClaudeDesktopAgentTaskHealth,
  ClaudeDesktopControlPlaneStatus,
  ClaudeDesktopStartupStatus,
} from '@/types/claudeDesktopRuntime';

export function controlPlaneIssues(
  control?: ClaudeDesktopControlPlaneStatus,
  tasks?: ClaudeDesktopAgentTaskHealth
): string[] {
  const issues = [];
  if ((tasks?.initialization_failed ?? 0) > 0) issues.push('agent_initialization_failed');
  if ((tasks?.failed ?? 0) > 0) issues.push('agent_execution_failed');
  if ((tasks?.persistence_failed ?? 0) > 0) issues.push('agent_persistence_failed');
  if ((tasks?.delivery_failed ?? 0) > 0) issues.push('agent_delivery_failed');
  if (!control) return issues;
  if (control.initialization_failed > 0) issues.push('initialization_failed');
  if ((control.worker_state_read_failed ?? 0) > 0) issues.push('worker_state_read_failed');
  if ((control.worker_hydration_failed ?? 0) > 0) issues.push('worker_hydration_failed');
  if (control.failed > 0) issues.push('retirement_failed');
  if ((control.bridge_transcript_failed ?? 0) > 0) issues.push('bridge_transcript_failed');
  if (control.placeholder_storage_failed) issues.push('placeholder_storage_failed');
  if (control.placeholder_sweep_failed) issues.push('placeholder_sweep_failed');
  if ((control.inbound_failed ?? 0) > 0) issues.push('inbound_failed');
  if ((control.inbound_unhandled ?? 0) > 0) issues.push('inbound_unhandled');
  if ((control.inbound_execution_failed ?? 0) > 0) issues.push('inbound_execution_failed');
  return issues;
}

export function controlPlaneHealth(
  control?: ClaudeDesktopControlPlaneStatus,
  tasks?: ClaudeDesktopAgentTaskHealth
) {
  if (controlPlaneIssues(control, tasks).length > 0) return 'degraded';
  if (
    tasks &&
    ![
      tasks.queries,
      tasks.initialization_failed,
      tasks.total,
      tasks.running,
      tasks.completed,
      tasks.failed,
      tasks.killed,
      tasks.pending_events,
      tasks.persistence_failed,
      tasks.delivery_failed,
    ].every((value) => Number.isSafeInteger(value) && value >= 0)
  )
    return 'unavailable';
  if (
    !control ||
    ![
      control.active,
      control.initialization_failed,
      control.retiring,
      control.failed,
      control.placeholder_pending,
      control.placeholder_used_preserved,
    ].every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
    typeof control.placeholder_storage_failed !== 'boolean' ||
    typeof control.placeholder_sweep_failed !== 'boolean'
  )
    return 'unavailable';
  return 'observed';
}

export function startupErrorCategories(startup: ClaudeDesktopStartupStatus): string[] {
  return [
    ...new Set([
      startup.last_error_category,
      startup.telemetry_error_category,
      startup.feature_refresh_error,
    ]),
  ].filter((category): category is string => Boolean(category));
}
