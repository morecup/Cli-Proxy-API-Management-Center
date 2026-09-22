import { create } from 'zustand';
import { claudeDesktopRuntimeApi as api } from '@/services/api/claudeDesktopRuntime';
import type {
  ClaudeDesktopLocalMessage,
  ClaudeDesktopLocalView,
} from '@/types/claudeDesktopRuntime';

export const conversationKey = (account: string, session: string) =>
  JSON.stringify([account, session]);
export const messageText = (message: ClaudeDesktopLocalMessage) =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n');

export interface TextReceipt {
  startedAt: number;
  receivedAt: number;
  promptId: string;
  assistantId: string;
  observed?: boolean;
}
interface ConversationEntry {
  view: ClaudeDesktopLocalView;
  pending?: string;
  pendingStartedAt?: number;
  error?: string;
  receipt?: TextReceipt;
}
interface WorkbenchState {
  entries: Record<string, ConversationEntry>;
  accept: (account: string, view: ClaudeDesktopLocalView) => void;
  send: (account: string, session: string, message: string, startedAt?: number) => Promise<void>;
  observed: (key: string, prompt: string) => void;
}

// Account-scoped, memory-only state lets an admitted request survive route
// changes. It stores no management keys and does not restore SDK authority.
export const useSessionWorkbench = create<WorkbenchState>((set, get) => ({
  entries: {},
  accept: (account, view) => {
    const key = conversationKey(account, view.session.id);
    set((state) => ({ entries: { ...state.entries, [key]: { ...state.entries[key], view } } }));
  },
  send: async (account, session, message, startedAt = performance.now()) => {
    const key = conversationKey(account, session);
    const entry = get().entries[key];
    if (!entry || entry.pending || !entry.view.session.generation) return;
    const generation = entry.view.session.generation;
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          ...entry,
          pending: message,
          pendingStartedAt: startedAt,
          error: undefined,
          receipt: undefined,
        },
      },
    }));
    try {
      const view = await api.sendLocal(account, session, generation, message);
      const receivedAt = performance.now();
      const receipt =
        view.prompt_id && view.assistant_id
          ? { startedAt, receivedAt, promptId: view.prompt_id, assistantId: view.assistant_id }
          : undefined;
      set((state) => ({ entries: { ...state.entries, [key]: { view, receipt } } }));
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      let view = get().entries[key].view;
      try {
        view = await api.getLocal(account, session);
      } catch {
        /* Preserve the original failure. */
      }
      set((state) => ({ entries: { ...state.entries, [key]: { view, error } } }));
    }
  },
  observed: (key, prompt) =>
    set((state) => {
      const entry = state.entries[key];
      if (!entry?.receipt || entry.receipt.promptId !== prompt) return state;
      return {
        entries: {
          ...state.entries,
          [key]: { ...entry, receipt: { ...entry.receipt, observed: true } },
        },
      };
    }),
}));

type VisibilityChangeSource = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

// Track only transitions this renderer actually observes. A restoration is not
// reported unless this view first observed its own hidden transition, matching
// the server's account/view/session/generation state machine.
export function trackSessionWatchDemandVisibility(
  source: VisibilityChangeSource,
  report: (hidden: boolean) => Promise<unknown> | unknown,
  onError: () => void
) {
  let previous = source.visibilityState;
  let suppressed = false;
  let delivery: Promise<void> = Promise.resolve();
  const enqueue = (hidden: boolean) => {
    delivery = delivery
      .then(() => Promise.resolve(report(hidden)))
      .then(
        () => undefined,
        () => onError()
      );
  };
  const observe = () => {
    const next = source.visibilityState;
    if (next === previous) return;
    previous = next;
    if (next === 'hidden') {
      suppressed = true;
      enqueue(true);
      return;
    }
    if (next === 'visible' && suppressed) {
      suppressed = false;
      enqueue(false);
    }
  };
  source.addEventListener('visibilitychange', observe);
  return () => source.removeEventListener('visibilitychange', observe);
}

interface HeartbeatTimers {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
}

// The renderer supplies only a visible-page tick. The backend reads its
// owner-scoped registry and owns every heartbeat counter.
export function trackVisibleSessionHeartbeat(
  source: VisibilityChangeSource,
  timers: HeartbeatTimers,
  report: () => Promise<unknown> | unknown,
  onError: () => void,
  intervalMs = 60_000
) {
  let timer = 0;
  let stopped = false;
  const schedule = () => {
    if (timer) timers.clearTimeout(timer);
    timer = 0;
    if (stopped || source.visibilityState !== 'visible') return;
    timer = timers.setTimeout(run, intervalMs);
  };
  const run = () => {
    timer = 0;
    if (stopped || source.visibilityState !== 'visible') return;
    void Promise.resolve(report()).then(schedule, () => {
      onError();
      schedule();
    });
  };
  source.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    stopped = true;
    if (timer) timers.clearTimeout(timer);
    timer = 0;
    source.removeEventListener('visibilitychange', schedule);
  };
}

// Observe an actual visible DOM commit after two animation-frame boundaries.
// These are browser observations, not an upstream first-byte approximation.
export function afterVisiblePaint(element: HTMLElement, callback: (at: number) => void) {
  let first = 0;
  let second = 0;
  let finished = false;
  const schedule = () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
    if (finished || document.visibilityState !== 'visible') return;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (finished || !element.isConnected || document.visibilityState !== 'visible') return;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        finished = true;
        callback(performance.now());
      });
    });
  };
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => {
    finished = true;
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
    document.removeEventListener('visibilitychange', schedule);
  };
}
