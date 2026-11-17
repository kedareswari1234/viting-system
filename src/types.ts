export type MemberRole = 'ultimate' | 'counter' | 'viewer';

export interface AuthUser {
  role: MemberRole;
  username: string;
  displayName: string;
}

export interface Contestant {
  index: number;
  name: string;
  votes: number | null;
}

export interface Esp32Status {
  connected: boolean;
  deviceId: string | null;
  lastSeenAt: string | null;
  rssi: number | null;
  firmware: string | null;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  actor: string;
  role: MemberRole | 'esp32';
  action: string;
  detail: string;
}

export interface VotingState {
  sessionId: string;
  contestantCount: number;
  contestants: Contestant[];
  votingOpen: boolean;
  totalVotes: number;
  counted: boolean;
  countedAt: string | null;
  countedBy: string | null;
  countedTotalVotes: number | null;
  countedContestants: Contestant[] | null;
  esp32: Esp32Status;
  logs: ActivityLog[];
}
