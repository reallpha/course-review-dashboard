CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_name TEXT DEFAULT '',
  normal_price TEXT DEFAULT '',
  discounted_price TEXT DEFAULT '',
  syllabus TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  sessions_count TEXT DEFAULT '',
  full_description TEXT DEFAULT '',
  certificate_status TEXT DEFAULT '',
  installment_conditions TEXT DEFAULT '',
  instructor TEXT DEFAULT '',
  offers TEXT DEFAULT '',
  seo_checklist TEXT DEFAULT '',
  course_url TEXT DEFAULT '',
  last_update TEXT DEFAULT '',
  keywords TEXT DEFAULT '',
  review_status TEXT DEFAULT 'در حال بررسی',
  notes TEXT DEFAULT '',
  sync_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_sync_id ON courses(sync_id);
CREATE INDEX IF NOT EXISTS idx_courses_review_status ON courses(review_status);
CREATE INDEX IF NOT EXISTS idx_courses_course_name ON courses(course_name);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date TEXT DEFAULT '',
  created_by TEXT DEFAULT 'client',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
