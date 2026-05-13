import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_SECS = 30 * 24 * 60 * 60; // 30 days

export interface SessionData {
  username:            string;
  avatar_url:          string;
  access_token:        string;
  access_token_secret: string;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET env var must be set and at least 32 characters');
  }
  return s;
}

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function createMobileToken(session: SessionData): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    u:   session.username,
    a:   session.avatar_url,
    t:   session.access_token,
    s:   session.access_token_secret,
    iat: now,
    exp: now + TOKEN_TTL_SECS,
  }));
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyMobileToken(token: string): SessionData | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload  = token.slice(0, dot);
  const sig      = token.slice(dot + 1);
  const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');

  const sigBuf = Buffer.from(sig,      'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const data = JSON.parse(b64urlDecode(payload)) as {
      u?: string; a?: string; t?: string; s?: string; iat?: number; exp?: number;
    };
    if (!data.u || !data.t || !data.s) return null;
    if (!data.exp || Math.floor(Date.now() / 1000) > data.exp) return null;
    return {
      username:            data.u,
      avatar_url:          data.a ?? '',
      access_token:        data.t,
      access_token_secret: data.s,
    };
  } catch {
    return null;
  }
}

export async function getSession(request: Request): Promise<SessionData | null> {
  // Bearer token (iOS / mobile)
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return verifyMobileToken(auth.slice(7));
  }

  // Cookie-based session (web browser)
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = /(?:^|;\s*)discogs_session=([^;]+)/.exec(cookieHeader);
  if (match) {
    return verifyMobileToken(decodeURIComponent(match[1]));
  }

  return null;
}
