import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { claudeDesktopRuntimeApi as api } from '@/services/api/claudeDesktopRuntime';
import type {
  ClaudeDesktopRuntimeAccount,
  ClaudeDesktopSession,
  ClaudeDesktopUIObservation,
} from '@/types/claudeDesktopRuntime';
import {
  afterVisiblePaint,
  conversationKey,
  messageText,
  trackSessionWatchDemandVisibility,
  trackVisibleSessionHeartbeat,
  useSessionWorkbench,
} from './sessionWorkbench';
import styles from './SessionWorkbenchPage.module.scss';

interface SwitchObservation {
  viewId: string;
  id: string;
  startedAt: number;
  wasHidden: boolean;
}
const switchStarts = new Map<string, Promise<void>>();
const pendingTurnStuckAfterMs = 30_100;

export function SessionWorkbenchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const account = params.get('account') || '';
  const [accounts, setAccounts] = useState<ClaudeDesktopRuntimeAccount[]>([]);
  const [sessions, setSessions] = useState<ClaudeDesktopSession[]>([]);
  const [model, setModel] = useState('');
  const [folder, setFolder] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [telemetryError, setTelemetryError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [navigationStarted] = useState(() => performance.now());
  const [viewId] = useState(() => crypto.randomUUID());
  const commitAt = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const inputObserved = useRef('');
  const painting = useRef('');
  const switched = useRef('');
  const pendingObserved = useRef('');
  const readTiming = useRef<{ id: string; startedAt: number; receivedAt: number } | null>(null);
  const actionLock = useRef(false);
  const key = conversationKey(account, sessionId);
  const entry = useSessionWorkbench((state) => state.entries[key]);
  const accept = useSessionWorkbench((state) => state.accept);
  const send = useSessionWorkbench((state) => state.send);
  const observed = useSessionWorkbench((state) => state.observed);
  const view = entry?.view;
  const selected = accounts.find((item) => item.auth_id === account);
  const enabled = Boolean(selected && !selected.disabled && selected.runtime.runtime_loaded);
  const busy = Boolean(entry?.pending || view?.busy);
  const receipt = entry?.receipt;
  const transition = (location.state as { switchObservation?: SwitchObservation } | null)
    ?.switchObservation;
  const route = (id = '', owner = account) =>
    `${id ? `/epitaxy/${encodeURIComponent(id)}` : '/new'}?account=${encodeURIComponent(owner)}`;

  useEffect(() => {
    let active = true;
    void api
      .list()
      .then((response) => {
        if (!active) return;
        setAccounts(response.runtimes);
        if (!account) {
          const first = response.runtimes.find(
            (item) => !item.disabled && item.runtime.runtime_loaded
          );
          if (first)
            navigate(`/new?account=${encodeURIComponent(first.auth_id)}`, { replace: true });
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [account, navigate, refresh]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setMessage('');
    setSessions([]);
    if (!account) {
      setLoading(false);
      return;
    }
    const startedAt = performance.now();
    void Promise.all([
      api.sessions(account),
      sessionId ? api.getLocal(account, sessionId) : Promise.resolve(null),
    ])
      .then(([list, local]) => {
        if (!active) return;
        setSessions(
          list.sessions
            .filter((item) => item.local_conversation)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
        );
        if (local) {
          // Do not replace a newer request result with an earlier navigation read.
          const current =
            useSessionWorkbench.getState().entries[conversationKey(account, sessionId)];
          if (!current?.pending && !(current?.receipt && current.receipt.receivedAt > startedAt)) {
            accept(account, local);
            if (local.initial_message) setMessage(local.initial_message);
          }
          readTiming.current = { id: local.session.id, startedAt, receivedAt: performance.now() };
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account, sessionId, accept, refresh]);

  useLayoutEffect(() => {
    commitAt.current = performance.now();
  }, [account, sessionId, enabled, view, loading]);

  useEffect(() => {
    if (sessionId || !enabled || !input.current || inputObserved.current === account) return;
    const committed = commitAt.current;
    return afterVisiblePaint(input.current, (at) => {
      inputObserved.current = account;
      void api
        .observeUI(account, {
          kind: 'input_ready',
          view_id: viewId,
          metrics: {
            duration_ms: at - navigationStarted,
            after_paint_ms: at - navigationStarted,
            mount_ms: committed - navigationStarted,
            route_ms: committed - navigationStarted,
            tab_age_ms: at,
          },
          was_hidden: false,
          cache_hit: false,
        })
        .catch(() => setTelemetryError(true));
    });
  }, [account, enabled, navigationStarted, sessionId, viewId]);

  useEffect(() => {
    if (
      !receipt ||
      receipt.observed ||
      !view ||
      !transcript.current ||
      painting.current === receipt.promptId
    )
      return;
    const element = transcript.current.querySelector<HTMLElement>('[data-first-text]');
    const assistant = view.messages.find(
      (item) => item.id === receipt.assistantId && item.role === 'assistant'
    );
    if (!element || !assistant || !messageText(assistant).trim()) return;
    return afterVisiblePaint(element, (at) => {
      painting.current = receipt.promptId;
      const observation: ClaudeDesktopUIObservation = {
        kind: 'first_text',
        view_id: viewId,
        session_id: sessionId,
        expected_generation: view.session.generation,
        prompt_id: receipt.promptId,
        assistant_id: receipt.assistantId,
        metrics: {
          receipt_ms: receipt.receivedAt - receipt.startedAt,
          paint_ms: at - receipt.startedAt,
          after_paint_ms: at - receipt.startedAt,
          tab_age_ms: at,
        },
        was_hidden: false,
        cache_hit: false,
      };
      void api
        .observeUI(account, observation)
        .then(() => observed(key, receipt.promptId))
        .catch(() => setTelemetryError(true));
    });
  }, [account, key, observed, receipt, sessionId, view, viewId]);

  useEffect(() => {
    if (
      !transition ||
      loading ||
      !view ||
      !transcript.current ||
      switched.current === transition.id
    )
      return;
    const timing = readTiming.current;
    if (!timing || timing.id !== sessionId) return;
    const committed = commitAt.current;
    return afterVisiblePaint(transcript.current, (at) => {
      switched.current = transition.id;
      const start = switchStarts.get(transition.id);
      if (!start) return;
      const settledMs = at - transition.startedAt;
      const skeletonMs = Math.max(0, timing.receivedAt - transition.startedAt);
      void start
        .then(() =>
          Promise.all([
            api.observeUI(account, {
              kind: 'switch_painted',
              view_id: transition.viewId,
              session_id: sessionId,
              expected_generation: view.session.generation,
              switch_id: transition.id,
              metrics: {
                paint_ms: settledMs,
                after_paint_ms: settledMs,
                route_ms: timing.startedAt - transition.startedAt,
                transcript_ms: timing.receivedAt - timing.startedAt,
                mount_ms: Math.max(0, committed - timing.receivedAt),
              },
              was_hidden: transition.wasHidden,
              cache_hit: false,
            }),
            api.observeUI(account, {
              kind: 'transcript_open_settled',
              view_id: transition.viewId,
              session_id: sessionId,
              expected_generation: view.session.generation,
              switch_id: transition.id,
              metrics: {
                settled_ms: settledMs,
                first_rows_ms: settledMs,
                skeleton_ms: skeletonMs,
              },
              was_hidden: transition.wasHidden,
              cache_hit: false,
            }),
          ])
        )
        .catch(() => setTelemetryError(true))
        .finally(() => switchStarts.delete(transition.id));
    });
  }, [account, loading, sessionId, transition, view, viewId]);

  useEffect(() => {
    const pendingStartedAt = entry?.pendingStartedAt;
    const generation = view?.session.generation;
    if (!entry?.pending || pendingStartedAt === undefined || !sessionId || !generation) return;
    const observationKey = `${sessionId}:${generation}:${pendingStartedAt}`;
    if (pendingObserved.current === observationKey) return;
    let timer = 0;
    let finished = false;
    const report = () => {
      if (finished || document.visibilityState !== 'visible') return;
      const current = useSessionWorkbench.getState().entries[key];
      if (!current?.pending || current.pendingStartedAt !== pendingStartedAt) return;
      pendingObserved.current = observationKey;
      void api
        .observeUI(account, {
          kind: 'pending_turn_stuck_idle',
          view_id: viewId,
          session_id: sessionId,
          expected_generation: generation,
          metrics: {},
          was_hidden: false,
          cache_hit: false,
        })
        .catch(() => setTelemetryError(true));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (finished || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(
        report,
        Math.max(0, pendingTurnStuckAfterMs - (performance.now() - pendingStartedAt))
      );
    };
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      finished = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [account, entry?.pending, entry?.pendingStartedAt, key, sessionId, view, viewId]);

  useEffect(() => {
    const generation = view?.session.generation;
    if (!enabled || !sessionId || !generation) return;
    return trackSessionWatchDemandVisibility(
      document,
      (hidden) =>
        api.observeUI(account, {
          kind: hidden
            ? 'sessions_watch_demand_suppressed'
            : 'sessions_watch_demand_restored',
          view_id: viewId,
          session_id: sessionId,
          expected_generation: generation,
          metrics: {},
          was_hidden: hidden,
          cache_hit: false,
        }),
      () => setTelemetryError(true)
    );
  }, [account, enabled, sessionId, view?.session.generation, viewId]);

  useEffect(() => {
    if (!enabled || !account) return;
    return trackVisibleSessionHeartbeat(
      document,
      window,
      () => api.checkSessionHeartbeats(account),
      () => setTelemetryError(true)
    );
  }, [account, enabled]);

  const openSession = (session: ClaudeDesktopSession, startedAt: number) => {
    if (session.id === sessionId) return;
    const observation = {
      viewId,
      id: crypto.randomUUID(),
      startedAt,
      wasHidden: document.visibilityState !== 'visible',
    };
    const sidebar = api.observeUI(account, {
      kind: 'sidebar_session_opened',
      view_id: viewId,
      session_id: session.id,
      expected_generation: session.generation,
      switch_id: observation.id,
      metrics: {},
      was_hidden: false,
      cache_hit: false,
    });
    const start = sidebar
      .catch(() => setTelemetryError(true))
      .then(() =>
        api.observeUI(account, {
          kind: 'switch_started',
          view_id: viewId,
          session_id: session.id,
          expected_generation: session.generation,
          switch_id: observation.id,
          metrics: {},
          was_hidden: observation.wasHidden,
          cache_hit: false,
        })
      );
    // Handle the failure immediately even if navigation is interrupted.
    void start.catch(() => setTelemetryError(true));
    switchStarts.set(observation.id, start);
    if (switchStarts.size > 128) switchStarts.delete(switchStarts.keys().next().value!);
    navigate(route(session.id), { state: { switchObservation: observation } });
  };

  const submit = async () => {
    if (!enabled || actionLock.current || busy || !message.trim()) return;
    actionLock.current = true;
    setWorking(true);
    setError('');
    const text = message;
    const startedAt = performance.now();
    try {
      let current = view;
      if (!sessionId) {
        current = await api.createLocal(account, {
          model: model.trim(),
          folder: folder.trim(),
          message: text,
        });
        accept(account, current);
        navigate(route(current.session.id));
      }
      if (!current) return;
      if (!current.session.running) {
        current = await api.resumeLocal(account, current.session.id, current.session.generation!);
        accept(account, current);
      }
      setMessage('');
      await send(account, current.session.id, text, startedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      actionLock.current = false;
      setWorking(false);
    }
  };

  const stop = async () => {
    if (!view?.session.query_id || !view.session.running) return;
    try {
      await api.stopSession(account, sessionId, view.session.query_id);
      accept(account, await api.getLocal(account, sessionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('sessions.title')}</h1>
          <p>{t('sessions.description')}</p>
        </div>
        <Link to="/dashboard">{t('sessions.back')}</Link>
      </header>
      <div className={styles.layout}>
        <aside>
          <Card title={t('sessions.library')}>
            <div className="form-group">
              <label htmlFor="session-account">{t('sessions.account')}</label>
              <select
                id="session-account"
                className="input"
                value={account}
                onChange={(event) => navigate(route('', event.target.value))}
              >
                <option value="">{t('sessions.choose_account')}</option>
                {accounts.map((item) => (
                  <option
                    key={item.auth_id}
                    value={item.auth_id}
                    disabled={item.disabled || !item.runtime.runtime_loaded}
                  >
                    {item.label || item.auth_id}
                    {item.disabled || !item.runtime.runtime_loaded
                      ? ` — ${t('sessions.unavailable')}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <Button disabled={!enabled} onClick={() => navigate(route())}>
                {t('sessions.new')}
              </Button>
              <Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>
                {t('sessions.refresh')}
              </Button>
            </div>
            {!enabled && <p role="status">{t('sessions.no_account')}</p>}
            <nav aria-label={t('sessions.library')} className={styles.list}>
              {sessions.map((session, index) => (
                <button
                  key={session.id}
                  type="button"
                  aria-current={session.id === sessionId ? 'page' : undefined}
                  onClick={(event) => openSession(session, event.timeStamp)}
                >
                  <strong>{t('sessions.conversation', { number: sessions.length - index })}</strong>
                  <small>{session.id}</small>
                  <span>{t(session.running ? 'sessions.active' : 'sessions.stopped')}</span>
                </button>
              ))}
            </nav>
            {enabled && !loading && sessions.length === 0 && <p>{t('sessions.empty')}</p>}
          </Card>
        </aside>
        <main className={styles.conversation}>
          <Card
            title={t(sessionId ? 'sessions.history' : 'sessions.new')}
            extra={
              view?.session.running && (
                <Button variant="danger" size="sm" onClick={() => void stop()}>
                  {t('sessions.stop')}
                </Button>
              )
            }
          >
            {(error || entry?.error || view?.last_error) && (
              <p className="error-box" role="alert">
                {error || entry?.error || view?.last_error}
              </p>
            )}
            {telemetryError && <p role="status">{t('sessions.telemetry_failed')}</p>}
            {loading && <p role="status">{t('sessions.loading')}</p>}
            {view && (
              <p className={styles.details}>
                <strong>{view.model}</strong> · {view.folder} ·{' '}
                {t(view.session.running ? 'sessions.active' : 'sessions.stopped')}
              </p>
            )}
            <div
              ref={transcript}
              className={styles.transcript}
              aria-live="polite"
              aria-label={t('sessions.history')}
            >
              {view?.messages.map((item, index) => (
                <article
                  key={`${item.id}-${index}`}
                  className={item.role === 'user' ? styles.user : styles.assistant}
                  data-first-text={item.id === receipt?.assistantId ? '' : undefined}
                >
                  <strong>{t(item.role === 'user' ? 'sessions.you' : 'sessions.assistant')}</strong>
                  <p>{messageText(item) || t('sessions.non_text')}</p>
                </article>
              ))}
              {entry?.pending && <p role="status">{t('sessions.waiting')}</p>}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {!sessionId && (
                <div className={styles.settings}>
                  <Input
                    label={t('sessions.model')}
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    required
                    disabled={!enabled || working}
                  />
                  <Input
                    label={t('sessions.folder')}
                    hint={t('sessions.folder_hint')}
                    value={folder}
                    onChange={(event) => setFolder(event.target.value)}
                    required
                    disabled={!enabled || working}
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="session-message">{t('sessions.message')}</label>
                <textarea
                  id="session-message"
                  ref={input}
                  className="input"
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  maxLength={65536}
                  disabled={!enabled || busy || working || Boolean(sessionId && !view)}
                />
              </div>
              <div className={styles.actions}>
                <Button
                  type="submit"
                  loading={working || busy}
                  disabled={
                    !enabled ||
                    !message.trim() ||
                    Boolean(!sessionId && (!model.trim() || !folder.trim())) ||
                    Boolean(sessionId && !view)
                  }
                >
                  {t(
                    sessionId && !view?.session.running ? 'sessions.resume_send' : 'sessions.send'
                  )}
                </Button>
                <span>{t('sessions.boundary')}</span>
              </div>
            </form>
          </Card>
        </main>
      </div>
    </div>
  );
}
