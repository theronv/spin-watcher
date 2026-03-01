import { NextResponse } from 'next/server';
import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';
import { cookies } from 'next/headers';

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
  const { searchParams, origin } = new URL(request.url);

  const oauthToken    = searchParams.get('oauth_token');
  const oauthVerifier = searchParams.get('oauth_verifier');

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_params`);
  }

  // Retrieve the request token secret from the short-lived cookie
  const cookieStore = await cookies();
  const requestSecret = cookieStore.get('discogs_request_secret')?.value;

  if (!requestSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=session_expired`);
  }

  const oauth = makeOAuth();

  // Exchange request token + verifier for access token
  const accessTokenData = {
    url: 'https://api.discogs.com/oauth/access_token',
    method: 'POST',
    data: { oauth_verifier: oauthVerifier },
  };

  const token      = { key: oauthToken, secret: requestSecret };
  const authHeader = oauth.toHeader(oauth.authorize(accessTokenData, token));

  const accessRes = await fetch(accessTokenData.url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'NeedleDrop/2.0',
    },
    body: `oauth_verifier=${encodeURIComponent(oauthVerifier)}`,
  });

  if (!accessRes.ok) {
    console.error('Discogs access_token failed:', accessRes.status);
    return NextResponse.redirect(`${origin}/?auth_error=token_exchange`);
  }

  const accessText   = await accessRes.text();
  const accessParams = new URLSearchParams(accessText);
  const accessToken       = accessParams.get('oauth_token');
  const accessTokenSecret = accessParams.get('oauth_token_secret');

  if (!accessToken || !accessTokenSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_access_token`);
  }

  // Fetch user identity
  const identityReq    = { url: 'https://api.discogs.com/oauth/identity', method: 'GET' };
  const accessTok      = { key: accessToken, secret: accessTokenSecret };
  const identityHeader = oauth.toHeader(oauth.authorize(identityReq, accessTok));

  const identityRes = await fetch(identityReq.url, {
    headers: { ...identityHeader, 'User-Agent': 'NeedleDrop/2.0' },
  });

  let username   = '';
  let avatar_url = '';

  if (identityRes.ok) {
    const identity = await identityRes.json() as { username: string; avatar_url?: string };
    username   = identity.username ?? '';
    avatar_url = identity.avatar_url ?? '';
  }

  // Build session payload
  const session = JSON.stringify({ username, avatar_url, access_token: accessToken, access_token_secret: accessTokenSecret });

  const redirect = NextResponse.redirect(`${origin}/`);

  // Clear the temporary request secret cookie
  redirect.cookies.delete('discogs_request_secret');

  // Store session in an httpOnly cookie (30 days)
  redirect.cookies.set('discogs_session', session, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
    path:     '/',
  });

  return redirect;
}
