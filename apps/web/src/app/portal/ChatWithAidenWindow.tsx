'use client';

import { ChatBubbleLeftRightIcon, ChevronDownIcon, PencilSquareIcon } from '@heroicons/react/24/solid';
import { Alert, Snackbar } from '@mui/material';
import { useChat } from 'ai/react';
import { useEffect, useRef, useState } from 'react';
import { X_REMOTE_BROWSER_SESSION_ID_HEADER } from '~shared/http/headers';
import { ALogger } from '~shared/logging/ALogger';
import { AiAidenApiMessageAnnotation, AiAidenStreamDataSchema } from '~src/app/api/ai/aiden/AiAidenApi';
import { BrowserRewindStep } from '~src/app/portal/BrowserRewind';
import { AiMessageChatBoxInput } from '~src/components/chat-box/AiMessageChatBoxInput';
import AiMessagesForChatBox from '~src/components/chat-box/AiMessagesForChatBox';
import { ScrollToBottomButton } from '~src/components/chat-box/ScrollToBottomButton';
import { useBrowserRewindHistory } from '~src/contexts/BrowserRewindHistoryContext';

interface Props {
  className?: string;
  remoteBrowserSessionId?: string;
}

export default function ChatWithAidenWindow(props: Props) {
  const [errorSnackbar, setErrorSnackbar] = useState({ open: false, message: '' });
  const [isChatWithAidenOpen, setChatWithAidenOpen] = useState(true);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const { addRewindStep, rewindSteps } = useBrowserRewindHistory();

  const aiSdkApi = '/api/ai/aiden';
  const {
    messages,
    setMessages,
    isLoading,
    append,
    stop,
    data: rawData,
    setData,
  } = useChat({
    api: aiSdkApi,
    headers: props.remoteBrowserSessionId
      ? { [X_REMOTE_BROWSER_SESSION_ID_HEADER]: props.remoteBrowserSessionId }
      : undefined,
    onError: (err) => {
      let errorMessage = err.message;
      ALogger.warn({ context: 'Chat error received', error: errorMessage });
      if (errorMessage) setErrorSnackbar({ open: true, message: errorMessage });
    },
  });
  const data = rawData?.map((d) => AiAidenStreamDataSchema.parse(d)) ?? [];
  const stateInfos = data.filter((d) => d.type === 'state-info');
  const annotationMap = stateInfos.reduce(
    (acc, stateInfo, i) => {
      const messageId = messages.filter((m) => m.role === 'assistant')[i]?.id;
      if (messageId) acc[messageId] = stateInfo.annotation;
      return acc;
    },
    {} as Record<string, AiAidenApiMessageAnnotation>,
  );
  const errors = data.filter((d) => d.type === 'error');
  const lastErrorElement = errors.length > 0 ? errors[errors.length - 1] : undefined;
  const lastError = lastErrorElement ? new Error(lastErrorElement?.error) : undefined;

  useEffect(() => {
    if (messages.length && !userHasScrolled) {
      scrollToBottom();
    }
  }, [messages, userHasScrolled]);

  // Process stream data to extract annotations and add to rewind history
  useEffect(() => {
    if (!stateInfos.length) return;

    // Process all stateInfo elements that aren't already in rewindSteps
    for (let i = rewindSteps.length; i < stateInfos.length; i++) {
      const stateInfo = stateInfos[i];
      if (stateInfo.type === 'state-info') {
        const annotation = stateInfo.annotation;

        // Create a new step from the annotation
        const newStep: BrowserRewindStep = {
          timestamp: annotation.ts,
          screenshot: annotation.beforeStateBase64,
          action: annotation.stateDescription || 'Agent action',
          annotation: annotation,
        };

        // Add the step to the history
        addRewindStep(newStep);
      }
    }
  }, [stateInfos, addRewindStep, rewindSteps.length]);

  // This would replace the current mock steps with real agent steps
  const processedStateInfoTimestamps = useRef(new Set<number>());

  useEffect(() => {
    if (!stateInfos.length) return;

    stateInfos.forEach((stateInfo) => {
      const { annotation } = stateInfo;
      if (processedStateInfoTimestamps.current.has(annotation.ts)) return;
      processedStateInfoTimestamps.current.add(annotation.ts);
      const screenshot = annotation.beforeStateBase64 ?? '';
      const step: BrowserRewindStep = {
        timestamp: annotation.ts,
        screenshot,
        action: annotation.stateDescription || 'Browser action',
        annotation,
      };

      addRewindStep(step);
    });
  }, [stateInfos, addRewindStep]);

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current || {};
    if (!scrollTop || !scrollHeight || !clientHeight) return;

    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

    if (!isAtBottom) {
      setUserHasScrolled(true);
    } else {
      setUserHasScrolled(false);
    }
  };

  const scrollToBottom = () => {
    if (!scrollableRef.current) return;
    scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
  };

  const resetState = () => {
    setMessages([]);
    setData([]);
  };

  const handleCloseErrorSnackbar = () => {
    setErrorSnackbar({ ...errorSnackbar, open: false });
  };

  if (!isChatWithAidenOpen)
    return (
      <button
        className="absolute bottom-12 right-12 flex h-10 w-10 items-center justify-center overflow-visible rounded-full shadow-centered shadow-blue-600/60 backdrop-blur-md transition-all duration-300 ease-in-out"
        onClick={() => setChatWithAidenOpen(true)}
      >
        <ChatBubbleLeftRightIcon className="z-10 h-6 w-6 text-white" />
      </button>
    );

  return (
    <div className={props.className}>
      <div className="relative h-full w-full overflow-hidden rounded-3xl shadow-2xl shadow-blue-600 backdrop-blur-md">
        <div className="fixed left-0 top-0 z-50 flex h-12 w-full items-center justify-center bg-sky-800/95 shadow-xl shadow-fuchsia-600/50 backdrop-blur-sm">
          <h1 className="text-white">Chat with Aiden</h1>
          <button
            className="absolute left-5 top-4 flex h-5 w-5 items-center justify-center"
            onClick={() => setChatWithAidenOpen(false)}
          >
            <ChevronDownIcon className="h-full w-full text-white" />
          </button>
          <button className="absolute right-5 top-4 flex h-5 w-5 items-center justify-center" onClick={resetState}>
            <PencilSquareIcon className="h-full w-full text-white" />
          </button>
        </div>

        <>
          <AiMessagesForChatBox
            annotationMap={annotationMap}
            error={lastError}
            logoSubtitle="Chat with Aiden"
            messages={messages}
            onScroll={handleScroll}
            scrollableRef={scrollableRef}
          />
          {userHasScrolled && (
            <ScrollToBottomButton
              scrollToBottom={() => {
                scrollToBottom();
                setUserHasScrolled(false);
              }}
            />
          )}
          <AiMessageChatBoxInput
            stop={stop}
            formRef={formRef}
            loading={isLoading}
            messages={messages}
            append={append}
          />
        </>
      </div>

      <Snackbar
        open={errorSnackbar.open}
        autoHideDuration={5_000}
        onClose={handleCloseErrorSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseErrorSnackbar} severity="warning" variant="filled" sx={{ width: '100%' }}>
          {errorSnackbar.message.length > 200 ? `${errorSnackbar.message.substring(0, 200)}...` : errorSnackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
