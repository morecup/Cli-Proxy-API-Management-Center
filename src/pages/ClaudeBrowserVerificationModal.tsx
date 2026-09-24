import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { oauthApi } from '@/services/api';
import { computeApiUrl } from '@/utils/connection';
import { getErrorMessage } from '@/utils/helpers';
import styles from './ClaudeBrowserVerificationModal.module.scss';

const TICKET_PROTOCOL_PREFIX = 'cliproxy-claude-ticket.';

type VerificationStatus = 'connecting' | 'ready' | 'finishing' | 'error';

interface BrowserFrame {
  id: number;
  data: string;
  width: number;
  height: number;
}

interface BrowserEvent {
  type?: 'waiting' | 'ready' | 'frame' | 'closed' | 'error' | 'input_error';
  frame_id?: number;
  data?: string;
  width?: number;
  height?: number;
  message?: string;
}

interface Props {
  open: boolean;
  oauthState?: string;
  apiBase: string;
  onClose: () => void;
}

const buildBrowserWebSocketUrl = (apiBase: string, oauthState: string): string => {
  const managementBase = computeApiUrl(apiBase) || '/v0/management';
  const url = new URL(
    `${managementBase}/oauth-session/${encodeURIComponent(oauthState)}/browser`,
    window.location.href
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export function ClaudeBrowserVerificationModal({ open, oauthState, apiBase, onClose }: Props) {
  const { t } = useTranslation();
  const socketRef = useRef<WebSocket | null>(null);
  const lastMoveAtRef = useRef(0);
  const [status, setStatus] = useState<VerificationStatus>('connecting');
  const [error, setError] = useState<string>();
  const [frame, setFrame] = useState<BrowserFrame>();
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!open || !oauthState) return;

    let cancelled = false;
    let terminalMessageReceived = false;
    setStatus('connecting');
    setError(undefined);
    setFrame(undefined);

    const connect = async () => {
      try {
        const response = await oauthApi.createClaudeBrowserTicket(oauthState);
        if (cancelled) return;

        const socket = new WebSocket(
          buildBrowserWebSocketUrl(apiBase, oauthState),
          `${TICKET_PROTOCOL_PREFIX}${response.ticket}`
        );
        socketRef.current = socket;
        socket.onmessage = (message) => {
          if (cancelled || typeof message.data !== 'string') return;
          let event: BrowserEvent;
          try {
            event = JSON.parse(message.data) as BrowserEvent;
          } catch {
            return;
          }
          switch (event.type) {
            case 'waiting':
              setStatus('connecting');
              break;
            case 'ready':
              setStatus('ready');
              setError(undefined);
              break;
            case 'frame':
              if (
                event.data &&
                typeof event.frame_id === 'number' &&
                typeof event.width === 'number' &&
                typeof event.height === 'number'
              ) {
                setFrame((previous) =>
                  previous && previous.id >= event.frame_id!
                    ? previous
                    : {
                        id: event.frame_id!,
                        data: event.data!,
                        width: event.width!,
                        height: event.height!,
                      }
                );
                setStatus('ready');
                setError(undefined);
              }
              break;
            case 'closed':
              terminalMessageReceived = true;
              setStatus('finishing');
              break;
            case 'error':
              terminalMessageReceived = true;
              setStatus('error');
              setError(event.message || t('auth_login.anthropic_browser_error'));
              break;
            case 'input_error':
              // A stale move can arrive while a frame is resizing. The next
              // frame is authoritative, so keep the verification session open.
              break;
          }
        };
        socket.onclose = () => {
          if (cancelled || terminalMessageReceived) return;
          setStatus('error');
          setError(t('auth_login.anthropic_browser_disconnected'));
        };
        socket.onerror = () => {
          // onclose supplies the recoverable UI state after a failed upgrade.
        };
      } catch (connectError: unknown) {
        if (cancelled) return;
        setStatus('error');
        setError(getErrorMessage(connectError) || t('auth_login.anthropic_browser_error'));
      }
    };

    void connect();
    return () => {
      cancelled = true;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, 'verification view closed');
      }
    };
  }, [apiBase, oauthState, open, retryNonce, t]);

  const sendInput = useCallback((payload: Record<string, string | number>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'mouse', ...payload }));
  }, []);

  const frameCoordinates = useCallback(
    (clientX: number, clientY: number, element: HTMLDivElement) => {
      if (!frame) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Math.max(0, Math.min(frame.width, ((clientX - rect.left) / rect.width) * frame.width)),
        y: Math.max(0, Math.min(frame.height, ((clientY - rect.top) / rect.height) * frame.height)),
      };
    },
    [frame]
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - lastMoveAtRef.current < 40) return;
    lastMoveAtRef.current = now;
    const point = frameCoordinates(event.clientX, event.clientY, event.currentTarget);
    if (point) sendInput({ action: 'move', ...point });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = frameCoordinates(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    sendInput({ action: 'move', ...point });
    sendInput({ action: 'down', click_count: 1, ...point });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = frameCoordinates(event.clientX, event.clientY, event.currentTarget);
    if (point) sendInput({ action: 'up', click_count: 1, ...point });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = frameCoordinates(event.clientX, event.clientY, event.currentTarget);
    if (point) sendInput({ action: 'up', click_count: 1, ...point });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const point = frameCoordinates(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    event.preventDefault();
    sendInput({
      action: 'wheel',
      delta_x: event.deltaX,
      delta_y: event.deltaY,
      ...point,
    });
  };

  const statusText =
    status === 'ready'
      ? t('auth_login.anthropic_browser_ready')
      : status === 'finishing'
        ? t('auth_login.anthropic_browser_finishing')
        : status === 'error'
          ? t('auth_login.anthropic_browser_error')
          : t('auth_login.anthropic_browser_connecting');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('auth_login.anthropic_browser_title')}
      width={980}
      footer={
        <div className={styles.footer}>
          {status === 'error' && (
            <Button variant="secondary" onClick={() => setRetryNonce((value) => value + 1)}>
              {t('auth_login.anthropic_browser_retry')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.status} data-status={status} aria-live="polite">
          {statusText}
          {error ? ` ${error}` : ''}
        </div>
        <div
          className={styles.viewport}
          style={frame ? { aspectRatio: `${frame.width} / ${frame.height}` } : undefined}
          role="application"
          aria-label={t('auth_login.anthropic_browser_canvas_label')}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onWheel={handleWheel}
          onContextMenu={(event) => event.preventDefault()}
        >
          {frame ? (
            <img
              className={styles.frame}
              src={`data:image/jpeg;base64,${frame.data}`}
              alt=""
              draggable={false}
            />
          ) : (
            <div className={styles.placeholder}>{t('auth_login.anthropic_browser_connecting')}</div>
          )}
          {status !== 'ready' && <div className={styles.viewportOverlay} />}
        </div>
        <div className={styles.help}>{t('auth_login.anthropic_browser_help')}</div>
      </div>
    </Modal>
  );
}
