'use client';

import { ArrowsUpDownIcon, PlayCircleIcon } from '@heroicons/react/24/solid';
import { Tooltip } from '@mui/material';
import cx from 'classnames';
import Image from 'next/image';
import { useContext, useEffect, useRef, useState } from 'react';
import { v4 as UUID } from 'uuid';
import { BroadcastEventType } from '~shared/broadcast/types';
import { WHSize, XYPosition } from '~shared/cursor/types';
import { ALogger } from '~shared/logging/ALogger';
import { RemoteCursorPosition } from '~shared/portal/RemoteBrowserTypes';
import { RemoteBrowserConfigs } from '~shared/remote-browser/RemoteBrowserConfigs';
import {
  RemoteCursorFocusCircleSize,
  RemoteCursorHighlightCircleSize,
  RemoteCursorPositionCenterOffset,
  RemoteCursorSize,
  RemoteCursorTypeToBase64,
  SupportedRemoteCursorTypes,
} from '~shared/remote-browser/RemoteCursor';
import { WaitUtils } from '~shared/utils/WaitUtils';
import RemoteBrowserContainer from '~src/app/portal/RemoteBrowserContainer';
import { useBrowserRewindHistory } from '~src/contexts/BrowserRewindHistoryContext';
import { UserSessionContext } from '~src/contexts/UserSessionContext';
import { useRemoteBrowserSession } from '~src/hooks/useRemoteBrowserSession';
import { RemoteBrowserSocket } from '~shared/remote-browser/RemoteBrowserSocket';


interface Props {
  setRemoteBrowserSessionId: (sessionId?: string) => void;

  className?: string;
  footer?: React.ReactNode;
  remoteBrowserSessionId?: string;
  setHideChatWithAiden?: (hide: boolean) => void;
  teachModeOn?: boolean;
  turnOffTeachMode?: () => void;
  setShouldStartSop?: (startSop: boolean) => void;
}

export enum RemoteBrowserWindowStatus {
  PENDING = 'pending',
  LOADING = 'loading',
  READY = 'ready',
  STOPPED = 'stopped',
}

type RemoteCursorStyle = { base64: string; centerOffset: XYPosition };

