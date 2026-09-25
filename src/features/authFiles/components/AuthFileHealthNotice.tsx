import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types/authFile';
import { getAuthFileHealthState } from '../health';
import styles from './AuthFileCard.module.scss';

export function AuthFileHealthNotice({ file }: { file: AuthFileItem }) {
  const { t, i18n } = useTranslation();
  const health = file.credentialHealth;
  const state = getAuthFileHealthState(file);
  if (!health && !state) return null;
  const formatTime = (value: string) =>
    new Date(value).toLocaleString(i18n.language, { timeZoneName: 'short' });

  return (
    <div className={styles.healthNotice}>
      {state && <p>{t(`auth_files.observation_detail_${state}`)}</p>}
      {health?.resolvedAt && (
        <p>
          {t('auth_files.observation_previous')}:{' '}
          {t(`auth_files.observation_state_${health.state}`)}
        </p>
      )}
      {health && (
        <>
          <span>
            {t('auth_files.observation_first')}:{' '}
            <time dateTime={health.firstObservedAt}>{formatTime(health.firstObservedAt)}</time>
          </span>
          <span>
            {t('auth_files.observation_last')}:{' '}
            <time dateTime={health.lastObservedAt}>{formatTime(health.lastObservedAt)}</time>
            {' · HTTP '}
            {health.httpStatus}
          </span>
          {health.source === 'historical_log' && (
            <span>{t('auth_files.observation_historical')}</span>
          )}
          {health.resolvedAt && (
            <span>
              {t('auth_files.observation_resolved')}:{' '}
              <time dateTime={health.resolvedAt}>{formatTime(health.resolvedAt)}</time>
            </span>
          )}
        </>
      )}
      {file.runtimeState === 'quarantined' && state !== 'runtime_quarantined' && (
        <p>{t('auth_files.observation_detail_runtime_quarantined')}</p>
      )}
    </div>
  );
}
