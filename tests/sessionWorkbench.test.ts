import { afterEach, describe, expect, test, spyOn } from 'bun:test';
import { claudeDesktopRuntimeApi as api } from '../src/services/api/claudeDesktopRuntime';
import {
  conversationKey,
  messageText,
  trackSessionWatchDemandVisibility,
  trackVisibleSessionHeartbeat,
  useSessionWorkbench,
} from '../src/features/sessions/sessionWorkbench';
import type { ClaudeDesktopLocalView } from '../src/types/claudeDesktopRuntime';

const view = (): ClaudeDesktopLocalView => ({
  session: {
    id: 'local-test',
    generation: 'generation',
    running: true,
    created_at: '2026-09-16T00:00:00Z',
  },
  model: 'test',
  folder: 'C:\\fixture',
  messages: [],
  busy: false,
});
afterEach(() => {
  useSessionWorkbench.setState({ entries: {} });
});

describe('session workbench business state', () => {
  test('keys include account identity even when session labels match', () => {
    expect(conversationKey('first', 'same')).not.toBe(conversationKey('second', 'same'));
    expect(conversationKey('a:b', 'c')).not.toBe(conversationKey('a', 'b:c'));
  });
  test('only actual text is presented as an assistant text reply', () => {
    expect(
      messageText({
        id: 'a',
        role: 'assistant',
        content: [{ type: 'tool_use' }, { type: 'text', text: 'answer' }],
      })
    ).toBe('answer');
    expect(messageText({ id: 'b', role: 'assistant', content: [{ type: 'tool_use' }] })).toBe('');
  });
  test('an admitted request survives navigation without duplicate sends or cross-account updates', async () => {
    let complete!: (value: ClaudeDesktopLocalView) => void;
    const pending = new Promise<ClaudeDesktopLocalView>((resolve) => {
      complete = resolve;
    });
    const mock = spyOn(api, 'sendLocal').mockImplementation(() => pending);
    try {
      const store = useSessionWorkbench.getState();
      store.accept('first', view());
      store.accept('second', view());
      const job = store.send('first', 'local-test', 'hello', performance.now());
      await store.send('first', 'local-test', 'duplicate');
      expect(mock).toHaveBeenCalledTimes(1);
      expect(
        useSessionWorkbench.getState().entries[conversationKey('first', 'local-test')]
          .pendingStartedAt
      ).toBeNumber();
      expect(
        useSessionWorkbench.getState().entries[conversationKey('second', 'local-test')].pending
      ).toBeUndefined();
      complete({
        ...view(),
        prompt_id: 'p1',
        assistant_id: 'a1',
        messages: [{ id: 'a1', role: 'assistant', content: 'reply' }],
      });
      await job;
      const entry = useSessionWorkbench.getState().entries[conversationKey('first', 'local-test')];
      expect(entry.pending).toBeUndefined();
      expect(entry.pendingStartedAt).toBeUndefined();
      expect(entry.receipt?.promptId).toBe('p1');
      expect(
        useSessionWorkbench.getState().entries[conversationKey('second', 'local-test')].view
          .messages
      ).toHaveLength(0);
      store.observed(conversationKey('first', 'local-test'), 'old');
      expect(
        useSessionWorkbench.getState().entries[conversationKey('first', 'local-test')].receipt
          ?.observed
      ).toBeUndefined();
    } finally {
      mock.mockRestore();
    }
  });
  test('request failure releases the form and preserves the failure, never invents a receipt', async () => {
    const send = spyOn(api, 'sendLocal').mockRejectedValue(new Error('synthetic failed request'));
    const read = spyOn(api, 'getLocal').mockResolvedValue(view());
    try {
      const store = useSessionWorkbench.getState();
      store.accept('first', view());
      await store.send('first', 'local-test', 'hello');
      const entry = useSessionWorkbench.getState().entries[conversationKey('first', 'local-test')];
      expect(entry.error).toBe('synthetic failed request');
      expect(entry.pending).toBeUndefined();
      expect(entry.receipt).toBeUndefined();
    } finally {
      send.mockRestore();
      read.mockRestore();
    }
  });
  test('watch demand follows real hidden and visible transitions in delivery order', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    let listener: EventListener | undefined;
    const source = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type: string, value: EventListenerOrEventListenerObject) => {
        listener = typeof value === 'function' ? value : (event) => value.handleEvent(event);
      },
      removeEventListener: () => {
        listener = undefined;
      },
    } as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    const transition = (next: DocumentVisibilityState) => {
      visibility = next;
      listener?.(new Event('visibilitychange'));
    };
    let releaseHidden!: () => void;
    const hiddenPending = new Promise<void>((resolve) => {
      releaseHidden = resolve;
    });
    const reports: boolean[] = [];
    const stop = trackSessionWatchDemandVisibility(
      source,
      (hidden) => {
        reports.push(hidden);
        return hidden ? hiddenPending : Promise.resolve();
      },
      () => {
        throw new Error('unexpected watch-demand delivery failure');
      }
    );

    transition('visible');
    transition('hidden');
    await Promise.resolve();
    expect(reports).toEqual([true]);
    transition('visible');
    await Promise.resolve();
    expect(reports).toEqual([true]);
    releaseHidden();
    await hiddenPending;
    await Promise.resolve();
    await Promise.resolve();
    expect(reports).toEqual([true, false]);

    stop();
    transition('hidden');
    await Promise.resolve();
    expect(reports).toEqual([true, false]);
  });

  test('heartbeat ticks run only while the Code workbench is visible', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    let listener: EventListener | undefined;
    const source = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type: string, value: EventListenerOrEventListenerObject) => {
        listener = typeof value === 'function' ? value : (event) => value.handleEvent(event);
      },
      removeEventListener: () => {
        listener = undefined;
      },
    } as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    let timer = 0;
    let scheduled: (() => void) | undefined;
    const timers = {
      setTimeout: (callback: () => void) => {
        scheduled = callback;
        return ++timer;
      },
      clearTimeout: () => {
        scheduled = undefined;
      },
    };
    let reports = 0;
    const stop = trackVisibleSessionHeartbeat(
      source,
      timers,
      () => {
        reports++;
      },
      () => {
        throw new Error('unexpected heartbeat delivery failure');
      },
      1
    );
    expect(scheduled).toBeFunction();
    scheduled?.();
    await Promise.resolve();
    expect(reports).toBe(1);

    visibility = 'hidden';
    listener?.(new Event('visibilitychange'));
    expect(scheduled).toBeUndefined();
    visibility = 'visible';
    listener?.(new Event('visibilitychange'));
    expect(scheduled).toBeFunction();
    scheduled?.();
    await Promise.resolve();
    expect(reports).toBe(2);

    stop();
    expect(scheduled).toBeUndefined();
  });
});
