-- 등록을 마친 책만 한 줄씩 남는다. 되돌리면 그 줄이 지워진다.
CREATE TABLE IF NOT EXISTS done (
  book_id TEXT PRIMARY KEY,
  done_at INTEGER NOT NULL
) WITHOUT ROWID;
