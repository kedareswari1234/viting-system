import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, Calculator, Monitor } from 'lucide-react';
import type { AuthUser, MemberRole, VotingState } from '../types';

interface LoginViewProps {
  onLoginSuccess: (token: string, user: AuthUser, state: VotingState) => void;
}

const ROLE_OPTIONS: Array<{
  role: MemberRole;
  label: string;
  summary: string;
  defaultPasscode: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'ultimate',
    label: 'Ultimate',
    summary: 'Configure contestants, toggle voting, and reset the system',
    defaultPasscode: 'admin123',
    icon: ShieldCheck,
  },
  {
    role: 'counter',
    label: 'Counter',
    summary: 'Inspect live tallies, run official vote counts, and export CSV',
    defaultPasscode: 'count123',
    icon: Calculator,
  },
  {
    role: 'viewer',
    label: 'Viewer',
    summary: 'Monitor ESP32 connection, voting status, and published results',
    defaultPasscode: 'view123',
    icon: Monitor,
  },
];

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [selectedRole, setSelectedRole] = useState<MemberRole>('ultimate');
  const [passcode, setPasscode] = useState('admin123');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRoleMeta = ROLE_OPTIONS.find((item) => item.role === selectedRole) ?? ROLE_OPTIONS[0];

  const handleRoleSelect = (role: MemberRole, defaultPass: string) => {
    setSelectedRole(role);
    setPasscode(defaultPass);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, passcode }),
      });

      const payload = (await response.json()) as {
        token?: string;
        user?: AuthUser;
        state?: VotingState;
        error?: string;
      };

      if (!response.ok || !payload.token || !payload.user || !payload.state) {
        setError(payload.error || 'Sign in failed. Check your passcode.');
        return;
      }

      onLoginSuccess(payload.token, payload.user, payload.state);
    } catch {
      setError('Unable to reach voting server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8">
          <p className="text-xs font-medium text-slate-500 mb-2">
            ESP32 Hardware Voting System
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
            Member Sign In
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Choose one of the three member accounts to access the voting console.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Member Role
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {ROLE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = selectedRole === option.role;
                return (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => handleRoleSelect(option.role, option.defaultPasscode)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              {activeRoleMeta.summary}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="member-passcode"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Passcode
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="member-passcode"
                  type={showPasscode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter member passcode"
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 py-2.5 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              {loading ? 'Signing in...' : `Sign in as ${activeRoleMeta.label}`}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2.5">
              Default member credentials
            </p>
            <div className="space-y-1.5 text-xs text-slate-600">
              {ROLE_OPTIONS.map((item) => (
                <div
                  key={item.role}
                  className="flex items-center justify-between py-1"
                >
                  <span>
                    <strong className="font-semibold text-slate-800">{item.label}</strong>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono text-slate-700">{item.defaultPasscode}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRoleSelect(item.role, item.defaultPasscode)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
