import React from 'react';
import type { AuthUser } from '../types';

export type ConsoleTab = 'overview' | 'esp32' | 'activity';

interface TopBarProps {
  user: AuthUser;
  activeTab: ConsoleTab;
  onSelectTab: (tab: ConsoleTab) => void;
  onSignOut: () => void;
}

export function TopBar({ user, activeTab, onSelectTab, onSignOut }: TopBarProps) {
  const navItems: Array<{ id: ConsoleTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'esp32', label: 'ESP32 Setup' },
    { id: 'activity', label: 'Activity Log' },
  ];

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          ESP32 Vote Console
        </span>

        <nav aria-label="Console navigation" className="flex items-center gap-6">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  active
                    ? 'text-slate-900 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden sm:inline text-xs text-slate-600 whitespace-nowrap">
            {user.displayName}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
