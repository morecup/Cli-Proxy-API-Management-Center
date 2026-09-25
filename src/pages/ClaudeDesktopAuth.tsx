import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { oauthApi } from '@/services/api/oauth';
import { useAuthStore } from '@/stores';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import {
  ClaudeAuthFlow,
  type ClaudeAuthMethod,
  type ClaudeAuthProgress,
} from '@/features/oauth/claudeAuthFlow';
import { ClaudeBrowserVerificationModal } from './ClaudeBrowserVerificationModal';
import styles from './OAuthPage.module.scss';

export function ClaudeDesktopAuth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const apiBase = useAuthStore((store) => store.apiBase);
  const flow = useRef<ClaudeAuthFlow | null>(null);
  const [progress, setProgress] = useState<ClaudeAuthProgress>({
    method: 'session_key',
    phase: 'idle',
  });
  const [credential, setCredential] = useState('');
  const [proxy, setProxy] = useState('');
  const [verificationOpen, setVerificationOpen] = useState(false);
  const key = `claude-auth-pending:${apiBase}`;

  useEffect(() => {
    const controller = new ClaudeAuthFlow(
      oauthApi,
      (next) => {
        setProgress(next);
        // Persist only the opaque pending session ID, never credentials or proxy passwords.
        try {
          if (next.state)
            sessionStorage.setItem(
              key,
              JSON.stringify({ method: next.method, state: next.state, submitted: next.submitted })
            );
          else sessionStorage.removeItem(key);
        } catch {
          /* Storage may be unavailable in private browsing. */
        }
      },
      notifyAuthFilesChanged
    );
    flow.current = controller;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (
        saved &&
        typeof saved.state === 'string' &&
        ['session_key', 'magic_link'].includes(saved.method)
      ) {
        controller.restore(saved.method, saved.state, saved.submitted === true);
      }
    } catch {
      /* Ignore invalid/stale browser state. */
    }
    return () => {
      controller.dispose();
      flow.current = null;
    };
  }, [key]);

  useEffect(() => {
    if (progress.phase !== 'verifying') return;
    const timer = window.setInterval(() => void flow.current?.check(), 1500);
    return () => window.clearInterval(timer);
  }, [progress.phase]);

  const sessionKey = progress.method === 'session_key';
  const locked = Boolean(progress.state) || ['starting', 'cancelling'].includes(progress.phase);
  const busy = ['starting', 'verifying', 'cancelling'].includes(progress.phase);
  const canVerify =
    !sessionKey && Boolean(progress.state) && ['verifying', 'attention'].includes(progress.phase);
  const select = (method: ClaudeAuthMethod) => {
    if (locked) return;
    setCredential('');
    setVerificationOpen(false);
    flow.current?.select(method);
  };
  const submit = () => {
    if (locked || !credential.trim()) return;
    void flow.current?.start(credential, proxy);
    setCredential('');
    setVerificationOpen(false);
  };
  const statusKey =
    progress.phase === 'verifying'
      ? sessionKey
        ? 'processing_session'
        : 'processing_email'
      : progress.phase === 'attention'
        ? `attention_${progress.issue || 'network'}`
        : progress.phase;

  return (
    <div className={styles.cardContent}>
      <div
        className={styles.claudeMethods}
        role="group"
        aria-label={t('auth_login.claude_flow.method')}
      >
        {(['session_key', 'magic_link'] as const).map((method) => (
          <Button
            key={method}
            variant={progress.method === method ? 'primary' : 'secondary'}
            aria-pressed={progress.method === method}
            disabled={locked}
            onClick={() => select(method)}
          >
            {t(`auth_login.claude_flow.${method}`)}
          </Button>
        ))}
      </div>
      <Input
        label={t('auth_login.claude_flow.proxy_label')}
        hint={t(
          locked ? 'auth_login.claude_flow.proxy_pending' : 'auth_login.anthropic_proxy_url_hint'
        )}
        value={proxy}
        onChange={(event) => setProxy(event.target.value)}
        disabled={locked}
        placeholder={t('auth_login.anthropic_proxy_url_placeholder')}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {sessionKey ? (
        <div className={styles.sessionKeyNotice}>{t('auth_login.claude_flow.session_hint')}</div>
      ) : (
        <div className={styles.magicLinkSection}>
          <ol className={styles.claudeSteps}>
            <li>
              {t('auth_login.claude_flow.email_step1')}{' '}
              <a
                href="https://claude.ai/login?client=desktop"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('auth_login.claude_flow.open_login')}
              </a>
            </li>
            <li>{t('auth_login.claude_flow.email_step2')}</li>
            <li>{t('auth_login.claude_flow.email_step3')}</li>
          </ol>
          <div className={styles.magicLinkNotice}>
            {t('auth_login.claude_flow.email_local_proxy')}
          </div>
        </div>
      )}
      {!locked && progress.phase !== 'success' && (
        <form
          className={styles.cardContent}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            label={t(
              sessionKey
                ? 'auth_login.anthropic_session_key_label'
                : 'auth_login.anthropic_magic_link_label'
            )}
            placeholder={t(
              sessionKey
                ? 'auth_login.claude_flow.session_placeholder'
                : 'auth_login.anthropic_magic_link_placeholder'
            )}
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            type={sessionKey ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div className={styles.authUrlActions}>
            <Button type="submit" disabled={!credential.trim()}>
              {t(
                sessionKey
                  ? 'auth_login.anthropic_session_key_button'
                  : 'auth_login.claude_flow.submit_email'
              )}
            </Button>
          </div>
          {['idle', 'cancelled'].includes(progress.phase) && (
            <div className={styles.cardHint}>
              {t(`auth_login.claude_flow.${sessionKey ? 'await_session' : 'await_email'}`)}
            </div>
          )}
        </form>
      )}
      {progress.phase !== 'idle' && (
        <div className={styles.claudeProgress} role="status" aria-live="polite" aria-atomic="true">
          <div
            className={`status-badge ${progress.phase === 'success' ? 'success' : ['error', 'attention'].includes(progress.phase) ? 'error' : ''}`}
          >
            {busy && <span className="loading-spinner" aria-hidden="true" />}
            {t(`auth_login.claude_flow.${statusKey}`)}
          </div>
          {progress.error && <div className={styles.claudeError}>{progress.error}</div>}
          {locked && (
            <div className={styles.cardHint}>{t('auth_login.claude_flow.pending_hint')}</div>
          )}
        </div>
      )}
      <div className={styles.authUrlActions}>
        {canVerify && (
          <Button variant="secondary" onClick={() => setVerificationOpen(true)}>
            {t('auth_login.anthropic_browser_open_button')}
          </Button>
        )}
        {progress.phase === 'attention' && progress.state && (
          <Button variant="secondary" onClick={() => void flow.current?.check(true)}>
            {t('auth_login.claude_flow.check_again')}
          </Button>
        )}
        {locked && (
          <Button
            variant="secondary"
            loading={progress.phase === 'cancelling'}
            onClick={() => void flow.current?.cancel()}
          >
            {t('auth_login.claude_flow.cancel')}
          </Button>
        )}
        {progress.phase === 'success' && (
          <>
            <Button onClick={() => navigate('/auth-files')}>
              {t('auth_login.view_auth_files')}
            </Button>
            <Button variant="secondary" onClick={() => select(progress.method)}>
              {t('auth_login.login_another_account')}
            </Button>
          </>
        )}
      </div>
      <ClaudeBrowserVerificationModal
        open={verificationOpen && canVerify}
        oauthState={progress.state}
        apiBase={apiBase}
        onClose={() => setVerificationOpen(false)}
      />
    </div>
  );
}
