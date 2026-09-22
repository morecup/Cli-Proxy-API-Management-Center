import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores/useNotificationStore';
import type { ClaudeDesktopTelemetryResponse } from '@/types/claudeDesktopTelemetry';
import { summarizeClaudeDesktopTelemetry } from '../claudeDesktopTelemetry';
import styles from '../dashboard.module.scss';
import { ClaudeDesktopTelemetryScope } from './ClaudeDesktopTelemetryScope';

interface ClaudeDesktopTelemetryPanelProps {
  data: ClaudeDesktopTelemetryResponse | null;
  error: string | null;
  loading: boolean;
  operation: 'flush' | 'retry-dead' | null;
  onRefresh: () => Promise<void>;
  onFlush: () => Promise<ClaudeDesktopTelemetryResponse | null>;
  onRetryDeadLetters: () => Promise<ClaudeDesktopTelemetryResponse | null>;
}

export function ClaudeDesktopTelemetryPanel({
  data,
  error,
  loading,
  operation,
  onRefresh,
  onFlush,
  onRetryDeadLetters,
}: ClaudeDesktopTelemetryPanelProps) {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const summary = useMemo(() => summarizeClaudeDesktopTelemetry(data), [data]);

  const runAction = async (
    action: () => Promise<ClaudeDesktopTelemetryResponse | null>,
    successKey: string
  ) => {
    try {
      const result = await action();
      if (result) showNotification(t(successKey, { count: result.retried ?? 0 }), 'success');
    } catch {
      showNotification(t('dashboard.telemetry_action_failed'), 'error');
    }
  };

  const formatTimestamp = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date);
  };

  const formatCount = (value: number) => value.toLocaleString(i18n.language);

  const formatDigest = (value: string) => (value.length > 16 ? `${value.slice(0, 16)}…` : value);

  const healthKey = `dashboard.telemetry_health_${summary.health}`;

  return (
    <section className={styles.section} aria-labelledby="claude-desktop-telemetry-title">
      <header className={styles.telemetryHeader}>
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>{t('dashboard.telemetry_eyebrow')}</span>
          <h2 className={styles.sectionTitle} id="claude-desktop-telemetry-title">
            {t('dashboard.telemetry_title')}
          </h2>
          <p className={styles.sectionDescription}>{t('dashboard.telemetry_description')}</p>
        </div>
        <div className={styles.telemetryActions}>
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void onRefresh()}>
            {t('dashboard.telemetry_refresh')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={operation === 'flush'}
            disabled={!summary.enabled || operation !== null}
            onClick={() => void runAction(onFlush, 'dashboard.telemetry_flush_success')}
          >
            {t('dashboard.telemetry_flush')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={operation === 'retry-dead'}
            disabled={summary.deadLetters === 0 || operation !== null}
            onClick={() => void runAction(onRetryDeadLetters, 'dashboard.telemetry_retry_success')}
          >
            {t('dashboard.telemetry_retry_dead')}
          </Button>
        </div>
      </header>

      <div className={styles.panel}>
        {error && !data ? (
          <p className={styles.telemetryError}>{t('dashboard.telemetry_load_failed')}</p>
        ) : (
          <>
            <div className={styles.telemetrySummary}>
              <div className={styles.telemetryIdentity}>
                <span
                  className={`${styles.telemetryHealth} ${styles[`telemetryHealth_${summary.health}`]}`}
                >
                  <i aria-hidden="true" />
                  {t(healthKey)}
                </span>
                <strong>
                  {summary.desktopVersion || t('dashboard.telemetry_not_initialized')}
                </strong>
                <code>{summary.profileId || '—'}</code>
                {summary.deliveryEndpoints.length > 0 ? (
                  <div className={styles.telemetryTransports}>
                    {summary.deliveryEndpoints.map((endpoint) => (
                      <span className={styles.telemetryDelivery} key={endpoint.role}>
                        <span className={styles.telemetryMeta}>
                          <span className={styles.telemetryEndpointLabel}>
                            <code>{endpoint.role}</code>
                            {endpoint.telemetry_class &&
                            endpoint.telemetry_class !== endpoint.role ? (
                              <small>{endpoint.telemetry_class}</small>
                            ) : null}
                          </span>
                          {t('dashboard.telemetry_transport', {
                            protocol: endpoint.transport_protocol || '—',
                            userAgent: endpoint.user_agent_policy || '—',
                            revision: endpoint.transport_revision || '—',
                          })}
                          {endpoint.auth_policy ? ` · ${endpoint.auth_policy}` : ''}
                        </span>
                        <span
                          className={`${styles.telemetryDeliveryStatus} ${styles[`telemetryDeliveryStatus_${endpoint.status}`] ?? ''}`}
                        >
                          {t(
                            `dashboard.telemetry_delivery_status_${endpoint.status.replace(/-/g, '_')}`,
                            endpoint.status
                          )}
                        </span>
                        {endpoint.reason ? (
                          <small className={styles.telemetryDeliveryReason}>
                            {endpoint.reason}
                          </small>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.telemetryMeta}>
                    {t('dashboard.telemetry_transport', {
                      protocol: summary.transportProtocol || '—',
                      userAgent: summary.userAgentPolicy || '—',
                      revision: summary.transportRevision || '—',
                    })}
                  </span>
                )}
              </div>
              <dl className={styles.telemetryCounters}>
                <div>
                  <dt>{t('dashboard.telemetry_pending')}</dt>
                  <dd>{summary.pending.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.telemetry_sending')}</dt>
                  <dd>{summary.sending.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.telemetry_dead_letters')}</dt>
                  <dd>{summary.deadLetters.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.telemetry_failures')}</dt>
                  <dd>{summary.consecutiveFailures.toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            {summary.required && !summary.statePathConfigured && (
              <p className={styles.telemetryError}>{t('dashboard.telemetry_state_unavailable')}</p>
            )}

            {summary.transportEvidence === 'current-wire-unverified' && (
              <p className={styles.telemetryWarning}>{t('dashboard.telemetry_wire_unverified')}</p>
            )}

            {summary.transportFidelity?.client_hello_status === 'approximate' && (
              <p className={styles.telemetryWarning}>
                {t('dashboard.telemetry_client_hello_approximate', {
                  chromium: summary.transportFidelity.observed_chromium_version || '—',
                  preset: summary.transportFidelity.client_hello_preset || '—',
                  streams: summary.transportFidelity.http2_stream_mode || '—',
                })}
              </p>
            )}

            {summary.transportFidelity?.client_hello_status === 'captured-current-wire' && (
              <p className={styles.telemetrySuccess}>
                {t('dashboard.telemetry_client_hello_captured', {
                  chromium: summary.transportFidelity.observed_chromium_version || '—',
                  preset: summary.transportFidelity.client_hello_preset || '—',
                  streams: summary.transportFidelity.http2_stream_mode || '—',
                })}
              </p>
            )}

            {summary.liveEmitterCoverage && (
              <div className={styles.telemetryEvidence}>
                {summary.coverageRuntimeCount > 1 && (
                  <p className={styles.telemetryWarning}>
                    {t('dashboard.telemetry_coverage_runtime_scope', {
                      count: summary.coverageRuntimeCount,
                      profile: summary.liveEmitterCoverageProfileId || '—',
                      unknown: summary.missingCoverageRuntimeCount,
                    })}
                  </p>
                )}
                <div className={styles.telemetryEvidenceHead}>
                  <div>
                    <strong>{t('dashboard.telemetry_live_coverage_title')}</strong>
                    <code>{summary.liveEmitterCoverageProfileId || '—'}</code>
                    <span>
                      {t('dashboard.telemetry_live_coverage_value', {
                        live: formatCount(summary.liveEmitterCoverage.live_event_name_count),
                        captured: formatCount(
                          summary.liveEmitterCoverage.captured_event_name_count
                        ),
                      })}
                    </span>
                  </div>
                  <code>{summary.liveEmitterCoverage.status}</code>
                </div>
                {(summary.liveEmitterCoverage.observable_endpoint_event_count ?? 0) > 0 && (
                  <p className={styles.telemetryWarning}>
                    {t('dashboard.telemetry_endpoint_coverage', {
                      live: formatCount(summary.liveEmitterCoverage.live_endpoint_event_count ?? 0),
                      observed: formatCount(
                        summary.liveEmitterCoverage.observable_endpoint_event_count ?? 0
                      ),
                      missing: formatCount(
                        summary.liveEmitterCoverage.unmodeled_endpoint_event_count ?? 0
                      ),
                    })}
                  </p>
                )}
                {(summary.liveEmitterCoverage.unverified_declared_event_names?.length ?? 0) > 0 && (
                  <p className={styles.telemetryWarning}>
                    {t('dashboard.telemetry_unverified_declarations', {
                      count: formatCount(
                        summary.liveEmitterCoverage.unverified_declared_event_names?.length ?? 0
                      ),
                    })}
                  </p>
                )}
                <ClaudeDesktopTelemetryScope
                  scope={summary.telemetryEvidence?.observed_scope}
                  coverage={summary.liveEmitterCoverage}
                />
                <p className={styles.telemetryWarning}>
                  {t('dashboard.telemetry_semantic_sources', {
                    runtime: summary.liveEmitterCoverage.renderer_runtime_metrics_source,
                    sdk: summary.liveEmitterCoverage.sdk_process_metrics_source,
                    transcript: summary.liveEmitterCoverage.transcript_size_source,
                  })}
                </p>
                {(summary.liveEmitterCoverage.unmodeled_captured_event_count ?? 0) > 0 && (
                  <p className={styles.telemetryWarning}>
                    {t('dashboard.telemetry_live_coverage_unmodeled', {
                      observable: formatCount(
                        summary.liveEmitterCoverage.observable_event_name_count ??
                          summary.liveEmitterCoverage.captured_event_name_count
                      ),
                      unmodeled: formatCount(
                        summary.liveEmitterCoverage.unmodeled_captured_event_count ?? 0
                      ),
                    })}
                  </p>
                )}
              </div>
            )}

            {error && data && (
              <p className={styles.telemetryWarning}>{t('dashboard.telemetry_stale_data')}</p>
            )}

            {summary.telemetryEvidence && (
              <div className={styles.telemetryEvidence}>
                <div className={styles.telemetryEvidenceHead}>
                  <div>
                    <strong>{t('dashboard.telemetry_evidence_title')}</strong>
                    <code>{summary.telemetryEvidenceProfileId || '—'}</code>
                    <span>{t('dashboard.telemetry_evidence_baseline_hint')}</span>
                    <span>
                      {t('dashboard.telemetry_capture_window', {
                        first: formatTimestamp(
                          summary.telemetryEvidence.capture_window.first_captured_at
                        ),
                        last: formatTimestamp(
                          summary.telemetryEvidence.capture_window.last_captured_at
                        ),
                      })}
                    </span>
                  </div>
                  <code title={summary.telemetryEvidence.source_manifest_sha256}>
                    sha256:{formatDigest(summary.telemetryEvidence.source_manifest_sha256)}
                  </code>
                </div>
                <dl className={styles.telemetryEvidenceCounters}>
                  <div>
                    <dt>{t('dashboard.telemetry_evidence_flows')}</dt>
                    <dd>{formatCount(summary.telemetryEvidence.corpus.flow_count)}</dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.telemetry_evidence_scenarios')}</dt>
                    <dd>
                      {formatCount(summary.telemetryEvidence.corpus.http_scenario_count)}
                      <small>
                        {t('dashboard.telemetry_evidence_eligible', {
                          count: formatCount(
                            summary.telemetryEvidence.corpus.eligible_scenario_count
                          ),
                        })}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.telemetry_evidence_events')}</dt>
                    <dd>{formatCount(summary.telemetryEvidence.corpus.event_count)}</dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.telemetry_evidence_event_names')}</dt>
                    <dd>{formatCount(summary.telemetryEvidence.corpus.event_name_count)}</dd>
                  </div>
                </dl>
              </div>
            )}

            {summary.observedEndpoints.length > 0 && (
              <div className={styles.telemetryObservedEndpoints}>
                <div className={styles.telemetryObservedHead}>
                  <strong>{t('dashboard.telemetry_observed_endpoints')}</strong>
                  <span>{t('dashboard.telemetry_observed_endpoints_hint')}</span>
                </div>
                <ul>
                  {summary.observedEndpoints.map((endpoint) => (
                    <li key={endpoint.role}>
                      <div className={styles.telemetryObservedIdentity}>
                        <span className={styles.telemetryEndpointLabel}>
                          <code>{endpoint.role}</code>
                          {endpoint.telemetry_class &&
                          endpoint.telemetry_class !== endpoint.role ? (
                            <small>{endpoint.telemetry_class}</small>
                          ) : null}
                        </span>
                        <span className={styles[`telemetryObserved_${endpoint.status}`]}>
                          {t(
                            `dashboard.telemetry_observed_status_${endpoint.status.replace(/-/g, '_')}`
                          )}
                        </span>
                      </div>
                      <span className={styles.telemetryObservedStats}>
                        {t('dashboard.telemetry_observed_samples', {
                          protocol: endpoint.transport_protocol,
                          flows: formatCount(endpoint.flow_count),
                          scenarios: formatCount(endpoint.scenario_count),
                          events: formatCount(endpoint.event_count ?? 0),
                        })}
                      </span>
                      <span className={styles.telemetryObservedStats}>
                        {t('dashboard.telemetry_observed_bodies', {
                          coverage: endpoint.body_coverage,
                          json: formatCount(endpoint.json_body_flow_count),
                          opaque: formatCount(endpoint.opaque_body_flow_count),
                          missing: formatCount(endpoint.missing_body_flow_count),
                        })}
                      </span>
                      {endpoint.maximum_batch_events && endpoint.maximum_batch_bytes ? (
                        <span className={styles.telemetryObservedStats}>
                          {t('dashboard.telemetry_observed_max_batch', {
                            events: formatCount(endpoint.maximum_batch_events),
                            bytes: formatCount(endpoint.maximum_batch_bytes),
                          })}
                        </span>
                      ) : null}
                      <small>{endpoint.reason}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.accounts.length === 0 ? (
              <p className={styles.emptyNote}>{t('dashboard.telemetry_accounts_empty')}</p>
            ) : (
              <div className={styles.telemetryTableWrap}>
                <table className={styles.telemetryTable}>
                  <thead>
                    <tr>
                      <th>{t('dashboard.telemetry_account')}</th>
                      <th>{t('dashboard.telemetry_endpoint')}</th>
                      <th>{t('dashboard.telemetry_health')}</th>
                      <th>{t('dashboard.telemetry_queue')}</th>
                      <th>{t('dashboard.telemetry_last_success')}</th>
                      <th>{t('dashboard.telemetry_next_attempt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.accounts.map((account) => (
                      <tr
                        key={`${account.profile_id}:${account.auth_id_hash}:${account.endpoint_role}`}
                      >
                        <td>
                          <code>{account.auth_id_hash}</code>
                        </td>
                        <td>
                          <code>{account.endpoint_role}</code>
                        </td>
                        <td>
                          <span
                            className={`${styles.telemetryAccountHealth} ${styles[`telemetryHealth_${account.health}`]}`}
                            title={account.last_error || undefined}
                          >
                            {t(`dashboard.telemetry_health_${account.health}`)}
                          </span>
                          {account.last_error && (
                            <small className={styles.telemetryCellDetail}>
                              {account.last_error}
                            </small>
                          )}
                        </td>
                        <td>
                          {t('dashboard.telemetry_queue_value', {
                            pending: account.pending,
                            sending: account.sending,
                            dead: account.dead_letters,
                          })}
                          {!account.queue_writable && (
                            <small className={styles.telemetryCellDetail}>
                              {t('dashboard.telemetry_queue_unwritable')}
                            </small>
                          )}
                        </td>
                        <td>{formatTimestamp(account.last_success_at)}</td>
                        <td>{formatTimestamp(account.next_attempt_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {summary.unsupportedEndpoints.length > 0 && (
              <div className={styles.telemetryDisabledEndpoints}>
                <strong>{t('dashboard.telemetry_disabled_endpoints')}</strong>
                <ul>
                  {summary.unsupportedEndpoints.map((endpoint) => (
                    <li key={endpoint.role}>
                      <code>{endpoint.role}</code>
                      <span>{endpoint.reason || endpoint.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
