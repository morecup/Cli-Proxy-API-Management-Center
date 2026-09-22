import { useTranslation } from 'react-i18next';
import type {
  ClaudeDesktopTelemetryLiveEmitterCoverage,
  ClaudeDesktopTelemetryObservedScope,
} from '@/types/claudeDesktopTelemetry';
import styles from '../dashboard.module.scss';

interface Props {
  scope?: ClaudeDesktopTelemetryObservedScope;
  coverage: ClaudeDesktopTelemetryLiveEmitterCoverage;
}

export function ClaudeDesktopTelemetryScope({ scope, coverage }: Props) {
  const { t, i18n } = useTranslation();
  const count = (value: number) => value.toLocaleString(i18n.language);
  return (
    <div className={styles.telemetryScope}>
      <p className={styles.telemetryWarning}>{t('dashboard.telemetry_observation_disclaimer')}</p>
      {scope ? (
        <>
          <p>
            {t('dashboard.telemetry_scope_totals', {
              baseline: count(scope.baseline_endpoint_event_count),
              additional: count(scope.supplemental_endpoint_event_count),
              total: count(coverage.observable_endpoint_event_count ?? 0),
              names: count(
                coverage.observable_event_name_count ?? coverage.captured_event_name_count
              ),
              sources: count(scope.sources.length),
            })}
          </p>
          <code className={styles.telemetryScopeDigest}>sha256:{scope.union_sha256}</code>
          <details>
            <summary>{t('dashboard.telemetry_scope_sources')}</summary>
            <p>{t('dashboard.telemetry_scope_overlap_hint')}</p>
            <ul>
              {scope.sources.map((source) => (
                <li key={source.artifact}>
                  <span>
                    {t(`dashboard.telemetry_scope_kind_${source.kind}`)} ·{' '}
                    {t('dashboard.telemetry_scope_source_pairs', {
                      count: source.endpoint_event_count,
                    })}
                  </span>
                  <code>{source.artifact}</code>
                  <code className={styles.telemetryScopeDigest}>sha256:{source.sha256}</code>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p>{t('dashboard.telemetry_scope_legacy')}</p>
      )}
      {(coverage.uncaptured_executable_endpoint_events?.length ?? 0) > 0 && (
        <details>
          <summary>
            {t('dashboard.telemetry_scope_uncaptured', {
              count: coverage.uncaptured_executable_endpoint_events!.length,
            })}
          </summary>
          <p>{t('dashboard.telemetry_scope_uncaptured_hint')}</p>
          <ul>
            {coverage.uncaptured_executable_endpoint_events!.map((pair) => (
              <li key={`${pair.endpoint_role}:${pair.event_name}`}>
                <code>{pair.endpoint_role}</code> · <code>{pair.event_name}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {coverage.endpoint_events && coverage.endpoint_events.length > 0 && (
        <details>
          <summary>
            {t('dashboard.telemetry_scope_inventory', { count: coverage.endpoint_events.length })}
          </summary>
          <div className={styles.telemetryScopeInventory}>
            <table className={styles.telemetryTable}>
              <caption>{t('dashboard.telemetry_scope_inventory_hint')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.telemetry_endpoint')}</th>
                  <th scope="col">{t('dashboard.telemetry_scope_event')}</th>
                  <th scope="col">{t('dashboard.telemetry_scope_trigger')}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.endpoint_events.map((pair) => (
                  <tr key={`${pair.endpoint_role}:${pair.event_name}`}>
                    <td>
                      <code>{pair.endpoint_role}</code>
                    </td>
                    <td>
                      <code>{pair.event_name}</code>
                    </td>
                    <td>
                      {t(
                        pair.executable
                          ? 'dashboard.telemetry_scope_trigger_present'
                          : 'dashboard.telemetry_scope_trigger_missing'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
