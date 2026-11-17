import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityLogView } from './components/ActivityLogView';
import { DashboardView } from './components/DashboardView';
import { Esp32SetupPanel } from './components/Esp32SetupPanel';
import { LoginView } from './components/LoginView';
import { TopBar, type ConsoleTab } from './components/TopBar';
import type { AuthUser, VotingState } from './types';

const TOKEN_STORAGE_KEY = 'esp32_vote_session_token';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [votingState, setVotingState] = useState<VotingState | null>(null);
  const [initializing, setInitializing] = useState<boolean>(Boolean(token));
  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');
  const reconnectTimerRef = useRef<number | null>(null);

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setVotingState(null);
    setActiveTab('overview');
  }, []);

  useEffect(() => {
    if (!token) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Session expired');
        return (await res.json()) as { user: AuthUser; state: VotingState };
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user);
          setVotingState(data.state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          handleSignOut();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, handleSignOut]);

  useEffect(() => {
    if (!token || !user) return;

    let active = true;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (!active) return;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            data?: VotingState;
          };
          if (payload.type === 'state' && payload.data) {
            setVotingState(payload.data);
          }
        } catch {
          // Ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (!active) return;
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [token, user]);

  const handleLoginSuccess = (
    nextToken: string,
    nextUser: AuthUser,
    nextState: VotingState
  ) => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setVotingState(nextState);
    setActiveTab('overview');
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Loading voting console...</p>
      </div>
    );
  }

  if (!token || !user || !votingState) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSignOut={handleSignOut}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'overview' && (
          <DashboardView
            user={user}
            token={token}
            state={votingState}
            onStateUpdate={setVotingState}
          />
        )}

        {activeTab === 'esp32' && (
          <Esp32SetupPanel state={votingState} userRole={user.role} />
        )}

        {activeTab === 'activity' && (
          <ActivityLogView logs={votingState.logs} />
        )}
      </main>
    </div>
  );
}