export function WebsocketRemoteBrowserWindow(props: Props) {
  const { isAdminUser, logout } = useContext(UserSessionContext);
  const { currentStep, isRewindMode } = useBrowserRewindHistory();
  const {
    attachToSessionId: attachToRemoteBrowserSession,
    browserStatus,
    detach: detachFromRemoteBrowserSession,
    disableInteractionEvents,
    emitEvent: emitBrowserEvent,
    enableInteractionEvents,
    isConnected: isBrowserSocketConnected,
    isInteractionEventsEnabled,
    killSession: killRemoteBrowserSession,
    sendBroadcastEvent,
    socket: browserSocket,
  } = useRemoteBrowserSession({
    keepAlive: true,
    onSessionIdChange: (sessionId: string) => props.setRemoteBrowserSessionId(sessionId),
    onConnectError: async (error) => {
      const isAuthError = error.includes('Authentication error');
      if (!isAuthError) {
        ALogger.error({ context: 'Failed to connect to remote-browser', error });
        return;
      }

      await logout();
      window.location.reload();
    },
    teachModeOn: props.teachModeOn,
  });

  const activeTabIdRef = useRef<number | null>(null);
  const canvasImageWorkerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentFrameTsRef = useRef<number>(-1); // Add this ref to track frame sequence
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [canvasScale, setCanvasScale] = useState<WHSize>({ width: 1, height: 1 });
  const [cursorPosition, setCursorPosition] = useState<XYPosition | undefined>(undefined);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [remoteControlOn, setRemoteControlOn] = useState(false);
  const [remoteCursorPosition, setRemoteCursorPosition] = useState<RemoteCursorPosition | undefined>(undefined);
  const [remoteCursorStyle, setRemoteCursorStyle] = useState<RemoteCursorStyle | undefined>(undefined);
  const [serviceWorkerDevtoolUrl, setServiceWorkerDevtoolUrl] = useState<string | undefined>(undefined);

  // Disable remote control and hide cursors when in rewind mode
  useEffect(() => {
    if (isRewindMode) {
      // Disable remote control and interaction events when in rewind mode
      setRemoteControlOn(false);
      disableInteractionEvents();

      // Hide cursors when in rewind mode
      setCursorPosition(undefined);
      setRemoteCursorPosition(undefined);
    } else if (isBrowserSocketConnected) {
      // Re-enable interaction events when returning to live mode
      enableInteractionEvents();
    }
  }, [isRewindMode, isBrowserSocketConnected, disableInteractionEvents, enableInteractionEvents]);

  // handle screencast
  useEffect(() => {
    if (!isBrowserSocketConnected) return;
    if (!browserSocket) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    if (!canvasImageWorkerRef.current) canvasImageWorkerRef.current = new Worker('/web-workers/CanvasImageWorker.js');
    const canvasImageWorker = canvasImageWorkerRef.current;

    // Track if we need to setup screencast
    let needScreencast = !isRewindMode;

    // If we have a currentStep from rewind history and we're in rewind mode, use that screenshot
    if (currentStep && isRewindMode) {
      const img = new window.Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const screenSize = RemoteBrowserConfigs.defaultViewport;
        context.drawImage(img, 0, 0, img.width, img.height, 0, 0, screenSize.width, screenSize.height);
      };
      img.src = currentStep.screenshot;

      // Don't need to set up screencast when in rewind mode
      needScreencast = false;
    }

    // Setup screencast if needed (in live mode)
    if (needScreencast) {
      emitBrowserEvent('get-tabs'); // tabs will be handled by the RemoteBrowserContainer
      emitBrowserEvent('start-screencast');
      browserSocket.on('screencast-frame', (data) => {
        canvasImageWorker.postMessage({
          type: 'PROCESS_FRAME',
          frame: data.frame,
          ts: data.frame.metadata.timestamp,
        });
        canvasImageWorker.onmessage = function (event) {
          const { image, ts } = event.data;
          if (ts < currentFrameTsRef.current) return; // Drop older frames

          canvas.width = image.width;
          canvas.height = image.height;
          const screenSize = RemoteBrowserConfigs.defaultViewport;
          context.drawImage(image, 0, 0, image.width, image.height, 0, 0, screenSize.width, screenSize.height);

          // Update last successful frame and broadcast to workers
          currentFrameTsRef.current = ts;
          canvasImageWorker.postMessage({ type: 'FRAME_PROCESSED', currentFrameTsRef: ts });
        };
      });
      sendBroadcastEvent({ type: BroadcastEventType.ON_REMOTE_CONNECTION_ATTACHED }, undefined);

      if (props.setShouldStartSop) props.setShouldStartSop(true);
    }

    return () => {
      // Remove screencast event listener if it was set up
      if (needScreencast) browserSocket.off('screencast-frame');
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrowserSocketConnected, currentStep, isRewindMode]);

  // handle remote control
  useEffect(() => {
    if (!isBrowserSocketConnected) return;
    if (!browserSocket) return;

    browserSocket.on('cursor-update', (data: { sessionId: string; position: RemoteCursorPosition }) => {
      if (remoteCursorPosition && data.position.ts < remoteCursorPosition.ts) return;

      void handleContentSizeChange();
      setRemoteCursorPosition(data.position);

      if (data.position.event === 'mousedown') {
        setIsMouseDown(true);
      } else if (data.position.event === 'mouseup') {
        setIsMouseDown(false);
      }

      if (!remoteControlOn) setCursorPosition(data.position);
      const cursorType = data.position.cursor.toLowerCase();
      const type = SupportedRemoteCursorTypes.has(cursorType) ? cursorType : 'default';
      const centerOffset = RemoteCursorPositionCenterOffset[type];
      setRemoteCursorStyle({ base64: RemoteCursorTypeToBase64[type], centerOffset });
    });

    return () => void browserSocket.off('cursor-update');

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrowserSocketConnected, remoteCursorPosition]);

  useEffect(() => {
    if (!isBrowserSocketConnected || !remoteControlOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Add non-passive event listeners
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wheelHandler = (e: any) => {
      e.preventDefault();
      handleWheelEvent(e as unknown as React.WheelEvent);
    };
    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    void handleContentSizeChange();

    return () => canvas.removeEventListener('wheel', wheelHandler);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteControlOn]);

  useEffect(() => {
    if (!canvasRef.current) return;
    void handleContentSizeChange();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef.current]);

  useEffect(() => {
    if (props.teachModeOn === undefined) return;

    const exec = async () => {
      if (props.teachModeOn && !isBrowserSocketConnected) {
        await attachToBrowser();
        await WaitUtils.wait(1000); // Wait for the browser to connect // TODO: Find a better way to handle this
      }
      if (props.teachModeOn && !isInteractionEventsEnabled) enableInteractionEvents();
      else if (!props.teachModeOn && isInteractionEventsEnabled) disableInteractionEvents();
    };
    exec();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.teachModeOn, isBrowserSocketConnected]);

  // events
  const handleKeyboardEvent = (event: React.KeyboardEvent) => {
    if (!remoteControlOn) return;
    if (!browserSocket) return;

    event.preventDefault(); // Prevent default browser behavior
    emitBrowserEvent('keyboard-event', { event: event.type, key: event.key });
  };

  const handleMouseLeave = () => {
    if (!remoteControlOn) return;
    if (!browserSocket) return;
    setRemoteControlOn(false);
  };

  const handleMouseEvent = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRewindMode) return;
    if (!remoteControlOn) return;
    if (!canvasRef.current || !browserSocket) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    setCursorPosition({ x, y });
    const position: RemoteCursorPosition = {
      x,
      y,
      tabId: activeTabIdRef.current ?? -1,
      ts: Date.now(),
      cursor: 'default', // This will be updated by the server with actual cursor style
      event: event.type,
    };
    emitBrowserEvent('remote-cursor-position', { position });
  };

  const handleWheelEvent = (event: React.WheelEvent) => {
    if (isRewindMode) return;
    if (!remoteControlOn) return;
    if (!browserSocket) return;
    if (event.ctrlKey) return; // Ignore zoom-related wheel events (usually ctrl + wheel)

    event.preventDefault();
    const { deltaX, deltaY } = event;
    emitBrowserEvent('wheel-event', { deltaX, deltaY });
  };

  const handleContentSizeChange = () => {
    if (!canvasRef.current) return;

    const widthRatio = canvasRef.current.getBoundingClientRect().width / canvasRef.current.width;
    const heightRatio = canvasRef.current.getBoundingClientRect().height / canvasRef.current.height;
    setCanvasScale({ width: widthRatio, height: heightRatio });
  };

  // actions
  const attachToBrowser = async (): Promise<string> => {
    const remoteBrowserSessionIdFromUrl = new URLSearchParams(window.location.search).get('remoteBrowserSessionId');
    const activeSessionId = remoteBrowserSessionIdFromUrl || props.remoteBrowserSessionId || UUID();
    attachToRemoteBrowserSession(activeSessionId);
    return activeSessionId;
  };

  const detachFromBrowser = (killBrowser = false) => {
    if (browserSocket) {
      if (killBrowser) {
        killRemoteBrowserSession();
        props.setRemoteBrowserSessionId(undefined);
      } else {
        detachFromRemoteBrowserSession();
      }
    }

    canvasImageWorkerRef.current?.terminate();
    canvasImageWorkerRef.current = null;
    canvasRef.current = null;

    setCursorPosition(undefined);
    setRemoteControlOn(false);
    setRemoteCursorPosition(undefined);
    setRemoteCursorStyle(undefined);
    setServiceWorkerDevtoolUrl(undefined);
    props.setHideChatWithAiden?.(false);
    if (props.teachModeOn) props.turnOffTeachMode?.();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const renderMainContent = () => {
    if (browserStatus === RemoteBrowserWindowStatus.PENDING || browserStatus === RemoteBrowserWindowStatus.STOPPED) {
      return (
        <button
          className="flex h-full w-full flex-col items-center justify-center bg-black opacity-50"
          onClick={attachToBrowser}
        >
          <PlayCircleIcon className="h-24 w-24 text-white" />
          <p className="mt-4 text-xl font-medium text-white">Attach to Browser</p>
        </button>
      );
    }

    const convertCanvasPositionToWindowPosition = (position?: XYPosition): XYPosition | undefined => {
      if (!canvasRef.current || !position) return undefined;
      return { x: position.x * canvasScale.width, y: position.y * canvasScale.height };
    };
    const applyCenterOffset = (position?: XYPosition, centerOffset?: XYPosition) => {
      if (!position) return undefined;
      if (!centerOffset) return position;
      return { x: position.x + centerOffset.x, y: position.y + centerOffset.y };
    };
    const remoteCursorWindowPosition = convertCanvasPositionToWindowPosition(remoteCursorPosition);
    const remoteCursorAbsolutePosition = applyCenterOffset(remoteCursorWindowPosition, remoteCursorStyle?.centerOffset);
    const cursorAbsolutePosition = convertCanvasPositionToWindowPosition(cursorPosition || remoteCursorPosition);

    return (
      <>
        {browserStatus === RemoteBrowserWindowStatus.LOADING && (
          <div className="flex h-full w-full flex-col items-center justify-center bg-black opacity-50">
            <ArrowsUpDownIcon className="h-24 w-24 text-white" />
            <p className="mt-4 text-xl font-medium text-white">Connecting...</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={cx(
            'absolute inset-0 h-full w-full object-contain',
            remoteControlOn ? 'cursor-none' : 'cursor-auto',
          )}
          style={{ objectFit: 'contain' }}
          tabIndex={0}
          onKeyDown={handleKeyboardEvent}
          onKeyUp={handleKeyboardEvent}
          onMouseDown={handleMouseEvent}
          onMouseMove={handleMouseEvent}
          onMouseOut={handleMouseLeave}
          onMouseUp={handleMouseEvent}
        />
        {browserStatus === RemoteBrowserWindowStatus.READY && !remoteControlOn && !isRewindMode && (
          <Tooltip title="Enable remote control" arrow placement="bottom" enterDelay={500}>
            <div
              className="absolute inset-0 h-full w-full cursor-pointer hover:bg-blue-500/30"
              onClick={() => setRemoteControlOn(true)}
            />
          </Tooltip>
        )}
        {!!remoteCursorStyle && !!remoteCursorAbsolutePosition && !isRewindMode && (
          <Image
            src={remoteCursorStyle.base64}
            alt="cursor"
            width={RemoteCursorSize}
            height={RemoteCursorSize}
            className="pointer-events-none absolute z-50 select-none"
            style={{
              left: `${remoteCursorAbsolutePosition.x}px`,
              top: `${remoteCursorAbsolutePosition.y}px`,
              transform: isMouseDown ? 'scale(0.85)' : 'scale(1)',
              transformOrigin: 'center',
              transitionDuration: '0.1s, 0.1s, 0.1s',
              transitionProperty: remoteControlOn ? 'transform' : 'left, top, transform',
              transitionTimingFunction: 'ease-out, ease-out, ease-out',
            }}
          />
        )}
        {!!cursorAbsolutePosition && !isRewindMode && (
          <div
            className="pointer-events-none absolute z-10 flex h-fit w-fit -translate-x-[50%] -translate-y-[50%] select-none items-center justify-center rounded-full"
            style={{ left: `${cursorAbsolutePosition.x}px`, top: `${cursorAbsolutePosition.y}px` }}
          >
            <svg
              width={RemoteCursorHighlightCircleSize}
              height={RemoteCursorHighlightCircleSize}
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx={RemoteCursorHighlightCircleSize / 2}
                cy={RemoteCursorHighlightCircleSize / 2}
                r={RemoteCursorHighlightCircleSize / 2 - 1}
                stroke="rgba(35, 56, 118, 0.33)"
                strokeWidth="2"
                fill={remoteControlOn ? 'none' : 'rgba(35, 56, 118, 0.15)'}
              />
              <circle
                cx={RemoteCursorHighlightCircleSize / 2}
                cy={RemoteCursorHighlightCircleSize / 2}
                r={RemoteCursorFocusCircleSize / 2}
                fill="rgba(35, 56, 118, 0.33)"
              />
            </svg>
          </div>
        )}
      </>
    );
  };

  const renderFooter = () => {
    if (!props.footer) return null;
    return <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 text-white">{props.footer}</div>;
  };

  // renderer
  return (
    <div className={cx('relative flex flex-col items-center justify-center', props.className)}>
      <RemoteBrowserContainer
        classNameContent="relative rounded-3xl shadow-2xl shadow-blue-600 backdrop-blur-md hover:ring-8 hover:ring-blue-500 overflow-hidden"
        attachToBrowser={attachToBrowser}
        browserSocket={browserSocket}
        browserStatus={browserStatus}
        detachFromBrowser={() => detachFromBrowser(false)}
        killBrowser={() => detachFromBrowser(true)}
        mediaRecorder={mediaRecorderRef.current}
        onActiveTabChange={(tabId) => (activeTabIdRef.current = tabId ?? null)}
        onContentSizeChange={handleContentSizeChange}
        remoteControlOn={remoteControlOn}
        sessionUUID={props.remoteBrowserSessionId}
        setRemoteControlOn={setRemoteControlOn}
      >
        {renderMainContent()}
      </RemoteBrowserContainer>

      {isAdminUser && serviceWorkerDevtoolUrl && (
        <a
          className="absolute bottom-0 left-1/2 mt-4 w-fit -translate-x-1/2 text-sm font-light text-white underline"
          href={serviceWorkerDevtoolUrl}
          target="_blank"
        >
          Service Worker
        </a>
      )}
      {renderFooter()}
    </div>
  );
}
