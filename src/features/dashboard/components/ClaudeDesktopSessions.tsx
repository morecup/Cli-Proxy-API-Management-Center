import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { claudeDesktopRuntimeApi } from '@/services/api/claudeDesktopRuntime';
import type { ClaudeDesktopSession } from '@/types/claudeDesktopRuntime';
import styles from '../dashboard.module.scss';

export function ClaudeDesktopSessions({ authId, enabled }: { authId: string; enabled: boolean }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ClaudeDesktopSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [remoteId, setRemoteId] = useState('');
  const [folder, setFolder] = useState('');
  const [model, setModel] = useState('');
  const refresh = async () => {
    const response = await claudeDesktopRuntimeApi.sessions(authId);
    setSessions(response.sessions);
  };
  const run = async (action?: () => Promise<unknown>) => {
    if (!enabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action) await action();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('dashboard.desktop_runtime_action_failed')
      );
      // A failed attachment can still have created a local record. Preserve
      // its query ID so the user can retry that exact generation, not create another.
      if (action) {
        try {
          await refresh();
        } catch {
          /* Keep the original action failure. */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && sessions === null) void run();
      }}
    >
      <summary>{t('dashboard.desktop_remote_sessions')}</summary>
      <p>
        <Link to={`/new?account=${encodeURIComponent(authId)}`}>{t('sessions.title')}</Link>
      </p>
      <p className={styles.sectionDescription}>{t('dashboard.desktop_remote_boundary')}</p>
      {error && (
        <p role="alert" className={styles.telemetryError}>
          {error}
        </p>
      )}
      <Button size="sm" variant="secondary" disabled={!enabled || busy} onClick={() => void run()}>
        {t('dashboard.telemetry_refresh')}
      </Button>
      {sessions?.length === 0 && <p>{t('dashboard.desktop_remote_empty')}</p>}
      {sessions?.map((session) => (
        <div key={session.id} className={styles.desktopStartupStatus}>
          <code>{session.id}</code>
          <span>
            {t(
              `dashboard.desktop_remote_${session.running ? session.remote_state || 'local' : 'stopped'}`
            )}
          </span>
          <code>{session.query_id || '—'}</code>
          <div className={styles.desktopRuntimeActions}>
            {!session.running && session.remote_state && session.remote_state !== 'detached' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!enabled || busy || !session.generation}
                onClick={() =>
                  void run(() =>
                    claudeDesktopRuntimeApi.resumeSession(authId, session.id, session.generation!)
                  )
                }
              >
                {t('dashboard.desktop_remote_resume')}
              </Button>
            )}
            {session.remote_state && session.remote_state !== 'detached' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!enabled || busy || !session.running || !session.query_id}
                onClick={() =>
                  void run(() =>
                    claudeDesktopRuntimeApi.attachRemote(authId, session.id, session.query_id!)
                  )
                }
              >
                {t('dashboard.desktop_remote_attach')}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!enabled || busy || !session.running || !session.query_id}
              onClick={() =>
                void run(() =>
                  claudeDesktopRuntimeApi.stopSession(authId, session.id, session.query_id!)
                )
              }
            >
              {t('dashboard.desktop_remote_stop')}
            </Button>
          </div>
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            claudeDesktopRuntimeApi.startRemote(authId, {
              remote_session_id: remoteId,
              folder,
              model,
            })
          );
        }}
      >
        <Input
          label={t('dashboard.desktop_remote_id')}
          value={remoteId}
          onChange={(event) => setRemoteId(event.target.value)}
          required
          pattern="(cse_|session_)[A-Za-z0-9_]{1,64}"
          disabled={!enabled || busy}
        />
        <Input
          label={t('dashboard.desktop_remote_folder')}
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
          required
          disabled={!enabled || busy}
        />
        <Input
          label={t('dashboard.desktop_remote_model')}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          required
          disabled={!enabled || busy}
        />
        <Button
          type="submit"
          size="sm"
          loading={busy}
          disabled={!enabled || busy || !remoteId || !folder.trim() || !model.trim()}
        >
          {t('dashboard.desktop_remote_start')}
        </Button>
      </form>
    </details>
  );
}
