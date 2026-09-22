export type ClaudeDesktopTelemetryHealth = 'healthy' | 'degraded' | 'unhealthy';

export interface ClaudeDesktopTelemetryEndpointStatus {
  role: string;
  status: string;
  reason?: string;
}

export interface ClaudeDesktopTelemetryDeliveryEndpointStatus {
  role: string;
  telemetry_class?: string;
  required: boolean;
  status: string;
  reason?: string;
  transport_revision: string;
  transport_protocol: string;
  transport_evidence?: string;
  user_agent_policy?: string;
  auth_policy?: string;
}

export interface ClaudeDesktopTelemetryEvidenceArtifact {
  name: string;
  sha256: string;
}

export interface ClaudeDesktopTelemetryEvidence {
  source_manifest_sha256: string;
  capture_window: {
    first_captured_at: string;
    last_captured_at: string;
  };
  corpus: {
    flow_count: number;
    http_scenario_count: number;
    eligible_scenario_count: number;
    telemetry_batch_flow_count: number;
    event_count: number;
    event_name_count: number;
  };
  artifacts: ClaudeDesktopTelemetryEvidenceArtifact[];
  observed_scope?: ClaudeDesktopTelemetryObservedScope;
}

export interface ClaudeDesktopTelemetryObservedScope {
  schema_version: number;
  policy: 'observations-not-completion' | string;
  union_sha256: string;
  baseline_endpoint_event_count: number;
  baseline_event_name_count: number;
  supplemental_endpoint_event_count: number;
  supplemental_event_name_count: number;
  sources: Array<{
    kind: 'baseline' | 'supplement';
    artifact: string;
    sha256: string;
    endpoint_event_count: number;
  }>;
}

export interface ClaudeDesktopTelemetryObservedEndpointStatus {
  role: string;
  telemetry_class?: string;
  status: string;
  transport_protocol: string;
  body_coverage: string;
  flow_count: number;
  scenario_count: number;
  json_body_flow_count: number;
  opaque_body_flow_count: number;
  missing_body_flow_count: number;
  event_count?: number;
  maximum_batch_events?: number;
  maximum_batch_bytes?: number;
  reason: string;
}

export interface ClaudeDesktopTelemetryLiveEmitterCoverage {
  status: 'partial' | 'complete' | string;
  coverage_policy?: string;
  captured_event_name_count: number;
  observable_event_name_count?: number;
  unmodeled_captured_event_count?: number;
  live_event_name_count: number;
  live_event_names: string[];
  declared_event_name_count?: number;
  observable_endpoint_event_count?: number;
  live_endpoint_event_count?: number;
  unmodeled_endpoint_event_count?: number;
  unverified_declared_event_names?: string[];
  uncaptured_executable_endpoint_events?: Array<{
    endpoint_role: string;
    event_name: string;
    executable: boolean;
  }>;
  endpoint_events?: Array<{
    endpoint_role: string;
    event_name: string;
    executable: boolean;
  }>;
  renderer_runtime_metrics_source: 'unavailable' | 'desktop-companion' | string;
  sdk_process_metrics_source: 'unavailable' | 'provided-snapshot' | string;
  transcript_size_source: 'caller-supplied' | string;
}

export interface ClaudeDesktopTelemetryTransportFidelity {
  client_hello_status: 'approximate' | 'captured-current-wire' | 'exact' | string;
  client_hello_preset: string;
  observed_chromium_version: string;
  http2_stream_mode: 'multiplexed' | string;
}

export interface ClaudeDesktopTelemetryAccountStatus {
  fact_issues?: {
    status: string;
    reason: string;
    unresolved: number;
    overflow: boolean;
    storage_error: boolean;
  };
  auth_id_hash: string;
  profile_id: string;
  desktop_version: string;
  endpoint_role: string;
  health: ClaudeDesktopTelemetryHealth;
  pending: number;
  sending: number;
  dead_letters: number;
  consecutive_failures: number;
  last_success_at?: string;
  last_failure_at?: string;
  last_error?: string;
  next_attempt_at?: string;
  queue_writable: boolean;
}

export interface ClaudeDesktopTelemetryStatus {
  enabled: boolean;
  required: boolean;
  profile_id?: string;
  desktop_version?: string;
  transport_revision?: string;
  transport_protocol?: string;
  transport_evidence?: string;
  user_agent_policy?: string;
  state_path_configured: boolean;
  accounts: ClaudeDesktopTelemetryAccountStatus[];
  delivery_endpoints?: ClaudeDesktopTelemetryDeliveryEndpointStatus[];
  telemetry_evidence?: ClaudeDesktopTelemetryEvidence;
  observed_endpoints?: ClaudeDesktopTelemetryObservedEndpointStatus[];
  unsupported_endpoints: ClaudeDesktopTelemetryEndpointStatus[];
  live_emitter_coverage?: ClaudeDesktopTelemetryLiveEmitterCoverage;
  transport_fidelity?: ClaudeDesktopTelemetryTransportFidelity;
}

export interface ClaudeDesktopTelemetryResponse {
  status?: 'ok' | 'error';
  error?: string;
  retried?: number;
  telemetry: ClaudeDesktopTelemetryStatus[];
}

export interface ClaudeDesktopTelemetrySummary {
  enabled: boolean;
  required: boolean;
  profileId: string;
  desktopVersion: string;
  transportRevision: string;
  transportProtocol: string;
  transportEvidence: string;
  userAgentPolicy: string;
  statePathConfigured: boolean;
  health: ClaudeDesktopTelemetryHealth | 'disabled';
  pending: number;
  sending: number;
  deadLetters: number;
  consecutiveFailures: number;
  accounts: ClaudeDesktopTelemetryAccountStatus[];
  deliveryEndpoints: ClaudeDesktopTelemetryDeliveryEndpointStatus[];
  telemetryEvidence: ClaudeDesktopTelemetryEvidence | null;
  telemetryEvidenceProfileId: string;
  observedEndpoints: ClaudeDesktopTelemetryObservedEndpointStatus[];
  unsupportedEndpoints: ClaudeDesktopTelemetryEndpointStatus[];
  liveEmitterCoverage: ClaudeDesktopTelemetryLiveEmitterCoverage | null;
  liveEmitterCoverageProfileId: string;
  coverageRuntimeCount: number;
  missingCoverageRuntimeCount: number;
  transportFidelity: ClaudeDesktopTelemetryTransportFidelity | null;
}
