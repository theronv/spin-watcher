import { cookies } from 'next/headers';

export interface SessionData {
  username:            string;
  avatar_url:          string;
  access_token:        string;
  access_token_secret: string;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('discogs_session')?.value;
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<SessionData>;
    if (!data.username || !data.access_token || !data.access_token_secret) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}
