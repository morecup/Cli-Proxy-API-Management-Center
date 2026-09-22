import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores/useNotificationStore';
import type {
  ClaudeDesktopRuntimeOperationResponse,
  ClaudeDesktopRuntimesResponse,
} from '@/types/claudeDesktopRuntime';
import type { ClaudeDesktopRuntimeOperation } from '../hooks/useClaudeDesktopRuntimes';
import {
  controlPlaneHealth,
  controlPlaneIssues,
  startupErrorCategories,
} from '../claudeDesktopRuntime';
import styles from '../dashboard.module.scss';
import { ClaudeDesktopSessions } from './ClaudeDesktopSessions';

interface ClaudeDesktopRuntimePanelProps {
  data: ClaudeDesktopRuntimesResponse | null;
  error: string | null;
  loading: boolean;
  operation: ClaudeDesktopRuntimeOperation;
  onRefresh: () => Promise<void>;
  onPromote: (authId: string) => Promise<ClaudeDesktopRuntimeOperationResponse | null>;
  onRollback: (authId: string) => Promise<ClaudeDesktopRuntimeOperationResponse | null>;
}

const shortRevision = (value?: string) => (value ? `${value.slice(0, 12)}…` : '—');

export function ClaudeDesktopRuntimePanel({
  data,
  error,
  loading,
  operation,
  onRefresh,
  onPromote,
  onRollback,
}: ClaudeDesktopRuntimePanelProps) {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const runtimes = data?.runtimes ?? [];

  const formatTimestamp = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(date);
  };

  const confirmOperation = (authId: string, kind: 'promote' | 'rollback') => {
    const action = kind === 'promote' ? onPromote : onRollback;
    showConfirmation({
      title: t(`dashboard.desktop_runtime_${kind}_confirm_title`),
      message: t(`dashboard.desktop_runtime_${kind}_confirm_message`, { authId }),
      confirmText: t(`dashboard.desktop_runtime_${kind}`),
      variant: kind === 'rollback' ? 'secondary' : 'primary',
      onConfirm: async () => {
        try {
          const result = await action(authId);
          if (result) {
            showNotification(t(`dashboard.desktop_runtime_${kind}_success`), 'success');
          }
        } catch (cause) {
          showNotification(
            cause instanceof Error ? cause.message : t('dashboard.desktop_runtime_action_failed'),
            'error'
          );
        }
      },
    });
  };

  return (
    <section className={styles.section} aria-labelledby="claude-desktop-runtime-title">
      <header className={styles.telemetryHeader}>
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>{t('dashboard.desktop_runtime_eyebrow')}</span>
          <h2 className={styles.sectionTitle} id="claude-desktop-runtime-title">
            {t('dashboard.desktop_runtime_title')}
          </h2>
          <p className={styles.sectionDescription}>{t('dashboard.desktop_runtime_description')}</p>
        </div>
        <Button variant="secondary" size="sm" loading={loading} onClick={() => void onRefresh()}>
          {t('dashboard.telemetry_refresh')}
        </Button>
      </header>

      <div className={styles.panel}>
        {error && !data ? (
          <p className={styles.telemetryError}>{t('dashboard.desktop_runtime_load_failed')}</p>
        ) : runtimes.length === 0 ? (
          <p className={styles.emptyNote}>{t('dashboard.desktop_runtime_empty')}</p>
        ) : (
          <div className={styles.desktopRuntimeGrid}>
            {runtimes.map((entry) => {
              const runtime = entry.runtime;
              const state = runtime.runtime_stopping
                ? 'stopping'
                : entry.disabled
                  ? 'disabled'
                  : runtime.state || (entry.disabled ? 'disabled' : 'not-provisioned');
              const activeOperation = operation?.authId === entry.auth_id ? operation.kind : null;
              const startup = runtime.startup;
              const control = runtime.control_plane;
              const controlHealth = controlPlaneHealth(control, runtime.agent_tasks);
              return (
                <article className={styles.desktopRuntimeCard} key={entry.auth_id}>
                  <header className={styles.desktopRuntimeCardHead}>
                    <div>
                      <strong>{entry.label || entry.auth_index || entry.auth_id}</strong>
                      <code title={entry.auth_id}>{entry.auth_id}</code>
                    </div>
                    <span
                      className={`${styles.desktopRuntimeState} ${styles[`desktopRuntimeState_${state}`] ?? ''}`}
                    >
                      {t(`dashboard.desktop_runtime_state_${state.replace(/-/g, '_')}`, state)}
                    </span>
                  </header>

                  {runtime.quarantine_reason && (
                    <p className={styles.telemetryWarning}>{runtime.quarantine_reason}</p>
                  )}
                  {runtime.recovered_unclean_exit && (
                    <p className={styles.telemetryWarning}>
                      {t('dashboard.desktop_runtime_unclean_recovered')}
                    </p>
                  )}

                  <dl className={styles.desktopRuntimeFacts}>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_approved')}</dt>
                      <dd>
                        <code title={runtime.approved_revision}>
                          {shortRevision(runtime.approved_revision)}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_observed')}</dt>
                      <dd>
                        <code title={runtime.observed_revision}>
                          {shortRevision(runtime.observed_revision)}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_previous')}</dt>
                      <dd>
                        <code title={runtime.previous_revision}>
                          {shortRevision(runtime.previous_revision)}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_machine')}</dt>
                      <dd>{runtime.machine_profile_id || '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_lifetime')}</dt>
                      <dd>
                        {runtime.lifecycle_state || '—'} · #{runtime.lifecycle_generation ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_session')}</dt>
                      <dd>
                        <code>{runtime.app_session_hash || '—'}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_previous_exit')}</dt>
                      <dd>{runtime.previous_exit || '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('dashboard.desktop_runtime_started')}</dt>
                      <dd>{formatTimestamp(runtime.started_at)}</dd>
                    </div>
                  </dl>

                  <div className={styles.desktopStartupStatus}>
                    <div className={styles.desktopStartupStatusHead}>
                      <strong>{t('dashboard.desktop_runtime_startup')}</strong>
                      <span
                        className={`${styles.desktopStartupState} ${styles[`desktopStartupState_${startup.state}`] ?? ''}`}
                      >
                        {t(
                          `dashboard.desktop_runtime_startup_state_${startup.state.replace(/-/g, '_')}`,
                          startup.state
                        )}
                      </span>
                    </div>
                    <span>
                      {t('dashboard.desktop_runtime_startup_counts', {
                        completed: startup.completed,
                        attempted: startup.attempted,
                        total: startup.endpoint_count,
                        failed: startup.failed,
                        skipped: startup.skipped,
                      })}
                    </span>
                    {startupErrorCategories(startup).map((category) => (
                      <small key={category}>
                        {t('dashboard.desktop_runtime_startup_last_error', {
                          category,
                        })}
                      </small>
                    ))}
                  </div>

                  <div className={styles.desktopStartupStatus}>
                    <div className={styles.desktopStartupStatusHead}>
                      <strong>{t('dashboard.desktop_runtime_control')}</strong>
                      <span
                        className={`${styles.desktopStartupState} ${controlHealth === 'degraded' ? styles.desktopStartupState_degraded : ''}`}
                      >
                        {t(`dashboard.desktop_runtime_control_${controlHealth}`)}
                      </span>
                    </div>
                    {control && (
                      <>
                        <span>
                          {t('dashboard.desktop_runtime_control_counts', {
                            active: control.active ?? '—',
                            initializationFailed: control.initialization_failed ?? '—',
                            retiring: control.retiring ?? '—',
                            failed: control.failed ?? '—',
                          })}
                        </span>
                        <span>
                          {t('dashboard.desktop_runtime_placeholder_counts', {
                            pending: control.placeholder_pending ?? '—',
                            preserved: control.placeholder_used_preserved ?? '—',
                          })}
                        </span>
                        <span>
                          {t('dashboard.desktop_remote_counts', {
                            admitted: control.inbound_dispatched ?? '—',
                            completed: control.inbound_completed ?? '—',
                            canceled: control.inbound_canceled ?? '—',
                            failed: control.inbound_execution_failed ?? '—',
                          })}
                        </span>
                      </>
                    )}
                    {runtime.agent_tasks && (
                      <span>
                        {t('dashboard.desktop_agent_counts', {
                          total: runtime.agent_tasks.total,
                          running: runtime.agent_tasks.running,
                          completed: runtime.agent_tasks.completed,
                          killed: runtime.agent_tasks.killed,
                          failed: runtime.agent_tasks.failed,
                          pending: runtime.agent_tasks.pending_events,
                        })}
                      </span>
                    )}
                    {controlPlaneIssues(control, runtime.agent_tasks).map((issue) => (
                      <small className={styles.telemetryWarning} key={issue}>
                        {t(`dashboard.desktop_runtime_control_issue_${issue}`)}
                      </small>
                    ))}
                  </div>

                  <ClaudeDesktopSessions
                    authId={entry.auth_id}
                    enabled={
                      !entry.disabled &&
                      runtime.runtime_loaded &&
                      !runtime.runtime_stopping &&
                      state === 'active'
                    }
                  />

                  <div className={styles.desktopRuntimeActions}>
                    <Button
                      size="sm"
                      loading={activeOperation === 'promote'}
                      disabled={
                        !runtime.can_promote || operation !== null || runtime.runtime_stopping
                      }
                      onClick={() => confirmOperation(entry.auth_id, 'promote')}
                    >
                      {t('dashboard.desktop_runtime_promote')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={activeOperation === 'rollback'}
                      disabled={
                        !runtime.can_rollback || operation !== null || runtime.runtime_stopping
                      }
                      onClick={() => confirmOperation(entry.auth_id, 'rollback')}
                    >
                      {t('dashboard.desktop_runtime_rollback')}
                    </Button>
                    {runtime.runtime_stopping && (
                      <small>{t('dashboard.desktop_runtime_waiting_for_drain')}</small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {error && data && (
          <p className={styles.telemetryWarning}>{t('dashboard.telemetry_stale_data')}</p>
        )}
      </div>
    </section>
  );
}
