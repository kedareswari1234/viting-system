import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { AuthUser, VotingState } from '../types';

interface DashboardViewProps {
  user: AuthUser;
  token: string;
  state: VotingState;
  onStateUpdate: (nextState: VotingState) => void;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DashboardView({ user, token, state, onStateUpdate }: DashboardViewProps) {
  const [draftCount, setDraftCount] = useState<number>(state.contestantCount);
  const [draftNames, setDraftNames] = useState<string[]>(
    state.contestants.map((c) => c.name)
  );
  const [editingNames, setEditingNames] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDraftCount(state.contestantCount);
    setDraftNames((prev) => {
      return Array.from({ length: state.contestantCount }, (_, i) => {
        return state.contestants[i]?.name ?? prev[i] ?? `Contestant ${i + 1}`;
      });
    });
  }, [state.contestantCount, state.contestants]);

  const isUltimate = user.role === 'ultimate';
  const isCounter = user.role === 'counter';
  const isViewer = user.role === 'viewer';

  const handleAdjustCount = (nextCount: number) => {
    const clamped = Math.min(12, Math.max(1, nextCount));
    setDraftCount(clamped);
    setDraftNames((prev) =>
      Array.from({ length: clamped }, (_, i) => prev[i] || `Contestant ${i + 1}`)
    );
  };

  const handleSaveContestants = async () => {
    setBusyAction('contestants');
    setFeedback(null);
    try {
      const res = await fetch('/api/config/contestants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          count: draftCount,
          names: draftNames.slice(0, draftCount),
        }),
      });
      const data = (await res.json()) as VotingState & { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not update contestants.' });
        return;
      }
      onStateUpdate(data);
      setEditingNames(false);
      setFeedback({ type: 'ok', text: `Configured ${draftCount} contestants.` });
    } catch {
      setFeedback({ type: 'err', text: 'Connection error while saving contestants.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleVoting = async () => {
    setBusyAction('voting');
    setFeedback(null);
    try {
      const res = await fetch('/api/config/voting-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ votingOpen: !state.votingOpen }),
      });
      const data = (await res.json()) as VotingState & { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to update voting state.' });
        return;
      }
      onStateUpdate(data);
      setFeedback({
        type: 'ok',
        text: data.votingOpen ? 'Voting is now open.' : 'Voting is now paused.',
      });
    } catch {
      setFeedback({ type: 'err', text: 'Connection error while toggling voting.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCountVotes = async () => {
    setBusyAction('count');
    setFeedback(null);
    try {
      const res = await fetch('/api/count', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as VotingState & { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to count votes.' });
        return;
      }
      onStateUpdate(data);
      setFeedback({
        type: 'ok',
        text: `Official count published (${data.totalVotes} total ballots).`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Connection error while counting votes.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetSystem = async () => {
    setBusyAction('reset');
    setFeedback(null);
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resetNames: false }),
      });
      const data = (await res.json()) as VotingState & { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to reset system.' });
        return;
      }
      onStateUpdate(data);
      setConfirmReset(false);
      setFeedback({ type: 'ok', text: 'All votes cleared and new session started.' });
    } catch {
      setFeedback({ type: 'err', text: 'Connection error while resetting system.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['Contestant #', 'Name', 'Votes', 'Share (%)'],
      ...state.contestants.map((c) => {
        const votes = c.votes ?? 0;
        const pct = state.totalVotes > 0 ? ((votes / state.totalVotes) * 100).toFixed(1) : '0.0';
        return [String(c.index), `"${c.name.replace(/"/g, '""')}"`, String(votes), pct];
      }),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `esp32-votes-${state.sessionId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const showDetailedCounts = !isViewer || state.counted;
  const maxVotes = showDetailedCounts
    ? Math.max(0, ...state.contestants.map((c) => c.votes ?? 0))
    : 0;
  const uncountedDelta =
    state.counted && state.countedTotalVotes !== null
      ? state.totalVotes - state.countedTotalVotes
      : 0;

  return (
    <div className="space-y-6">
      {/* Status Summary Strip */}
      <section
        aria-label="System status summary"
        className="bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">ESP32 Hardware</p>
          <div className="mt-2 flex items-center gap-2">
            {state.esp32.connected ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-base font-semibold text-emerald-700">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-base font-semibold text-slate-700">Standby</span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums truncate">
            {state.esp32.deviceId || 'No device paired'} · {formatRelativeTime(state.esp32.lastSeenAt)}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Voting Status</p>
          <div className="mt-2 flex items-center gap-2">
            {state.votingOpen ? (
              <>
                <Unlock className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-base font-semibold text-slate-900">Open</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-base font-semibold text-amber-700">Paused</span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
            Session {state.sessionId}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Contestants</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {state.contestantCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Active button channels
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Ballots</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {state.totalVotes}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {state.counted
              ? `Counted ${formatRelativeTime(state.countedAt)}`
              : 'Awaiting official count'}
          </p>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Role-Specific Control Bar */}
      {isUltimate && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Ultimate System Controls
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Set the number of contestants, open or pause ESP32 voting, or reset the entire session.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleToggleVoting}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {state.votingOpen ? (
                  <>
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span>Pause Voting</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-emerald-600" />
                    <span>Open Voting</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCountVotes}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Calculator className="w-4 h-4 text-blue-600" />
                <span>{state.counted ? 'Recount Votes' : 'Count Votes'}</span>
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset System</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 border border-red-200 bg-red-50 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-medium text-red-800 whitespace-nowrap">
                    Clear all {state.totalVotes} votes?
                  </span>
                  <button
                    type="button"
                    onClick={handleResetSystem}
                    disabled={busyAction !== null}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 cursor-pointer whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label
                    htmlFor="contestant-count-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Number of Contestants (1 to 12)
                  </label>
                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white">
                    <button
                      type="button"
                      onClick={() => handleAdjustCount(draftCount - 1)}
                      disabled={draftCount <= 1}
                      aria-label="Decrease contestants"
                      className="p-2.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      id="contestant-count-input"
                      type="number"
                      min={1}
                      max={12}
                      value={draftCount}
                      onChange={(e) => handleAdjustCount(Number(e.target.value) || 1)}
                      className="w-14 text-center text-sm font-mono font-semibold text-slate-900 tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAdjustCount(draftCount + 1)}
                      disabled={draftCount >= 12}
                      aria-label="Increase contestants"
                      className="p-2.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingNames((prev) => !prev)}
                  className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {editingNames ? 'Hide Names' : 'Edit Contestant Names'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveContestants}
                disabled={busyAction !== null}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'contestants' ? 'Saving...' : 'Apply Contestant Setup'}
              </button>
            </div>

            {editingNames && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: draftCount }, (_, idx) => (
                  <div key={idx}>
                    <label
                      htmlFor={`contestant-name-${idx + 1}`}
                      className="block text-xs text-slate-500 mb-1"
                    >
                      Contestant {idx + 1}
                    </label>
                    <input
                      id={`contestant-name-${idx + 1}`}
                      type="text"
                      maxLength={40}
                      value={draftNames[idx] ?? `Contestant ${idx + 1}`}
                      onChange={(e) => {
                        const updated = [...draftNames];
                        updated[idx] = e.target.value;
                        setDraftNames(updated);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {isCounter && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Vote Counting & Verification
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {state.counted
                ? `Last counted by ${state.countedBy} · ${state.countedTotalVotes} ballots tallied.`
                : 'Run an official vote count to publish the results to status viewers.'}
            </p>
            {uncountedDelta > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {uncountedDelta} new ballot{uncountedDelta === 1 ? '' : 's'} received since last count.
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleCountVotes}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Calculator className="w-4 h-4" />
              <span>{state.counted ? 'Recount & Publish' : 'Count Votes'}</span>
            </button>
          </div>
        </section>
      )}

      {isViewer && (
        <section className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Status Monitoring Mode
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {state.counted
                ? `Official tally published by ${state.countedBy} at ${new Date(
                    state.countedAt || Date.now()
                  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                : 'Live hardware and ballot totals are active. Per-contestant totals appear once counted by the Counter.'}
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Read-only access
          </span>
        </section>
      )}

      {/* Contestants & Tally Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Contestant Tally
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {showDetailedCounts
                ? `${state.contestantCount} contestants · ${state.totalVotes} total ballots`
                : `${state.contestantCount} contestants configured · Awaiting official count`}
            </p>
          </div>
          {!isViewer && (
            <span className="text-xs text-slate-500">
              {state.counted ? 'Official tally published' : 'Live uncounted preview'}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-600">
                <th className="py-3 pl-6 pr-3 w-16">#</th>
                <th className="py-3 px-3">Contestant</th>
                <th className="py-3 px-3 w-1/3">Vote Share</th>
                <th className="py-3 pl-3 pr-6 text-right w-32">Votes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {state.contestants.map((contestant) => {
                const votes = contestant.votes ?? 0;
                const denominator =
                  isViewer && state.counted && state.countedTotalVotes !== null
                    ? state.countedTotalVotes
                    : state.totalVotes;
                const pct = denominator > 0 ? (votes / denominator) * 100 : 0;
                const isLeader =
                  showDetailedCounts && maxVotes > 0 && votes === maxVotes;

                return (
                  <tr key={contestant.index} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 pl-6 pr-3 font-mono text-xs text-slate-500 tabular-nums">
                      {String(contestant.index).padStart(2, '0')}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <span>{contestant.name}</span>
                        {isLeader && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Leading</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      {showDetailedCounts ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-mono text-xs text-slate-600 tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Hidden until counted
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {showDetailedCounts ? votes : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
