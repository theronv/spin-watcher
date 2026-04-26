export default function Home() {
  return (
    <pre style={{ fontFamily: 'monospace', padding: '2rem', color: '#C9A84C', background: '#0c0a07', minHeight: '100vh' }}>
      {`NeedleDrop API
──────────────
Use the iOS app to access your collection.

GET   /api/auth/discogs          Initiate Discogs OAuth
GET   /api/auth/discogs/callback OAuth callback
GET   /api/auth/session          Current session
GET   /api/auth/logout           Sign out
GET   /api/records               Your collection
GET   /api/plays                 Play counts
POST  /api/plays                 Log a play
PATCH /api/plays                 Set play count
GET   /api/sync                  Sync from Discogs
GET   /api/album/:id             Release details
GET   /api/image                 Image proxy`}
    </pre>
  );
}
