import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let session = await getSession(request);

  // Personal token fallback: treat DISCOGS_TOKEN + DISCOGS_USER as a logged-in session
  if (!session) {
    const envToken = process.env.DISCOGS_TOKEN;
    const envUser  = (process.env.DISCOGS_USER ?? '').replace(/[\u201C\u201D"]/g, '').trim();
    if (envToken && envUser) {
      session = { username: envUser, avatar_url: '', access_token: '', access_token_secret: '' };
    }
  }

  if (!session) {
    return NextResponse.json({ is_logged_in: false, user: null });
  }

  return NextResponse.json({
    is_logged_in: true,
    username:     session.username,
    avatar_url:   session.avatar_url,
    user: {
      id:       session.username,
      username: session.username,
      avatar:   session.avatar_url || undefined,
    },
  });
}
