import { createHmac } from 'crypto';

export interface SessionData {
  username:            string;
  avatar_url:          string;
  access_token:        string;
  access_token_secret: string;
}

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function createMobileToken(session: SessionData): string {
  const payload = b64url(JSON.stringify({
    u: session.username,
    a: session.avatar_url,
    t: session.access_token,
    s: session.access_token_secret,
    iat: Math.floor(Date.now() / 1000),
  }));
  const secret = process.env.SESSION_SECRET!;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyMobileToken(token: string): SessionData | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const secret  = process.env.SESSION_SECRET!;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload)) as {
      u?: string; a?: string; t?: string; s?: string; iat?: number;
    };
    if (!data.u || !data.t || !data.s) return null;
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
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyMobileToken(auth.slice(7));
}
