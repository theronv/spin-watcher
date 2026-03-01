import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.delete('discogs_session');
  res.cookies.delete('discogs_request_secret');
  return res;
}
