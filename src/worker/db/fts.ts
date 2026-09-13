export const REBUILD_PAGES_FTS_STATEMENT = "INSERT INTO pages_fts(pages_fts) VALUES ('rebuild')";
export const CHECK_PAGES_FTS_STATEMENT =
  "INSERT INTO pages_fts(pages_fts) VALUES ('integrity-check')";

export async function rebuildPagesFts(db: D1Database) {
  return db.prepare(REBUILD_PAGES_FTS_STATEMENT).run();
}

export async function checkPagesFtsIntegrity(db: D1Database) {
  await db.prepare(CHECK_PAGES_FTS_STATEMENT).run();
}
