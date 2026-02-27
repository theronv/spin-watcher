import { createClient, type ResultSet } from '@libsql/client';

export const db = createClient({
  url: 'libsql://spin-watcher-theronv.aws-us-west-2.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

/** Convert a libsql ResultSet into plain JS objects keyed by column name. */
export function toRows(result: ResultSet): Record<string, unknown>[] {
  return result.rows.map(row =>
    result.columns.reduce<Record<string, unknown>>((acc, col, i) => {
      acc[col] = row[i];
      return acc;
    }, {})
  );
}
