'use client';

import { AcademicCapIcon, BriefcaseIcon, Cog8ToothIcon, KeyIcon } from '@heroicons/react/24/solid';
import cx from 'classnames';
import { useSearchParams, useRouter } from 'next/navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import DebugInteractionsPage from '~src/app/extension/debug/interactions/DebugInteractionsPage';
import ChatWithAidenWindow from '~src/app/portal/ChatWithAidenWindow';
import CookieModal from '~src/app/portal/CookieModal';
import SOPExecutionWindow from '~src/app/portal/SOPExecutionWindow';
import SOPModal from '~src/app/portal/SOPModal';
import TeachAidenWindow from '~src/app/portal/TeachAidenWindow';
import UserConfigModal from '~src/app/portal/UserConfigModal';
import { WebsocketRemoteBrowserWindow } from '~src/app/portal/WebsocketRemoteBrowserWindow';
import { MeshBackgroundWithUserSession } from '~src/components/MeshBackgroundWithUserSession';
import { BrowserRewindHistoryProvider } from '~src/contexts/BrowserRewindHistoryContext';
import { InteractionEventProvider } from '~src/contexts/InteractionEventContext';
import { UserSessionContext } from '~src/contexts/UserSessionContext';
import { useSopStore } from '~src/store/sopStore';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function PortalPage() {
  const [remoteBrowserSessionId, setRemoteBrowserSessionId] = useState<string | undefined>(undefined);
  const [showDebugInteractions, setShowDebugInteractions] = useState(false);
  const [hideChatWithAiden, setHideChatWithAiden] = useState(false);
  const [teachModeOn, setTeachModeOn] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [showUserConfigModal, setShowUserConfigModal] = useState(false);
  const [shouldStartSop, setShouldStartSop] = useState(false);
  const [showSopModal, setShowSopModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { sops, isLoading, fetchSops } = useSopStore();
  const { session } = useContext(UserSessionContext);
  const searchParams = useSearchParams();
  const router = useRouter();
  const sopId = searchParams?.get('sopId');

  // Check authentication status on mount and listen for auth state changes
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error fetching session:', error);
        if (!isRedirecting) {
          setIsRedirecting(true);
          router.push(`/login?target=${encodeURIComponent('/portal')}`);
        }
        return;
      }

      if (!session) {
        console.log('No session found, redirecting to login');
        if (!isRedirecting) {
          setIsRedirecting(true);
          router.push(`/login?target=${encodeURIComponent('/portal')}`);
        }
        return;
      }

      console.log('Session found:', session);
      setIsAuthenticated(true);
      setIsRedirecting(false);
    };

    // Initial session check
    checkSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session);
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        setIsRedirecting(false);
      } else if (event === 'SIGNED_OUT') {
        if (window.location.pathname === '/login' || isRedirecting) return;
        setIsRedirecting(true);
        router.push(`/login?target=${encodeURIComponent('/portal')}`);
      }
    });

    // Cleanup listener on unmount
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router, isRedirecting]);

  // Fetch SOPs if sopId is present and user is authenticated
  useEffect(() => {
    if (!sopId || !isAuthenticated) return;
    if (sops.length === 0 && !isLoading) fetchSops();
  }, [sopId, fetchSops, sops, isLoading, isAuthenticated]);

  const selectedSop = useMemo(() => {
    return sopId && sops.length > 0 ? sops.find((s) => s.id === sopId) : undefined;
  }, [sopId, sops]);

  const renderChatWindow = () => {
    if (hideChatWithAiden) return null;
    if (teachModeOn)
      return (
        <TeachAidenWindow
          className="flex w-96 flex-shrink-0 flex-grow-0 p-4 pt-20"
          remoteBrowserSessionId={remoteBrowserSessionId}
        />
      );
    if (selectedSop)
      return (
        <SOPExecutionWindow
          className="flex w-96 flex-shrink-0 flex-grow-0 p-4 pt-20"
          remoteBrowserSessionId={remoteBrowserSessionId}
          sop={selectedSop}
          shouldStartSop={shouldStartSop}
        />
      );
    return (
      <ChatWithAidenWindow
        className="flex w-96 flex-shrink-0 flex-grow-0 p-4 pt-20"
        remoteBrowserSessionId={remoteBrowserSessionId}
      />
    );
  };

  if (isAuthenticated === null) {
    return <div>Checking authentication...</div>;
  }

  if (!isAuthenticated) {
    return null; // Redirect will happen via router.push
  }

  return (
    <InteractionEventProvider>
      <BrowserRewindHistoryProvider>
        <MeshBackgroundWithUserSession navigationTargetPath="/home" navigationTitle="Home">
          <WebsocketRemoteBrowserWindow
            className="flex h-full w-4/5 flex-1 flex-shrink-0 flex-grow"
            remoteBrowserSessionId={remoteBrowserSessionId}
            setHideChatWithAiden={setHideChatWithAiden}
            setRemoteBrowserSessionId={setRemoteBrowserSessionId}
            teachModeOn={teachModeOn}
            turnOffTeachMode={() => setTeachModeOn(false)}
            setShouldStartSop={selectedSop ? setShouldStartSop : undefined}
          />
          {renderChatWindow()}

          <div className="fixed bottom-4 left-4 z-50 flex h-fit w-fit flex-row text-white">
            <button
              className={cx(
                'mx-1 h-fit w-fit rounded-full p-2 text-white shadow-2xl shadow-black',
                teachModeOn ? 'bg-green-300/50' : 'bg-blue-300/50'
              )}
              onClick={() => setTeachModeOn((prev) => !prev)}
            >
              <AcademicCapIcon className="h-6 w-6" />
            </button>
            <button
              className="mx-1 h-fit w-fit rounded-full bg-blue-300/50 p-2 text-white shadow-2xl shadow-black"
              onClick={() => setShowCookieModal(true)}
            >
              <KeyIcon className="h-6 w-6" />
            </button>
            <button
              className="mx-1 h-fit w-fit rounded-full bg-blue-300/50 p-2 text-white shadow-2xl shadow-black"
              onClick={() => setShowUserConfigModal(true)}
            >
              <Cog8ToothIcon className="h-6 w-6" />
            </button>
            <button
              className="mx-1 h-fit w-fit rounded-full bg-blue-300/50 p-2 text-white shadow-2xl shadow-black"
              onClick={() => setShowSopModal(true)}
            >
              <BriefcaseIcon className="h-6 w-6" />
            </button>
          </div>

          {showDebugInteractions && (
            <div className="absolute bottom-0 right-0 z-50 flex h-full w-[20%] flex-shrink-0 flex-grow-0 items-center justify-center bg-black/80 backdrop-blur-sm">
              <DebugInteractionsPage
                remoteBrowserSessionId={remoteBrowserSessionId}
                onClose={() => setShowDebugInteractions(false)}
              />
            </div>
          )}
          {showCookieModal && <CookieModal isOpen={showCookieModal} onClose={() => setShowCookieModal(false)} />}
          {showUserConfigModal && (
            <UserConfigModal
              userId={session?.user?.id ?? ''}
              isOpen={showUserConfigModal}
              onClose={() => setShowUserConfigModal(false)}
            />
          )}
          {showSopModal && <SOPModal isOpen={showSopModal} onClose={() => setShowSopModal(false)} />}
        </MeshBackgroundWithUserSession>
      </BrowserRewindHistoryProvider>
    </InteractionEventProvider>
  );
}