import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ActivityLog,
  AuthUser,
  Contestant,
  Esp32Status,
  MemberRole,
  VotingState,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const AUTH_SECRET = process.env.AUTH_SECRET || 'esp32-voting-console-secret-key';
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'voting-state.json');
const ESP32_TIMEOUT_MS = 30_000;

interface InternalContestant {
  index: number;
  name: string;
  votes: number;
}

interface InternalState {
  sessionId: string;
  contestantCount: number;
  contestants: InternalContestant[];
  votingOpen: boolean;
  counted: boolean;
  countedAt: string | null;
  countedBy: string | null;
  countedTotalVotes: number | null;
  countedContestants: InternalContestant[] | null;
  esp32: {
    deviceId: string | null;
    lastSeenAt: string | null;
    rssi: number | null;
    firmware: string | null;
  };
  logs: ActivityLog[];
}

interface MemberCredential {
  role: MemberRole;
  username: string;
  displayName: string;
  passcode: string;
}

const MEMBERS: Record<MemberRole, MemberCredential> = {
  ultimate: {
    role: 'ultimate',
    username: 'ultimate',
    displayName: 'Ultimate Admin',
    passcode: process.env.ULTIMATE_PASSCODE || 'admin123',
  },
  counter: {
    role: 'counter',
    username: 'counter',
    displayName: 'Vote Counter',
    passcode: process.env.COUNTER_PASSCODE || 'count123',
  },
  viewer: {
    role: 'viewer',
    username: 'viewer',
    displayName: 'Status Viewer',
    passcode: process.env.VIEWER_PASSCODE || 'view123',
  },
};

function createDefaultContestants(count: number): InternalContestant[] {
  return Array.from({ length: count }, (_, idx) => ({
    index: idx + 1,
    name: `Contestant ${idx + 1}`,
    votes: 0,
  }));
}

function createInitialState(): InternalState {
  return {
    sessionId: crypto.randomUUID().slice(0, 8),
    contestantCount: 4,
    contestants: createDefaultContestants(4),
    votingOpen: true,
    counted: false,
    countedAt: null,
    countedBy: null,
    countedTotalVotes: null,
    countedContestants: null,
    esp32: {
      deviceId: null,
      lastSeenAt: null,
      rssi: null,
      firmware: null,
    },
    logs: [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: 'System',
        role: 'ultimate',
        action: 'Session initialized',
        detail: 'Configured for 4 contestants. Ready for ESP32 connection.',
      },
    ],
  };
}

function loadState(): InternalState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as InternalState;
      if (parsed && Array.isArray(parsed.contestants) && parsed.contestants.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read saved voting state, initializing fresh state:', err);
  }
  return createInitialState();
}

function saveState(nextState: InternalState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist voting state:', err);
  }
}

let state: InternalState = loadState();
let lastKnownEsp32Connected = isEsp32Connected();

function isEsp32Connected(): boolean {
  if (!state.esp32.lastSeenAt) return false;
  const elapsed = Date.now() - new Date(state.esp32.lastSeenAt).getTime();
  return elapsed <= ESP32_TIMEOUT_MS;
}

function getEsp32Status(): Esp32Status {
  return {
    connected: isEsp32Connected(),
    deviceId: state.esp32.deviceId,
    lastSeenAt: state.esp32.lastSeenAt,
    rssi: state.esp32.rssi,
    firmware: state.esp32.firmware,
  };
}

function appendLog(actor: string, role: MemberRole | 'esp32', action: string, detail: string): void {
  const entry: ActivityLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor,
    role,
    action,
    detail,
  };
  state.logs = [entry, ...state.logs].slice(0, 40);
}

