import React from 'react';
import type { ActivityLog } from '../types';

interface ActivityLogViewProps {
  logs: ActivityLog[];
}

export function ActivityLogView({ logs }: ActivityLogViewProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">
          System Activity Log
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Recent ESP32 ballots, counting actions, and configuration changes.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No activity recorded in this session yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-600">
                <th className="py-3 pl-6 pr-3 w-28">Time</th>
                <th className="py-3 px-3 w-36">Source</th>
                <th className="py-3 px-3 w-40">Event</th>
                <th className="py-3 pl-3 pr-6">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {logs.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/70">
                  <td className="py-3 pl-6 pr-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                    {entry.actor}
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                    {entry.action}
                  </td>
                  <td className="py-3 pl-3 pr-6 text-slate-600">
                    {entry.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
