import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession(request);

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