function getStateForRole(role: MemberRole): VotingState {
  const totalVotes = state.contestants.reduce((sum, c) => sum + c.votes, 0);
  const esp32 = getEsp32Status();

  if (role === 'viewer') {
    const contestants: Contestant[] = state.contestants.map((c) => ({
      index: c.index,
      name: c.name,
      votes: state.counted
        ? state.countedContestants?.find((cc) => cc.index === c.index)?.votes ?? c.votes
        : null,
    }));

    return {
      sessionId: state.sessionId,
      contestantCount: state.contestantCount,
      contestants,
      votingOpen: state.votingOpen,
      totalVotes,
      counted: state.counted,
      countedAt: state.countedAt,
      countedBy: state.countedBy,
      countedTotalVotes: state.countedTotalVotes,
      countedContestants: state.countedContestants
        ? state.countedContestants.map((c) => ({ ...c }))
        : null,
      esp32,
      logs: state.logs.slice(0, 15).map((log) => ({
        ...log,
        detail:
          log.role === 'esp32' && log.action === 'Vote recorded' && !state.counted
            ? 'Ballot received from ESP32 hardware'
            : log.detail,
      })),
    };
  }

  return {
    sessionId: state.sessionId,
    contestantCount: state.contestantCount,
    contestants: state.contestants.map((c) => ({ ...c })),
    votingOpen: state.votingOpen,
    totalVotes,
    counted: state.counted,
    countedAt: state.countedAt,
    countedBy: state.countedBy,
    countedTotalVotes: state.countedTotalVotes,
    countedContestants: state.countedContestants
      ? state.countedContestants.map((c) => ({ ...c }))
      : null,
    esp32,
    logs: state.logs,
  };
}

function signToken(user: AuthUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      iat: Date.now(),
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string | undefined | null): AuthUser | null {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthUser;
    if (parsed && (parsed.role === 'ultimate' || parsed.role === 'counter' || parsed.role === 'viewer')) {
      return {
        role: parsed.role,
        username: parsed.username,
        displayName: parsed.displayName,
      };
    }
  } catch {
    return null;
  }
  return null;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.user = user;
  next();
}

function requireRole(roles: MemberRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission for this action.' });
      return;
    }
    next();
  };
}

interface ConnectedSocket {
  ws: WebSocket;
  user: AuthUser;
}

const clients = new Set<ConnectedSocket>();

function broadcastState(): void {
  lastKnownEsp32Connected = isEsp32Connected();
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: 'state',
          data: getStateForRole(client.user.role),
        })
      );
    }
  }
}

