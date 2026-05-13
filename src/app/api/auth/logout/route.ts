import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/', new URL(request.url).origin));
  res.cookies.delete('discogs_session');
  return res;
}
