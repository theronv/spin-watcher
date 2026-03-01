import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get('discogs_session')?.value;

  if (!raw) {
    return NextResponse.json({ is_logged_in: false });
  }

  try {
    const session = JSON.parse(raw) as {
      username:             string;
      avatar_url:           string;
      access_token:         string;
      access_token_secret:  string;
    };

    return NextResponse.json({
      is_logged_in: true,
      username:     session.username,
      avatar_url:   session.avatar_url,
    });
  } catch {
    return NextResponse.json({ is_logged_in: false });
  }
}