setInterval(() => {
  const currentlyConnected = isEsp32Connected();
  if (currentlyConnected !== lastKnownEsp32Connected) {
    lastKnownEsp32Connected = currentlyConnected;
    broadcastState();
  }
}, 5_000);

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Auth routes
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, role, passcode } = req.body as {
      username?: string;
      role?: MemberRole;
      passcode?: string;
    };

    const targetKey = (role || username || '').toLowerCase().trim();
    const member = Object.values(MEMBERS).find(
      (m) => m.role === targetKey || m.username === targetKey
    );

    if (!member || typeof passcode !== 'string' || passcode !== member.passcode) {
      res.status(401).json({ error: 'Invalid member role or passcode.' });
      return;
    }

    const user: AuthUser = {
      role: member.role,
      username: member.username,
      displayName: member.displayName,
    };

    const token = signToken(user);
    res.json({
      token,
      user,
      state: getStateForRole(user.role),
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({
      user: req.user,
      state: getStateForRole(req.user!.role),
    });
  });

  // Member state & control routes
  app.get('/api/state', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json(getStateForRole(req.user!.role));
  });

  app.post(
    '/api/config/contestants',
    requireAuth,
    requireRole(['ultimate']),
    (req: AuthedRequest, res: Response) => {
      const { count, names } = req.body as { count?: unknown; names?: unknown };
      const parsedCount = Number(count);
      if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 12) {
        res.status(400).json({ error: 'Contestant count must be a whole number between 1 and 12.' });
        return;
      }

      const providedNames = Array.isArray(names)
        ? names.map((n) => (typeof n === 'string' ? n.trim().slice(0, 40) : ''))
        : [];

      const nextContestants: InternalContestant[] = Array.from({ length: parsedCount }, (_, idx) => {
        const existing = state.contestants[idx];
        const fallbackName = existing?.name || `Contestant ${idx + 1}`;
        const customName = providedNames[idx] && providedNames[idx].length > 0 ? providedNames[idx] : fallbackName;
        return {
          index: idx + 1,
          name: customName,
          votes: existing ? existing.votes : 0,
        };
      });

      const prevCount = state.contestantCount;
      state.contestantCount = parsedCount;
      state.contestants = nextContestants;
      if (state.counted) {
        state.counted = false;
      }

      appendLog(
        req.user!.displayName,
        req.user!.role,
        'Contestants updated',
        prevCount !== parsedCount
          ? `Set number of contestants from ${prevCount} to ${parsedCount}.`
          : `Updated contestant labels for ${parsedCount} contestants.`
      );

      saveState(state);
      broadcastState();
      res.json(getStateForRole(req.user!.role));
    }
  );

  app.post(
    '/api/config/voting-status',
    requireAuth,
    requireRole(['ultimate']),
    (req: AuthedRequest, res: Response) => {
      const { votingOpen } = req.body as { votingOpen?: unknown };
      if (typeof votingOpen !== 'boolean') {
        res.status(400).json({ error: 'votingOpen boolean is required.' });
        return;
      }

      state.votingOpen = votingOpen;
      appendLog(
        req.user!.displayName,
        req.user!.role,
        votingOpen ? 'Voting opened' : 'Voting paused',
        votingOpen
          ? 'ESP32 hardware can now submit ballots.'
          : 'Incoming ESP32 ballots are temporarily locked.'
      );

      saveState(state);
      broadcastState();
      res.json(getStateForRole(req.user!.role));
    }
  );

  app.post(
    '/api/count',
    requireAuth,
    requireRole(['counter', 'ultimate']),
    (req: AuthedRequest, res: Response) => {
      const total = state.contestants.reduce((sum, c) => sum + c.votes, 0);
      state.counted = true;
      state.countedAt = new Date().toISOString();
      state.countedBy = req.user!.displayName;
      state.countedTotalVotes = total;
      state.countedContestants = state.contestants.map((c) => ({ ...c }));

      const sorted = [...state.countedContestants].sort((a, b) => b.votes - a.votes);
      const leaderSummary =
        total === 0
          ? 'No ballots cast yet (0 total).'
          : `Tallied ${total} vote${total === 1 ? '' : 's'}. Leading: ${sorted[0].name} (${sorted[0].votes}).`;

      appendLog(req.user!.displayName, req.user!.role, 'Votes counted', leaderSummary);
      saveState(state);
      broadcastState();
      res.json(getStateForRole(req.user!.role));
    }
  );

  app.post(
    '/api/reset',
    requireAuth,
    requireRole(['ultimate']),
    (req: AuthedRequest, res: Response) => {
      const { resetNames } = (req.body || {}) as { resetNames?: boolean };
      state.sessionId = crypto.randomUUID().slice(0, 8);
      state.contestants = state.contestants.map((c, idx) => ({
        index: idx + 1,
        name: resetNames ? `Contestant ${idx + 1}` : c.name,
        votes: 0,
      }));
      state.votingOpen = true;
      state.counted = false;
      state.countedAt = null;
      state.countedBy = null;
      state.countedTotalVotes = null;
      state.countedContestants = null;

      appendLog(
        req.user!.displayName,
        req.user!.role,
        'System reset',
        `Cleared all vote tallies and started session ${state.sessionId} (${state.contestantCount} contestants).`
      );

      saveState(state);
      broadcastState();
      res.json(getStateForRole(req.user!.role));
    }
  );

  // ESP32 hardware endpoints
  app.get('/api/esp32/config', (req: Request, res: Response) => {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.slice(0, 40) : null;
    const rssiParam = req.query.rssi !== undefined ? Number(req.query.rssi) : null;
    const firmware = typeof req.query.firmware === 'string' ? req.query.firmware.slice(0, 32) : null;

    const wasConnected = isEsp32Connected();
    state.esp32.lastSeenAt = new Date().toISOString();
    if (deviceId) state.esp32.deviceId = deviceId;
    if (rssiParam !== null && Number.isFinite(rssiParam)) state.esp32.rssi = rssiParam;
    if (firmware) state.esp32.firmware = firmware;

    if (!wasConnected) {
      appendLog(
        state.esp32.deviceId || 'ESP32',
        'esp32',
        'Device connected',
        `ESP32 synced configuration (${state.contestantCount} contestants).`
      );
      saveState(state);
      broadcastState();
    }

    res.json({
      sessionId: state.sessionId,
      contestantCount: state.contestantCount,
      votingOpen: state.votingOpen,
      totalVotes: state.contestants.reduce((sum, c) => sum + c.votes, 0),
    });
  });

  app.post('/api/esp32/heartbeat', (req: Request, res: Response) => {
    const { deviceId, rssi, firmware } = (req.body || {}) as {
      deviceId?: string;
      rssi?: number;
      firmware?: string;
    };

    const wasConnected = isEsp32Connected();
    state.esp32.lastSeenAt = new Date().toISOString();
    if (typeof deviceId === 'string' && deviceId.trim()) {
      state.esp32.deviceId = deviceId.trim().slice(0, 40);
    }
    if (typeof rssi === 'number' && Number.isFinite(rssi)) {
      state.esp32.rssi = rssi;
    }
    if (typeof firmware === 'string' && firmware.trim()) {
      state.esp32.firmware = firmware.trim().slice(0, 32);
    }

    if (!wasConnected) {
      appendLog(
        state.esp32.deviceId || 'ESP32',
        'esp32',
        'Device online',
        'ESP32 heartbeat registered.'
      );
    }

    saveState(state);
    broadcastState();
    res.json({
      ok: true,
      sessionId: state.sessionId,
      contestantCount: state.contestantCount,
      votingOpen: state.votingOpen,
    });
  });

  app.post('/api/esp32/vote', (req: Request, res: Response) => {
    const { contestantIndex, deviceId, rssi } = (req.body || {}) as {
      contestantIndex?: unknown;
      deviceId?: string;
      rssi?: number;
    };

    state.esp32.lastSeenAt = new Date().toISOString();
    if (typeof deviceId === 'string' && deviceId.trim()) {
      state.esp32.deviceId = deviceId.trim().slice(0, 40);
    }
    if (typeof rssi === 'number' && Number.isFinite(rssi)) {
      state.esp32.rssi = rssi;
    }

    if (!state.votingOpen) {
      saveState(state);
      broadcastState();
      res.status(409).json({
        ok: false,
        error: 'Voting is currently paused by Ultimate Admin.',
      });
      return;
    }

    const index = Number(contestantIndex);
    if (!Number.isInteger(index) || index < 1 || index > state.contestantCount) {
      res.status(400).json({
        ok: false,
        error: `contestantIndex must be between 1 and ${state.contestantCount}.`,
      });
      return;
    }

    const target = state.contestants[index - 1];
    target.votes += 1;
    const totalVotes = state.contestants.reduce((sum, c) => sum + c.votes, 0);

    appendLog(
      state.esp32.deviceId || 'ESP32',
      'esp32',
      'Vote recorded',
      `Button #${index} (${target.name}) · Total ballots: ${totalVotes}`
    );

    saveState(state);
    broadcastState();

    res.json({
      ok: true,
      contestantIndex: index,
      contestantName: target.name,
      totalVotes,
      sessionId: state.sessionId,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    const user = verifyToken(token);

    if (!user) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    const client: ConnectedSocket = { ws, user };
    clients.add(client);

    ws.send(
      JSON.stringify({
        type: 'state',
        data: getStateForRole(user.role),
      })
    );

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ESP32 Voting Console running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
