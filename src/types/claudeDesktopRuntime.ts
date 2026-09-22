export type ClaudeDesktopEnrollmentState =
  'active' | 'disabled' | 'quarantined' | 'provisioning' | 'ready' | 'retired' | string;

export interface ClaudeDesktopStartupStatus {
  enabled: boolean;
  state: 'stopped' | 'starting' | 'ready' | 'degraded' | 'missing-session-key' | string;
  endpoint_count: number;
  attempted: number;
  completed: number;
  failed: number;
  skipped: number;
  last_error_category?: string;
  telemetry_error_category?: string;
  feature_refresh_attempted?: number;
  feature_refresh_completed?: number;
  feature_refresh_failed?: number;
  feature_refresh_error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ClaudeDesktopRuntimeStatus {
  auth_id_hash: string;
  state?: ClaudeDesktopEnrollmentState;
  approved_revision?: string;
  observed_revision?: string;
  machine_profile_id?: string;
  desktop_profile?: string;
  previous_revision?: string;
  previous_machine_profile_id?: string;
  previous_desktop_profile?: string;
  observed_machine_profile_id?: string;
  observed_desktop_profile?: string;
  quarantine_reason?: string;
  can_promote: boolean;
  can_rollback: boolean;
  runtime_loaded: boolean;
  runtime_stopping: boolean;
  lifecycle_state?: 'running' | 'stopped' | 'quarantined' | string;
  lifecycle_generation?: number;
  app_session_hash?: string;
  previous_exit?: 'clean' | 'unclean' | 'quarantined' | string;
  recovered_unclean_exit?: boolean;
  started_at?: string;
  stopped_at?: string;
  startup: ClaudeDesktopStartupStatus;
  control_plane?: ClaudeDesktopControlPlaneStatus;
  agent_tasks?: ClaudeDesktopAgentTaskHealth;
}

export interface ClaudeDesktopAgentTaskHealth {
  queries: number;
  initialization_failed: number;
  total: number;
  running: number;
  completed: number;
  failed: number;
  killed: number;
  pending_events: number;
  persistence_failed: number;
  delivery_failed: number;
}

export interface ClaudeDesktopControlPlaneStatus {
  active: number;
  initialization_failed: number;
  worker_state_read_failed?: number;
  worker_hydration_failed?: number;
  retiring: number;
  failed: number;
  bridge_transcript_failed?: number;
  placeholder_pending?: number;
  placeholder_storage_failed?: boolean;
  placeholder_sweep_failed?: boolean;
  placeholder_used_preserved?: number;
  inbound_dispatched?: number;
  inbound_failed?: number;
  inbound_unhandled?: number;
  inbound_completed?: number;
  inbound_canceled?: number;
  inbound_execution_failed?: number;
}

export interface ClaudeDesktopSession {
  id: string;
  generation?: string;
  sdk_session_id?: string;
  query_id?: string;
  running: boolean;
  created_at: string;
  local_conversation?: boolean;
  remote_state?: 'pending' | 'attached' | 'detached';
}

export interface ClaudeDesktopRemoteStart {
  remote_session_id: string;
  folder: string;
  model: string;
}

export interface ClaudeDesktopRuntimeAccount {
  auth_id: string;
  auth_index?: string;
  label?: string;
  disabled: boolean;
  runtime: ClaudeDesktopRuntimeStatus;
}

export interface ClaudeDesktopRuntimesResponse {
  runtimes: ClaudeDesktopRuntimeAccount[];
}

export interface ClaudeDesktopRuntimeOperationResponse {
  status: 'ok' | 'error';
  operation: 'promote' | 'rollback';
  error?: string;
  runtime: ClaudeDesktopRuntimeStatus;
}

export interface ClaudeDesktopLocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

export interface ClaudeDesktopLocalView {
  initial_message?: string;
  session: ClaudeDesktopSession;
  model: string;
  folder: string;
  messages: ClaudeDesktopLocalMessage[];
  busy: boolean;
  last_error?: string;
  prompt_id?: string;
  assistant_id?: string;
}

export interface ClaudeDesktopUIObservation {
  kind:
    | 'input_ready'
    | 'first_text'
    | 'switch_started'
    | 'switch_painted'
    | 'sidebar_session_opened'
    | 'transcript_open_settled'
    | 'pending_turn_stuck_idle'
    | 'sessions_watch_demand_suppressed'
    | 'sessions_watch_demand_restored';
  view_id: string;
  session_id?: string;
  expected_generation?: string;
  prompt_id?: string;
  assistant_id?: string;
  switch_id?: string;
  metrics: Record<string, number>;
  was_hidden: boolean;
  cache_hit: boolean;
}
