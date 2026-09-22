import { createRoot } from 'react-dom/client';
import i18n from '@/i18n';
import '@/styles/global.scss';
import { ClaudeDesktopSessions } from '@/features/dashboard/components/ClaudeDesktopSessions';
import { claudeDesktopRuntimeApi } from '@/services/api/claudeDesktopRuntime';
import type { ClaudeDesktopSession } from '@/types/claudeDesktopRuntime';

// Synthetic UI fixture: these operations never call a backend or Claude.
let sessions: ClaudeDesktopSession[] = [];
let firstAttach = true;
claudeDesktopRuntimeApi.sessions = async () => ({ sessions: [...sessions] });
claudeDesktopRuntimeApi.startRemote = async (_auth, body) => {
  if (sessions.length) throw new Error('Synthetic conflict: remote session already owned');
  const session: ClaudeDesktopSession = {
    id: 'local_synthetic',
    generation: 'generation_synthetic_1',
    sdk_session_id: 'sdk_synthetic',
    query_id: 'query_synthetic',
    running: true,
    created_at: '2026-09-07T05:30:00Z',
    remote_state: 'pending',
  };
  if (body.remote_session_id !== 'cse_synthetic')
    throw new Error('Synthetic fixture ID must be cse_synthetic');
  sessions = [session];
  throw new Error('Synthetic initial attachment failed; retry this record');
};
claudeDesktopRuntimeApi.attachRemote = async (_auth, id, query) => {
  if (id !== sessions[0]?.id || query !== sessions[0]?.query_id)
    throw new Error('Synthetic stale generation');
  if (!firstAttach) throw new Error('Synthetic repeated attachment uses the same generation');
  firstAttach = false;
  sessions = [{ ...sessions[0], remote_state: 'attached' }];
  return { session: sessions[0] };
};
claudeDesktopRuntimeApi.stopSession = async (_auth, id, query) => {
  if (id !== sessions[0]?.id || query !== sessions[0]?.query_id)
    throw new Error('Synthetic stale stop');
  sessions = [{ ...sessions[0], running: false }];
  return { session: sessions[0] };
};
let resumeAttempts = 0;
claudeDesktopRuntimeApi.resumeSession = async (_auth, id, generation) => {
  if (id !== sessions[0]?.id || generation !== sessions[0]?.generation || sessions[0]?.running)
    throw new Error('Synthetic stale resume');
  if (++resumeAttempts === 1) {
    sessions = [{ ...sessions[0], generation: 'generation_synthetic_2', query_id: undefined }];
    throw new Error('Synthetic stale resume; refresh the durable generation');
  }
  sessions = [
    {
      ...sessions[0],
      generation: 'generation_synthetic_3',
      query_id: 'query_resumed',
      running: true,
    },
  ];
  return { session: sessions[0] };
};
void i18n.changeLanguage('zh-CN').then(() => {
  createRoot(document.getElementById('root')!).render(
    <main style={{ padding: 24, maxWidth: 700, margin: 'auto' }}>
      <h1>Remote session synthetic QA</h1>
      <p>No real account or network requests. Use cse_synthetic.</p>
      <ClaudeDesktopSessions authId="synthetic-account" enabled />
    </main>
  );
});
