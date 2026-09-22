import type {
  ClaudeDesktopTelemetryDeliveryEndpointStatus,
  ClaudeDesktopTelemetryEndpointStatus,
  ClaudeDesktopTelemetryHealth,
  ClaudeDesktopTelemetryLiveEmitterCoverage,
  ClaudeDesktopTelemetryResponse,
  ClaudeDesktopTelemetrySummary,
} from '@/types/claudeDesktopTelemetry';

const healthRank: Record<ClaudeDesktopTelemetryHealth, number> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
};

const coverageRatio = (coverage: ClaudeDesktopTelemetryLiveEmitterCoverage): number => {
  const observed =
    coverage.observable_endpoint_event_count ??
    coverage.observable_event_name_count ??
    coverage.captured_event_name_count;
  const implemented =
    coverage.observable_endpoint_event_count !== undefined
      ? (coverage.live_endpoint_event_count ?? 0)
      : coverage.live_event_name_count;
  return observed > 0 ? implemented / observed : -1;
};

export const summarizeClaudeDesktopTelemetry = (
  response: ClaudeDesktopTelemetryResponse | null
): ClaudeDesktopTelemetrySummary => {
  const managers = response?.telemetry ?? [];
  const accounts = managers.flatMap((manager) => manager.accounts ?? []);
  const enabled = managers.some((manager) => manager.enabled);
  const required = managers.some((manager) => manager.required);
  const statePathConfigured =
    managers.length > 0 && managers.every((manager) => manager.state_path_configured);
  const requiredUnavailable = managers.some(
    (manager) => manager.required && (!manager.enabled || !manager.state_path_configured)
  );
  const requiredDeliveryDegraded = managers.some((manager) =>
    manager.delivery_endpoints?.some((endpoint) => endpoint.required && endpoint.status !== 'ready')
  );
  const profile = managers.find((manager) => manager.profile_id) ?? managers[0];
  const endpointByRole = new Map<string, ClaudeDesktopTelemetryEndpointStatus>();
  const deliveryByRole = new Map<string, ClaudeDesktopTelemetryDeliveryEndpointStatus>();
  // Do not sum different profiles or let the first healthy runtime hide a
  // later incomplete one. Display one real, least-complete coverage snapshot.
  const coverageManagers = managers
    .filter((manager) => manager.live_emitter_coverage)
    .sort((left, right) => {
      const a = left.live_emitter_coverage!;
      const b = right.live_emitter_coverage!;
      return (
        Number(a.status === 'complete') - Number(b.status === 'complete') ||
        coverageRatio(a) - coverageRatio(b)
      );
    });
  const coverageManager = coverageManagers[0];
  const liveEmitterCoverage = coverageManager?.live_emitter_coverage;
  // Evidence, counts and per-role observations must describe the same runtime
  // as coverage. Missing evidence is not borrowed from a different profile.
  const evidenceManager = coverageManager ?? managers.find((manager) => manager.telemetry_evidence);
  const telemetryEvidence = evidenceManager?.telemetry_evidence;
  const transportFidelity = managers.find(
    (manager) => manager.transport_fidelity
  )?.transport_fidelity;
  managers.forEach((manager) => {
    manager.delivery_endpoints?.forEach((endpoint) => {
      const previous = deliveryByRole.get(endpoint.role);
      const selected = previous && previous.status !== 'ready' ? previous : endpoint;
      deliveryByRole.set(endpoint.role, {
        ...selected,
        required: Boolean(previous?.required || endpoint.required),
      });
    });
    manager.unsupported_endpoints?.forEach((endpoint) => {
      if (!endpointByRole.has(endpoint.role)) endpointByRole.set(endpoint.role, endpoint);
    });
  });

  let health: ClaudeDesktopTelemetrySummary['health'] = requiredUnavailable
    ? 'unhealthy'
    : enabled
      ? requiredDeliveryDegraded
        ? 'degraded'
        : 'healthy'
      : 'disabled';
  if (enabled && !requiredUnavailable) {
    accounts.forEach((account) => {
      if (health === 'disabled' || healthRank[account.health] > healthRank[health]) {
        health = account.health;
      }
    });
  }

  return {
    enabled,
    required,
    profileId: profile?.profile_id ?? '',
    desktopVersion: profile?.desktop_version ?? '',
    transportRevision: profile?.transport_revision ?? '',
    transportProtocol: profile?.transport_protocol ?? '',
    transportEvidence: profile?.transport_evidence ?? '',
    userAgentPolicy: profile?.user_agent_policy ?? '',
    statePathConfigured,
    health,
    pending: accounts.reduce((sum, account) => sum + account.pending, 0),
    sending: accounts.reduce((sum, account) => sum + account.sending, 0),
    deadLetters: accounts.reduce((sum, account) => sum + account.dead_letters, 0),
    consecutiveFailures: accounts.reduce((sum, account) => sum + account.consecutive_failures, 0),
    accounts,
    deliveryEndpoints: Array.from(deliveryByRole.values()).sort((left, right) =>
      left.role.localeCompare(right.role)
    ),
    telemetryEvidence: telemetryEvidence ?? null,
    telemetryEvidenceProfileId: evidenceManager?.profile_id ?? '',
    observedEndpoints: [...(evidenceManager?.observed_endpoints ?? [])].sort((left, right) =>
      left.role.localeCompare(right.role)
    ),
    unsupportedEndpoints: Array.from(endpointByRole.values()).sort((left, right) =>
      left.role.localeCompare(right.role)
    ),
    liveEmitterCoverage: liveEmitterCoverage ?? null,
    liveEmitterCoverageProfileId: coverageManager?.profile_id ?? '',
    coverageRuntimeCount: managers.length,
    missingCoverageRuntimeCount: managers.length - coverageManagers.length,
    transportFidelity: transportFidelity ?? null,
  };
};
