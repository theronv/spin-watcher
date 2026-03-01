import { NextResponse } from 'next/server';
import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

function makeOAuth() {
  return new OAuth({
    consumer: {
      key: process.env.DISCOGS_CONSUMER_KEY!,
      secret: process.env.DISCOGS_CONSUMER_SECRET!,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return createHmac('sha1', key).update(base_string).digest('base64');
    },
  });
}

export async function GET(request: Request) {
  const consumerKey    = process.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = process.env.DISCOGS_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: 'DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET must be set in .env.local' },
      { status: 500 }
    );
  }

  const { origin } = new URL(request.url);
  const callbackUrl = `${origin}/api/auth/discogs/callback`;

  const oauth = makeOAuth();

  // Include oauth_callback in the signed parameters
  const requestTokenData = {
    url: 'https://api.discogs.com/oauth/request_token',
    method: 'POST',
    data: { oauth_callback: callbackUrl },
  };

  const authHeader = oauth.toHeader(oauth.authorize(requestTokenData));

  const res = await fetch(requestTokenData.url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'NeedleDrop/2.0',
    },
    body: `oauth_callback=${encodeURIComponent(callbackUrl)}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Discogs request_token failed:', res.status, body);
    return NextResponse.json({ error: 'Failed to get request token from Discogs' }, { status: 502 });
  }

  const text   = await res.text();
  const params = new URLSearchParams(text);
  const oauthToken       = params.get('oauth_token');
  const oauthTokenSecret = params.get('oauth_token_secret');

  if (!oauthToken || !oauthTokenSecret) {
    return NextResponse.json({ error: 'Missing token in Discogs response' }, { status: 502 });
  }

  const redirect = NextResponse.redirect(
    `https://www.discogs.com/oauth/authorize?oauth_token=${oauthToken}`
  );

  // Store request token secret temporarily so the callback can use it
  redirect.cookies.set('discogs_request_secret', oauthTokenSecret, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutes
    path:     '/',
  });

  return redirect;
}
