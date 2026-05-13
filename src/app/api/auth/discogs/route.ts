import { NextResponse } from 'next/server';
import OAuth from 'oauth-1.0a';
import { createHmac, randomBytes } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function makeOAuth() {
  return new OAuth({
    consumer: {
      key:    process.env.DISCOGS_CONSUMER_KEY!,
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

  const { origin, searchParams } = new URL(request.url);
  const redirectUri = searchParams.get('redirect_uri') ?? '';

  // Generate a random nonce to use as the state parameter.
  // We store the oauth_token_secret in the DB keyed by this nonce so it can
  // be retrieved in the callback without relying on cookies (which Chrome drops
  // on cross-origin redirects) or exposing the secret in the URL.
  const nonce = randomBytes(16).toString('hex');
  const callbackUrl = `${origin}/api/auth/discogs/callback?s=${nonce}`;

  const oauth = makeOAuth();

  const requestTokenData = {
    url:    'https://api.discogs.com/oauth/request_token',
    method: 'POST',
    data:   { oauth_callback: callbackUrl },
  };

  const authHeader = oauth.toHeader(oauth.authorize(requestTokenData));

  const res = await fetch(requestTokenData.url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   'NeedleDrop/2.0',
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

  // Ensure the oauth_state table exists (may not yet if init hasn't been called).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS oauth_state (
      nonce      TEXT PRIMARY KEY,
      secret     TEXT NOT NULL,
      redirect   TEXT NOT NULL DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Persist state: nonce → secret + redirect. Prune expired rows at the same time.
  await db.execute({
    sql: `DELETE FROM oauth_state WHERE created_at < strftime('%s', 'now') - 600`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO oauth_state (nonce, secret, redirect) VALUES (?, ?, ?)`,
    args: [nonce, oauthTokenSecret, redirectUri],
  });

  const discogsAuthUrl = `https://www.discogs.com/oauth/authorize?oauth_token=${oauthToken}`;

  if (redirectUri.startsWith('needledrop://')) {
    return NextResponse.redirect(discogsAuthUrl);
  }

  return NextResponse.json({ authUrl: discogsAuthUrl });
}
