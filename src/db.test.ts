import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { migrateWeeklyBarsIfNeeded } from "./db.js";

/**
 * These tests exercise the weekly_bars CHECK-constraint migration end to
 * end against a real SQLite file. Calling migrateWeeklyBarsIfNeeded
 * directly (rather than through getDb's singleton) keeps each test
 * isolated — vitest spawns one process per test file.
 */

function freshDb(): { dir: string; dbPath: string; db: Database.Database } {
  const dir = mkdtempSync(path.join(tmpdir(), "wer-db-test-"));
  const dbPath = path.join(dir, "radar.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { dir, dbPath, db };
}

function createPreConstraintTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE weekly_bars (
      ticker      TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      open        REAL    NOT NULL,
      high        REAL    NOT NULL,
      low         REAL    NOT NULL,
      close       REAL    NOT NULL,
      volume      INTEGER NOT NULL,
      fetched_at  TEXT    NOT NULL,
      PRIMARY KEY (ticker, date)
    );
  `);
}

const dirs: string[] = [];
const handles: Database.Database[] = [];

afterEach(() => {
  for (const db of handles.splice(0)) {
    try {
      db.close();
    } catch {
      // best effort
    }
  }
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

describe("weekly_bars CHECK migration", () => {
  it("adds CHECK clauses to a pre-existing constraint-less table and preserves rows", () => {
    const { dir, db } = freshDb();
    dirs.push(dir);
    handles.push(db);
    createPreConstraintTable(db);

    db.prepare("INSERT INTO weekly_bars VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "SO",
      "2025-01-03",
      70.1,
      71.2,
      69.8,
      70.5,
      1_000_000,
      "2025-01-04T00:00:00Z",
    );

    const before = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_bars'",
      )
      .get() as { sql: string };
    expect(before.sql).not.toContain("CHECK (");

    migrateWeeklyBarsIfNeeded(db);

    const after = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_bars'",
      )
      .get() as { sql: string };
    expect(after.sql).toContain("CHECK (high  >= low)");
    expect(after.sql).toContain("CHECK (volume >= 0)");

    const rows = db
      .prepare(
        "SELECT ticker, date, close FROM weekly_bars ORDER BY ticker, date",
      )
      .all() as Array<{ ticker: string; date: string; close: number }>;
    expect(rows).toEqual([{ ticker: "SO", date: "2025-01-03", close: 70.5 }]);
  });

  it("is a no-op when the table already has CHECK clauses", () => {
    const { dir, db } = freshDb();
    dirs.push(dir);
    handles.push(db);

    db.exec(`
      CREATE TABLE weekly_bars (
        ticker     TEXT NOT NULL,
        date       TEXT NOT NULL,
        open       REAL NOT NULL,
        high       REAL NOT NULL,
        low        REAL NOT NULL,
        close      REAL NOT NULL,
        volume     INTEGER NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (ticker, date),
        CHECK (open > 0)
      );
    `);
    const before = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_bars'",
      )
      .get() as { sql: string };

    migrateWeeklyBarsIfNeeded(db);

    const after = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_bars'",
      )
      .get() as { sql: string };
    expect(after.sql).toBe(before.sql);
  });

  it("does nothing (no throw) when the table does not yet exist", () => {
    const { dir, db } = freshDb();
    dirs.push(dir);
    handles.push(db);

    expect(() => migrateWeeklyBarsIfNeeded(db)).not.toThrow();
  });
});
