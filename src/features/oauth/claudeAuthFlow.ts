import type { oauthApi } from '@/services/api/oauth';

export type ClaudeAuthMethod = 'session_key' | 'magic_link';
export interface ClaudeAuthProgress {
  method: ClaudeAuthMethod;
  phase:
    | 'idle'
    | 'starting'
    | 'verifying'
    | 'attention'
    | 'cancelling'
    | 'cancelled'
    | 'success'
    | 'error';
  state?: string;
  submitted?: boolean;
  error?: string;
  issue?: 'slow' | 'network' | 'cancel';
}
type AuthAPI = Pick<
  typeof oauthApi,
  'startAuth' | 'importClaudeSessionKey' | 'submitMagicLink' | 'getAuthStatus' | 'cancelAuthSession'
>;

/** Owns one attempt. Credentials are never retained in progress or browser storage. */
export class ClaudeAuthFlow {
  progress: ClaudeAuthProgress = { method: 'session_key', phase: 'idle' };
  private checking = false;
  private generation = 0;
  private startedAt = 0;
  private disposed = false;

  constructor(
    private api: AuthAPI,
    private changed: (progress: ClaudeAuthProgress) => void,
    private succeeded: () => void,
    private now = Date.now
  ) {}

  private publish(patch: Partial<ClaudeAuthProgress>) {
    this.progress = { ...this.progress, ...patch };
    if (!this.disposed) this.changed(this.progress);
  }

  get locked() {
    return Boolean(this.progress.state) || ['starting', 'cancelling'].includes(this.progress.phase);
  }

  private get cancelling() {
    return this.progress.phase === 'cancelling';
  }

  select(method: ClaudeAuthMethod) {
    if (this.locked) return;
    this.publish({ method, phase: 'idle', error: undefined, issue: undefined });
  }

  restore(method: ClaudeAuthMethod, state: string, submitted = true) {
    if (this.locked || !state) return;
    this.startedAt = this.now();
    this.publish({
      method,
      state,
      submitted,
      phase: submitted ? 'verifying' : 'attention',
      issue: submitted ? undefined : 'network',
    });
    void this.check();
  }

  async start(credential: string, proxy: string) {
    if (this.locked || !credential.trim()) return;
    const generation = ++this.generation;
    const method = this.progress.method;
    this.publish({ phase: 'starting', submitted: false, error: undefined, issue: undefined });
    try {
      const response =
        method === 'session_key'
          ? await this.api.importClaudeSessionKey(credential.trim(), proxy.trim())
          : await this.api.startAuth('anthropic', proxy.trim());
      if (!response.state) throw new Error('Missing OAuth session state');
      // A cancelled/unmounted attempt must not revive when a delayed POST returns.
      if (this.disposed || generation !== this.generation) {
        await this.api.cancelAuthSession(response.state);
        return;
      }
      this.publish({ state: response.state });
      if (this.cancelling) {
        await this.cancel();
        return;
      }
      if (method === 'magic_link') {
        if (response.flow !== 'magic_link') throw new Error('Unsupported magic-link flow');
        await this.api.submitMagicLink(response.state, credential.trim());
      }
      if (this.disposed || generation !== this.generation || this.cancelling) return;
      this.startedAt = this.now();
      this.publish({ phase: 'verifying', submitted: true });
      void this.check();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.publish({
        phase: this.progress.state ? 'attention' : 'error',
        error: error instanceof Error ? error.message : String(error),
        issue: 'network',
      });
    }
  }

  private complete() {
    this.publish({ phase: 'success', state: undefined, error: undefined, issue: undefined });
    if (!this.disposed) this.succeeded();
  }

  async check(retry = false) {
    if (this.checking || !this.progress.state || this.disposed || this.cancelling) return;
    const generation = this.generation;
    const state = this.progress.state;
    this.checking = true;
    if (retry) {
      this.startedAt = this.now();
      this.publish({ phase: 'verifying', error: undefined, issue: undefined });
    }
    try {
      const result = await this.api.getAuthStatus(state);
      if (this.disposed || generation !== this.generation || this.cancelling) return;
      if (result.status === 'ok') this.complete();
      else if (result.status === 'error') {
        this.publish({ phase: 'error', state: undefined, error: result.error, issue: undefined });
      } else if (this.now() - this.startedAt >= 180_000) {
        this.publish({ phase: 'attention', issue: 'slow' });
      }
    } catch (error) {
      if (this.disposed || generation !== this.generation || this.cancelling) return;
      this.publish({
        phase: 'attention',
        issue: 'network',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.checking = false;
    }
  }

  async cancel() {
    const state = this.progress.state;
    if (!state && this.progress.phase !== 'starting') return;
    if (state) ++this.generation;
    this.publish({ phase: 'cancelling', error: undefined, issue: undefined });
    // start() will cancel as soon as it receives the server's state.
    if (!state) {
      return;
    }
    try {
      const result = await this.api.cancelAuthSession(state);
      if (!result.cancelled) {
        const status = await this.api.getAuthStatus(state);
        if (status.status === 'ok') {
          this.complete();
          return;
        }
        if (status.status === 'wait') throw new Error('Session is still active');
      }
      this.publish({ phase: 'cancelled', state: undefined, error: undefined });
    } catch (error) {
      this.publish({
        phase: 'attention',
        issue: 'cancel',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose() {
    this.disposed = true;
  }
}
