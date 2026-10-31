const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YBLCqdKb65WlG3Tf5FFUPPozELO4ratriuVtmEf6PN8/export?format=csv&gid=0';

const COLUMNS = [
  'course_name', 'normal_price', 'discounted_price', 'syllabus', 'duration',
  'sessions_count', 'full_description', 'certificate_status', 'installment_conditions',
  'instructor', 'offers', 'seo_checklist', 'course_url', 'last_update', 'keywords'
];

const PERSIAN_COLUMNS = {
  course_name: 'نام دوره',
  normal_price: 'قیمت عادی',
  discounted_price: 'قیمت با تخفیف',
  syllabus: 'سرفصل های دوره',
  duration: 'مدت زمان',
  sessions_count: 'تعداد جلسات',
  full_description: 'اطلاعات دوره',
  certificate_status: 'فلش و گواهینامه',
  installment_conditions: 'شرایط خرید اقساطی',
  instructor: 'مدرس',
  offers: 'پیشنهادات',
  seo_checklist: 'چک لیست سئو',
  course_url: 'لینک دوره',
  last_update: 'آخرین تاریخ آپدیت',
  keywords: 'کلمات کلیدی مرتبط'
};

const PERSIAN_HEADERS = [
  'course_name', 'normal_price', 'discounted_price', 'duration', 'sessions_count',
  'instructor', 'certificate_status', 'installment_conditions', 'course_url',
  'last_update', 'keywords', 'offers', 'seo_checklist', 'syllabus', 'full_description'
];

const LARGE_FIELDS = ['syllabus', 'full_description', 'seo_checklist', 'installment_conditions', 'offers'];

function isSummaryRow(course) {
  if (!course.course_name) return true;
  const name = course.course_name.trim();
  if (name.startsWith('تعداد دوره')) return true;
  if (name.startsWith('------')) return true;
  if (name === '' && COLUMNS.every(c => !course[c])) return true;
  return false;
}

function parseCSV(text) {
  const rows = []; let current = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { current.push(field.trim()); field = ''; }
      else if (c === '\n') {
        current.push(field.trim()); field = '';
        if (current.length && current.some(x => x)) rows.push(current);
        current = [];
      }
      else if (c !== '\r') { field += c; }
    }
  }
  if (field.trim() || current.length) {
    current.push(field.trim());
    if (current.length && current.some(x => x)) rows.push(current);
  }
  return rows;
}

function sheetRowToCourse(row, index) {
  const course = { sync_id: index + 1 };
  COLUMNS.forEach((col, i) => { course[col] = (row[i] || '').trim(); });
  return course;
}

async function fetchAndParseSheet() {
  const resp = await fetch(SHEET_URL);
  if (!resp.ok) throw new Error('Failed to fetch sheet: ' + resp.status);
  const csv = await resp.text();
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('No data rows found');
  const allCourses = rows.slice(1).map((r, i) => sheetRowToCourse(r, i));
  return allCourses.filter(c => !isSummaryRow(c));
}

async function syncSheetToD1(env, courses) {
  const existing = await env.DB.prepare(
    'SELECT sync_id FROM courses WHERE sync_id IS NOT NULL ORDER BY sync_id'
  ).all();
  const existingIds = new Set(existing.results.map(r => r.sync_id));

  let updated = 0; let inserted = 0;
  const stmt = env.DB.prepare(
    `INSERT INTO courses (sync_id, course_name, normal_price, discounted_price, syllabus, duration, sessions_count, full_description, certificate_status, installment_conditions, instructor, offers, seo_checklist, course_url, last_update, keywords, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'))
     ON CONFLICT(sync_id) DO UPDATE SET course_name=?2, normal_price=?3, discounted_price=?4, syllabus=?5, duration=?6, sessions_count=?7, full_description=?8, certificate_status=?9, installment_conditions=?10, instructor=?11, offers=?12, seo_checklist=?13, course_url=?14, last_update=?15, keywords=?16, updated_at=datetime('now')`
  );

  for (const course of courses) {
    if (existingIds.has(course.sync_id)) updated++;
    else inserted++;
    await stmt.bind(
      course.sync_id, course.course_name, course.normal_price, course.discounted_price,
      course.syllabus, course.duration, course.sessions_count, course.full_description,
      course.certificate_status, course.installment_conditions, course.instructor,
      course.offers, course.seo_checklist, course.course_url, course.last_update, course.keywords
    ).run();
  }
  return { updated, inserted, total: courses.length };
}

async function ensureTableExists(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT DEFAULT '', normal_price TEXT DEFAULT '', discounted_price TEXT DEFAULT '',
      syllabus TEXT DEFAULT '', duration TEXT DEFAULT '', sessions_count TEXT DEFAULT '',
      full_description TEXT DEFAULT '', certificate_status TEXT DEFAULT '',
      installment_conditions TEXT DEFAULT '', instructor TEXT DEFAULT '',
      offers TEXT DEFAULT '', seo_checklist TEXT DEFAULT '', course_url TEXT DEFAULT '',
      last_update TEXT DEFAULT '', keywords TEXT DEFAULT '',
      review_status TEXT DEFAULT 'در حال بررسی', notes TEXT DEFAULT '',
      sync_id INTEGER UNIQUE,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_courses_sync_id ON courses(sync_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_courses_review_status ON courses(review_status)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', due_date TEXT DEFAULT '',
    created_by TEXT DEFAULT 'client', created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
    phone TEXT DEFAULT '', email TEXT DEFAULT '', notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(last_name)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)').run();
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

// ─── API Handlers ────────────────────────────────────────────────────────────

async function handleGetCourses(request, env) {
  const url = new URL(request.url);
  const search = (url.searchParams.get('search') || '').trim().toLowerCase();
  const status = url.searchParams.get('status') || '';

  let query = 'SELECT * FROM courses';
  const params = [];
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push('review_status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(LOWER(course_name) LIKE ? OR LOWER(keywords) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY sync_id ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ courses: result.results || [] });
}

async function handleGetCourse(request, env, id) {
  const result = await env.DB.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first();
  if (!result) return json({ error: 'Course not found' }, 404);
  return json({ course: result });
}

async function handleUpdateCourse(request, env, id) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { field, value } = body;
  if (!field || value === undefined) return json({ error: 'field and value required' }, 400);

  const allowed = [...COLUMNS, 'review_status', 'notes'];
  if (!allowed.includes(field)) return json({ error: 'Invalid field' }, 400);

  await env.DB.prepare(
    `UPDATE courses SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(value, id).run();

  const course = await env.DB.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first();
  return json({ success: true, course });
}

async function handleSync(request, env) {
  try {
    const courses = await fetchAndParseSheet();
    const result = await syncSheetToD1(env, courses);
    const all = await env.DB.prepare('SELECT * FROM courses ORDER BY sync_id ASC').all();
    return json({ success: true, courses: all.results || [], sync: result });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function handleMetrics(env) {
  const all = await env.DB.prepare('SELECT COUNT(*) as total FROM courses').first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as total FROM courses WHERE review_status = 'در حال بررسی'").first();
  const approved = await env.DB.prepare("SELECT COUNT(*) as total FROM courses WHERE review_status = 'تایید شده' OR review_status = 'تایید نهایی'").first();
  const changes = await env.DB.prepare("SELECT COUNT(*) as total FROM courses WHERE review_status = 'نیاز به ویرایش'").first();
  return json({
    total: all.total,
    pending: pending.total,
    approved: approved.total,
    requiresChanges: changes.total
  });
}

async function handleImport(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  let courses = body.courses || [];
  if (!Array.isArray(courses) || courses.length === 0) {
    return json({ error: 'courses array required' }, 400);
  }

  // If courses were sent as raw CSV rows (array of arrays), convert them
  if (Array.isArray(courses[0])) {
    courses = courses.map((r, i) => sheetRowToCourse(r, i));
  }

  // Filter summary rows
  courses = courses.filter(c => !isSummaryRow(c));

  if (courses.length === 0) {
    return json({ error: 'No valid courses after filtering' }, 400);
  }

  let inserted = 0; let updated = 0;
  const stmt = env.DB.prepare(
    `INSERT INTO courses (sync_id, course_name, normal_price, discounted_price, syllabus, duration, sessions_count, full_description, certificate_status, installment_conditions, instructor, offers, seo_checklist, course_url, last_update, keywords, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'))
     ON CONFLICT(sync_id) DO UPDATE SET course_name=?2, normal_price=?3, discounted_price=?4, syllabus=?5, duration=?6, sessions_count=?7, full_description=?8, certificate_status=?9, installment_conditions=?10, instructor=?11, offers=?12, seo_checklist=?13, course_url=?14, last_update=?15, keywords=?16, updated_at=datetime('now')`
  );

  for (const course of courses) {
    const existing = await env.DB.prepare('SELECT id FROM courses WHERE sync_id = ?').bind(course.sync_id).first();
    if (existing) updated++;
    else inserted++;
    await stmt.bind(
      course.sync_id, course.course_name, course.normal_price, course.discounted_price,
      course.syllabus, course.duration, course.sessions_count, course.full_description,
      course.certificate_status, course.installment_conditions, course.instructor,
      course.offers, course.seo_checklist, course.course_url, course.last_update, course.keywords
    ).run();
  }

  const totalResult = await env.DB.prepare('SELECT COUNT(*) as total FROM courses').first();
  return json({ success: true, inserted, updated, total: totalResult.total });
}

async function handleDebug(env) {
  const count = await env.DB.prepare('SELECT COUNT(*) as total FROM courses').first();
  const courses = await env.DB.prepare('SELECT id, sync_id, course_name, review_status, last_update FROM courses ORDER BY sync_id ASC').all();
  return json({
    d1RowCount: count.total,
    courses: courses.results || [],
    courseNames: (courses.results || []).map(c => ({ id: c.id, sync_id: c.sync_id, name: c.course_name, status: c.review_status })),
    columns: COLUMNS,
    columnCount: COLUMNS.length,
    tableCreated: true,
    status: 'ok'
  });
}

// ─── Create Course ───────────────────────────────────────────────────────────

async function handleCreateCourse(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const fields = ['course_name', 'normal_price', 'discounted_price', 'syllabus', 'duration', 'sessions_count', 'full_description', 'certificate_status', 'installment_conditions', 'instructor', 'offers', 'seo_checklist', 'course_url', 'last_update', 'keywords'];
  const vals = {};
  fields.forEach(f => { vals[f] = (body[f] || '').trim(); });

  const result = await env.DB.prepare(
    `INSERT INTO courses (course_name, normal_price, discounted_price, syllabus, duration, sessions_count, full_description, certificate_status, installment_conditions, instructor, offers, seo_checklist, course_url, last_update, keywords, review_status, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'), datetime('now'))
     RETURNING *`
  ).bind(
    vals.course_name, vals.normal_price, vals.discounted_price, vals.syllabus,
    vals.duration, vals.sessions_count, vals.full_description, vals.certificate_status,
    vals.installment_conditions, vals.instructor, vals.offers, vals.seo_checklist,
    vals.course_url, vals.last_update, vals.keywords, body.review_status || 'در حال بررسی'
  ).first();

  return json({ success: true, course: result });
}

// ─── Tasks API ───────────────────────────────────────────────────────────────

async function handleGetTasks(env) {
  const result = await env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  return json({ tasks: result.results || [] });
}

async function handleCreateTask(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.title || !body.title.trim()) return json({ error: 'Title required' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO tasks (title, description, status, priority, due_date, created_by, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6, datetime('now'), datetime('now'))
     RETURNING *`
  ).bind(
    body.title.trim(), (body.description || '').trim(),
    body.status || 'todo', body.priority || 'medium',
    body.due_date || '', body.created_by || 'client'
  ).first();
  return json({ success: true, task: result });
}

async function handleUpdateTask(request, env, id) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const allowed = ['title', 'description', 'status', 'priority', 'due_date'];
  const field = body.field;
  if (!field || !allowed.includes(field)) return json({ error: 'Invalid field' }, 400);

  await env.DB.prepare(
    `UPDATE tasks SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.value, id).run();
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ success: true, task });
}

async function handleDeleteTask(env, id) {
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return json({ success: true });
}

// ─── Contacts API ────────────────────────────────────────────────────────────

async function handleGetContacts(env) {
  const result = await env.DB.prepare('SELECT * FROM contacts ORDER BY last_name ASC, first_name ASC').all();
  return json({ contacts: result.results || [] });
}

async function handleCreateContact(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.first_name && !body.last_name) return json({ error: 'Name required' }, 400);
  const result = await env.DB.prepare(
    `INSERT INTO contacts (first_name, last_name, phone, email, notes, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5, datetime('now'), datetime('now'))
     RETURNING *`
  ).bind(
    (body.first_name || '').trim(), (body.last_name || '').trim(),
    (body.phone || '').trim(), (body.email || '').trim(),
    (body.notes || '').trim()
  ).first();
  return json({ success: true, contact: result });
}

async function handleUpdateContact(request, env, id) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const allowed = ['first_name', 'last_name', 'phone', 'email', 'notes'];
  const field = body.field;
  if (!field || !allowed.includes(field)) return json({ error: 'Invalid field' }, 400);
  await env.DB.prepare(
    `UPDATE contacts SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.value, id).run();
  const contact = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
  return json({ success: true, contact });
}

async function handleDeleteContact(env, id) {
  await env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  return json({ success: true });
}

async function handleImportContacts(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const contacts = body.contacts || [];
  let imported = 0;
  for (const c of contacts) {
    if (!c.first_name && !c.last_name) continue;
    await env.DB.prepare(
      `INSERT INTO contacts (first_name, last_name, phone, email, notes, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5, datetime('now'), datetime('now'))`
    ).bind(
      (c.first_name || '').trim(), (c.last_name || '').trim(),
      (c.phone || '').trim(), (c.email || '').trim(),
      (c.notes || '').trim()
    ).run();
    imported++;
  }
  return json({ success: true, imported });
}

async function handleExportContacts(request, env) {
  const result = await env.DB.prepare('SELECT * FROM contacts ORDER BY last_name ASC, first_name ASC').all();
  const contacts = result.results || [];
  // Build CSV
  let csv = 'first_name,last_name,phone,email,notes\n';
  for (const c of contacts) {
    const escape = function(v) {
      const s = (v || '').replace(/"/g, '""');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s + '"';
      return s;
    };
    csv += escape(c.first_name) + ',' + escape(c.last_name) + ',' +
            escape(c.phone) + ',' + escape(c.email) + ',' + escape(c.notes) + '\n';
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contacts.csv"'
    }
  });
}

// ─── Report API ──────────────────────────────────────────────────────────────

async function handleReport(request, env) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get('start') || '';
  const endDate = url.searchParams.get('end') || '';

  if (!startDate) return json({ error: 'start date required (YYYY-MM-DD)' }, 400);
  const end = endDate || startDate;

  // Calculate days passed
  const start = new Date(startDate + 'T00:00:00Z');
  const endD = new Date((endDate || startDate) + 'T00:00:00Z');
  const now = new Date();
  const totalDays = Math.max(1, Math.round((endD - start) / 86400000) + 1);
  const passedDays = Math.min(totalDays, Math.max(0, Math.round((now - start) / 86400000)));

  // Completed tasks in period
  const completedTasks = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status = 'done' AND created_at >= ?1 AND created_at < datetime(?2, '+1 day') ORDER BY created_at ASC"
  ).bind(startDate, end).all();

  // In-progress tasks
  const inProgressTasks = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status = 'in_progress' ORDER BY created_at ASC"
  ).all();

  // Course changes (all courses with updated_at in period)
  const courseChanges = await env.DB.prepare(
    'SELECT id, course_name, review_status, updated_at FROM courses WHERE updated_at >= ?1 AND updated_at < datetime(?2, \'+1 day\') ORDER BY updated_at ASC'
  ).bind(startDate, end).all();

  const allCourses = await env.DB.prepare('SELECT COUNT(*) as total FROM courses').first();

  return json({
    period: { start: startDate, end, totalDays, passedDays },
    completedTasks: completedTasks.results || [],
    inProgressTasks: inProgressTasks.results || [],
    courseChanges: courseChanges.results || [],
    totalCourses: allCourses.total,
    reportGenerated: new Date().toISOString()
  });
}

// ─── Frontend (HTML + CSS + JS) ──────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>داشبورد بازبینی دوره‌ها - روان کلاس</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
/* ═══════════════════════════════════════════════════════════════════════════
   CSS VARIABLES & THEMING
   ═══════════════════════════════════════════════════════════════════════════ */
:root {
  --bg: #f5f6fa;
  --bg-card: #ffffff;
  --bg-hover: #f0f1f5;
  --bg-input: #f8f9fc;
  --text: #1a1d29;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --border: #e5e7eb;
  --border-light: #f0f1f5;
  --primary: #7c3aed;
  --primary-light: #ede9fe;
  --primary-dark: #5b21b6;
  --success: #10b981;
  --success-light: #d1fae5;
  --warning: #f59e0b;
  --warning-light: #fef3c7;
  --danger: #ef4444;
  --danger-light: #fee2e2;
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.08);
  --radius: 12px;
  --radius-sm: 8px;
  --radius-xs: 6px;
  --header-h: 64px;
  --transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --font: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'IRANSans', Tahoma, sans-serif;
  --max-width: 1400px;
}
.dark {
  --bg: #0f172a;
  --bg-card: #1e293b;
  --bg-hover: #263348;
  --bg-input: #1a2332;
  --text: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: #334155;
  --border-light: #293548;
  --primary-light: #2e1a5e;
  --success-light: #14532d;
  --warning-light: #451a03;
  --danger-light: #450a0a;
  --shadow: 0 1px 3px rgba(0,0,0,0.2);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.3);
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESET & BASE
   ═══════════════════════════════════════════════════════════════════════════ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;scroll-behavior:smooth;-webkit-tap-highlight-color:transparent;overflow-wrap:break-word;word-break:break-word}
html,body{overflow-x:hidden}
body{
  font-family:var(--font);
  background:var(--bg);
  color:var(--text);
  line-height:1.7;
  direction:rtl;
  min-height:100vh;
  transition:background var(--transition),color var(--transition);
}
a{color:var(--primary);text-decoration:none}
img{max-width:100%}
button{cursor:pointer;font-family:var(--font);border:none;background:none}
input,textarea,select{font-family:var(--font);direction:rtl;text-align:right}

/* ═══════════════════════════════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════════════════════════════ */
.app{max-width:var(--max-width);margin:0 auto;padding:0 16px;padding-top:calc(var(--header-h) + 16px);padding-bottom:100px}
.header{
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:var(--header-h);
  background:var(--bg-card);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 16px;gap:12px;
  backdrop-filter:blur(12px);
  transition:background var(--transition),border-color var(--transition);
}
.header-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.1rem;color:var(--text);white-space:nowrap}
.header-logo .logo-icon{display:none}
.header-actions{display:flex;align-items:center;gap:8px}
.header-actions button{
  width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:1.2rem;color:var(--text-secondary);transition:all var(--transition);
}
.header-actions button:hover{background:var(--bg-hover);color:var(--text)}
.search-wrap{flex:1;max-width:400px;position:relative}
.search-wrap input{
  width:100%;height:40px;padding:0 40px 0 12px;border-radius:10px;border:1px solid var(--border);
  background:var(--bg-input);color:var(--text);font-size:0.9rem;transition:all var(--transition);
}
.search-wrap input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.search-wrap .search-icon{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:1rem;pointer-events:none}

/* ═══════════════════════════════════════════════════════════════════════════
   METRICS
   ═══════════════════════════════════════════════════════════════════════════ */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.metric-card{
  background:var(--bg-card);border-radius:var(--radius);padding:16px;
  border:1px solid var(--border);transition:all var(--transition);
}
.metric-card:hover{border-color:var(--primary);box-shadow:var(--shadow)}
.metric-label{font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;font-weight:500}
.metric-value{font-size:1.5rem;font-weight:700;color:var(--text);line-height:1.2}
.metric-value.purple{color:var(--primary)}
.metric-value.green{color:var(--success)}
.metric-value.yellow{color:var(--warning)}
.metric-value.red{color:var(--danger)}

/* ═══════════════════════════════════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════════════════════════════════ */
.filters{display:flex;gap:8px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
.filter-btn{
  padding:8px 20px;border-radius:999px;border:1px solid var(--border);
  background:var(--bg-card);color:var(--text-secondary);font-size:0.85rem;font-weight:500;
  white-space:nowrap;transition:all var(--transition);font-family:var(--font);
}
.filter-btn:hover{background:var(--bg-hover);color:var(--text)}
.filter-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}

/* ═══════════════════════════════════════════════════════════════════════════
   COURSE COUNTS
   ═══════════════════════════════════════════════════════════════════════════ */
.course-counts{font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;font-weight:500}

/* ═══════════════════════════════════════════════════════════════════════════
   COURSE CARDS (MOBILE)
   ═══════════════════════════════════════════════════════════════════════════ */
.course-card{
  background:var(--bg-card);border-radius:var(--radius);border:1px solid var(--border);
  margin-bottom:12px;overflow:hidden;transition:all var(--transition);
}
.course-card:hover{box-shadow:var(--shadow)}
.course-card-header{
  padding:16px;display:flex;align-items:center;gap:12px;cursor:pointer;
  transition:background var(--transition);
}
.course-card-header:hover{background:var(--bg-hover)}
.course-card-header .card-main{flex:1;min-width:0}
.course-card-header .card-title{font-weight:600;font-size:0.95rem;color:var(--text);margin-bottom:4px;line-height:1.4}
.course-card-header .card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.78rem;color:var(--text-secondary)}
.course-card-header .card-expand{color:var(--text-muted);font-size:1.2rem;transition:transform var(--transition);flex-shrink:0}
.course-card-header .card-expand.open{transform:rotate(180deg)}

.badge{
  display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;
  font-size:0.72rem;font-weight:500;gap:4px;white-space:nowrap;
}
.badge.pending{background:var(--warning-light);color:#92400e}
.badge.approved{background:var(--success-light);color:#065f46}
.badge.changes{background:var(--danger-light);color:#991b1b}
.badge.approved-notes{background:var(--primary-light);color:var(--primary-dark)}
.dark .badge.pending{background:#452a04;color:#fbbf24}
.dark .badge.approved{background:#064e3b;color:#6ee7b7}
.dark .badge.changes{background:#7f1d1d;color:#fca5a5}
.dark .badge.approved-notes{background:#2e1a5e;color:#a78bfa}

.course-card-summary{
  display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px 16px;
}
.summary-item{display:flex;flex-direction:column;gap:2px}
.summary-item .s-label{font-size:0.68rem;color:var(--text-muted);font-weight:500}
.summary-item .s-value{font-size:0.82rem;color:var(--text);font-weight:500;line-height:1.3}

.course-card-body{max-height:0;overflow:hidden;transition:max-height 0.3s ease}
.course-card-body.open{max-height:10000px}
.course-card-fields{padding:0 16px 16px;border-top:1px solid var(--border-light);padding-top:16px}

.field-group{margin-bottom:20px}
.field-label{
  font-size:0.82rem;font-weight:700;color:var(--text);margin-bottom:8px;
  display:flex;align-items:center;gap:8px;letter-spacing:-0.01em;
}
.field-label .field-icon{color:var(--primary);opacity:0.7}
.hover-highlight{cursor:pointer;transition:all var(--transition)}
.hover-highlight:hover{border-color:var(--primary);background:var(--bg-card);box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.section-divider{height:1px;background:var(--border);margin:16px 0}
.field-value{
  font-size:0.9rem;color:var(--text);line-height:1.8;
  white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;
  background:var(--bg-input);border-radius:var(--radius-xs);
  padding:12px 14px;border:1px solid var(--border-light);
  min-height:44px;cursor:text;transition:all var(--transition);
  max-width:100%;
}
.field-value:hover{border-color:var(--primary);background:var(--bg-card);box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.field-value:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light);background:var(--bg-card)}
.field-value.textarea-field{min-height:80px;resize:vertical}
.field-value.rich-field{min-height:100px}
.field-value.saving{opacity:0.5}
.field-value.saved{border-color:var(--success)}

.field-actions{display:flex;gap:6px;margin-top:6px;justify-content:flex-end}
.btn-icon{
  width:32px;height:32px;border-radius:var(--radius-xs);display:inline-flex;
  align-items:center;justify-content:center;font-size:0.85rem;
  transition:all var(--transition);font-family:var(--font);
}
.btn-icon:hover{transform:scale(1.05)}
.btn-approve{color:var(--success);background:var(--success-light)}
.btn-approve:hover{background:var(--success);color:#fff}
.btn-revision{color:var(--danger);background:var(--danger-light)}
.btn-revision:hover{background:var(--danger);color:#fff}

/* ═══════════════════════════════════════════════════════════════════════════
   DESKTOP TABLE
   ═══════════════════════════════════════════════════════════════════════════ */
.desktop-view{display:none}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card)}
.data-table{width:100%;border-collapse:collapse;font-size:0.82rem}
.data-table th{
  position:sticky;top:0;background:var(--bg);z-index:10;
  padding:10px 12px;text-align:right;font-weight:600;color:var(--text-secondary);
  border-bottom:2px solid var(--border);white-space:nowrap;font-size:0.75rem;
  cursor:col-resize;user-select:none;transition:background var(--transition);
}
.data-table th:hover{background:var(--bg-hover)}
.data-table td{
  padding:8px 12px;border-bottom:1px solid var(--border-light);color:var(--text);
  vertical-align:top;max-width:300px;overflow:hidden;text-overflow:ellipsis;
}
.data-table tr:last-child td{border-bottom:none}
.data-table tr:hover td{background:var(--bg-hover)}
.data-table td .cell-edit{
  background:transparent;border:none;width:100%;color:var(--text);
  font-size:0.82rem;font-family:var(--font);direction:rtl;text-align:right;
  padding:2px 0;min-height:22px;resize:none;
}
.data-table td .cell-edit:focus{outline:none;color:var(--primary)}
.data-table td .cell-text{max-height:60px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;cursor:pointer}
.data-table td .cell-long-preview{
  font-size:0.82rem;line-height:1.6;color:var(--text);max-height:60px;overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;word-break:break-word;
  text-align:right;
}
.data-table td .cell-action-btn{
  width:28px;height:28px;border-radius:var(--radius-xs);display:inline-flex;
  align-items:center;justify-content:center;border:1px solid var(--border);
  background:var(--bg-card);cursor:pointer;font-size:0.75rem;transition:all var(--transition);
}
.data-table td .cell-action-btn:hover{background:var(--bg-hover);border-color:var(--primary-light)}
.data-table .col-name{min-width:180px}
.data-table .col-price{min-width:100px}
.data-table .col-long{min-width:200px;max-width:400px}

/* ═══════════════════════════════════════════════════════════════════════════
   UNDO TOAST
   ═══════════════════════════════════════════════════════════════════════════ */
.toast-container{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.toast{
  background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:12px 20px;box-shadow:var(--shadow-lg);font-size:0.85rem;color:var(--text);
  display:flex;align-items:center;gap:10px;pointer-events:auto;
  animation:slideUp 0.3s ease;backdrop-filter:blur(12px);
}
.toast .toast-undo{
  padding:4px 12px;border-radius:var(--radius-xs);background:var(--primary);color:#fff;
  font-size:0.78rem;font-weight:600;cursor:pointer;font-family:var(--font);transition:opacity var(--transition);
}
.toast .toast-undo:hover{opacity:0.9}
.toast.toast-hide{animation:slideDown 0.3s ease forwards}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(20px)}}

/* ═══════════════════════════════════════════════════════════════════════════
   LOADING SKELETONS
   ═══════════════════════════════════════════════════════════════════════════ */
.skeleton{background:linear-gradient(90deg,var(--border-light) 25%,var(--bg-hover) 50%,var(--border-light) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--radius-xs)}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-card{height:120px;margin-bottom:12px;border-radius:var(--radius)}
.skeleton-metric{height:80px;border-radius:var(--radius)}
.skeleton-row{height:48px;margin-bottom:4px;border-radius:var(--radius-xs)}

/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════════════════════════════════════ */
@media(min-width:768px){
  .mobile-view{display:none}
  .desktop-view{display:block}
  .metrics{grid-template-columns:repeat(4,1fr)}
  .app{padding:0 24px;padding-top:calc(var(--header-h) + 24px)}
}
@media(max-width:767px){
  .metrics{grid-template-columns:repeat(2,1fr);gap:8px}
  .metric-card{padding:12px}
  .metric-value{font-size:1.2rem}
  .header{padding:0 12px}
  .header-logo .logo-text{display:none}
  .search-wrap{max-width:none}
  .course-card-summary{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:480px){
  .metrics{grid-template-columns:1fr 1fr;gap:6px}
  .metric-card{padding:10px}
  .metric-value{font-size:1.1rem}
  .course-card-header{padding:12px}
  .course-card-fields{padding:0 12px 12px;padding-top:12px}
  .app{padding:0 12px;padding-top:calc(var(--header-h) + 12px)}
}

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.text-center{text-align:center}
.mt-2{margin-top:8px}
.mb-2{margin-bottom:8px}
.fade-in{animation:fadeIn 0.3s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}

.empty-state{text-align:center;padding:60px 20px;color:var(--text-secondary)}
.empty-state .empty-icon{font-size:3rem;margin-bottom:16px;opacity:0.5}
.empty-state h3{font-size:1.1rem;margin-bottom:8px;color:var(--text)}
.empty-state p{font-size:0.9rem;max-width:400px;margin:0 auto}

.status-select{
  font-family:var(--font);padding:6px 12px;border-radius:var(--radius-xs);
  border:1px solid var(--border);background:var(--bg-card);color:var(--text);
  font-size:0.85rem;cursor:pointer;direction:rtl;width:100%;max-width:300px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE FULL-SCREEN EDITOR MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
.modal-overlay{
  position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;
  background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;
  animation:fadeIn 0.2s ease;
}
.dark .modal-overlay{background:rgba(0,0,0,0.7)}
.modal-editor{
  background:var(--bg-card);border-radius:var(--radius) var(--radius) 0 0;
  width:100%;max-width:700px;max-height:92vh;display:flex;flex-direction:column;
  animation:slideUp 0.25s ease;
}
.modal-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid var(--border);
}
.modal-header .modal-title{font-weight:600;font-size:1rem;color:var(--text);display:flex;align-items:center;gap:8px}
.modal-close{
  width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:1.3rem;color:var(--text-secondary);transition:all var(--transition);
}
.modal-close:hover{background:var(--bg-hover);color:var(--text)}
.modal-body{padding:16px 20px;flex:1;overflow-y:auto}
.modal-body .modal-textarea{
  width:100%;min-height:300px;padding:16px;border:1px solid var(--border);
  border-radius:var(--radius-xs);background:var(--bg-input);color:var(--text);
  font-family:var(--font);font-size:1rem;line-height:1.8;resize:none;
  direction:rtl;text-align:right;transition:border-color var(--transition);
}
.modal-body .modal-textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.modal-footer{
  padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:space-between;
}
.modal-footer .modal-save{
  padding:10px 28px;border-radius:var(--radius-xs);background:var(--primary);color:#fff;
  font-family:var(--font);font-size:0.9rem;font-weight:600;transition:opacity var(--transition);
}
.modal-footer .modal-save:hover{opacity:0.9}
.modal-footer .modal-status{font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:6px}
@media(min-width:768px){
  .modal-overlay{align-items:center}
  .modal-editor{border-radius:var(--radius);max-height:80vh}
}

/* ═══════════════════════════════════════════════════════════════════════════
   COPY BUTTON
   ═══════════════════════════════════════════════════════════════════════════ */
.copy-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:6px;font-size:0.8rem;
  color:var(--text-muted);transition:all var(--transition);margin-right:auto;flex-shrink:0;
}
.copy-btn:hover{background:var(--bg-hover);color:var(--primary)}
.copy-btn.copied{color:var(--success);background:var(--success-light)}

/* ═══════════════════════════════════════════════════════════════════════════
   PSYCHOLOGY HEADER ICON
   ═══════════════════════════════════════════════════════════════════════════ */
.psych-icon{width:28px;height:28px;flex-shrink:0}
.psych-icon svg{width:100%;height:100%}
.psych-icon .icon-stroke{stroke:var(--primary);stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}

/* ═══════════════════════════════════════════════════════════════════════════
   FIELD IMPROVEMENTS
   ═══════════════════════════════════════════════════════════════════════════ */
.field-group{margin-bottom:20px}
.field-label{font-size:0.8rem;margin-bottom:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.field-value{
  font-size:0.92rem;line-height:1.7;padding:12px 14px;min-height:44px;
  border-radius:var(--radius-xs);cursor:pointer;transition:all var(--transition);
}
.field-value:hover{border-color:var(--primary);background:var(--bg-hover)}
.field-value:focus{cursor:text}
.field-value.textarea-field{min-height:100px}
.field-value.saving{opacity:0.5}
.field-readonly{pointer-events:none;opacity:0.8}

.hover-highlight{transition:background var(--transition)}
.hover-highlight:hover{background:var(--bg-hover)}

/* ═══════════════════════════════════════════════════════════════════════════
   STICKY NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */
.nav-bar{
  position:fixed;bottom:0;left:0;right:0;z-index:99;
  background:var(--bg-card);border-top:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-around;
  padding:6px 0 env(safe-area-inset-bottom,6px);
  backdrop-filter:blur(12px);
}
.nav-item{
  display:flex;flex-direction:column;align-items:center;gap:2px;
  padding:6px 12px;border-radius:var(--radius-sm);
  font-size:0.65rem;color:var(--text-muted);font-weight:500;
  transition:all var(--transition);cursor:pointer;border:none;
  background:none;font-family:var(--font);min-width:60px;
}
.nav-item .nav-icon{font-size:1.2rem;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.nav-item .nav-icon svg{width:1.2rem;height:1.2rem}
.nav-item:hover{color:var(--text-secondary);background:var(--bg-hover)}
.nav-item.active{color:var(--primary)}
.nav-item.active .nav-icon{transform:scale(1.1)}
.nav-add{
  background:var(--primary);color:#fff !important;border-radius:50%;
  width:44px;height:44px;display:flex;align-items:center;justify-content:center;
  margin-top:-18px;box-shadow:0 4px 12px rgba(124,58,237,0.3);
}
.nav-add:hover{transform:scale(1.05);background:var(--primary-dark)}
.nav-add .nav-icon svg{width:1.5rem;height:1.5rem}
.nav-add .nav-label{display:none}
@media(min-width:768px){.nav-add .nav-label{display:inline}}
@media(min-width:768px){
  .nav-bar{position:sticky;top:var(--header-h);border-top:none;border-bottom:1px solid var(--border);padding:0;justify-content:flex-start;gap:4px;padding:0 24px}
  .nav-item{flex-direction:row;gap:6px;padding:10px 18px;font-size:0.82rem;border-radius:0;border-bottom:2px solid transparent}
  .nav-item.active{border-bottom-color:var(--primary);color:var(--primary)}
  .nav-item .nav-icon{font-size:1rem}
  .nav-add{border-radius:var(--radius-xs);margin-top:0;width:auto;height:auto;padding:8px 20px;gap:6px;flex-direction:row;font-size:0.82rem;box-shadow:none;margin-right:auto}
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADD COURSE MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
.add-course-overlay{
  position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;
  background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;
}
.dark .add-course-overlay{background:rgba(0,0,0,0.7)}
.add-course-panel{
  background:var(--bg-card);border-radius:var(--radius) var(--radius) 0 0;
  width:100%;max-width:700px;max-height:90vh;display:flex;flex-direction:column;
  overflow:hidden;
}
.add-course-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid var(--border);
}
.add-course-header h2{font-size:1.05rem;font-weight:700;color:var(--text)}
.add-course-body{flex:1;overflow-y:auto;padding:16px 20px}
.add-course-body .field-group{margin-bottom:16px}
.add-course-body .field-group label{font-size:0.82rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px}
.add-course-body .field-group input,
.add-course-body .field-group textarea{
  width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);
  background:var(--bg-input);color:var(--text);font-family:var(--font);
  font-size:0.9rem;direction:rtl;text-align:right;transition:border-color var(--transition);
}
.add-course-body .field-group input:focus,
.add-course-body .field-group textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.add-course-body .field-group textarea{min-height:80px;resize:vertical}
.add-course-footer{
  padding:12px 20px;border-top:1px solid var(--border);
  display:flex;gap:10px;justify-content:flex-end;
}
.add-course-footer button{
  padding:10px 24px;border-radius:var(--radius-xs);font-family:var(--font);
  font-size:0.9rem;font-weight:600;cursor:pointer;transition:opacity var(--transition);
}
.add-course-footer .btn-cancel{background:var(--bg-hover);color:var(--text-secondary);border:1px solid var(--border)}
.add-course-footer .btn-save{background:var(--primary);color:#fff;border:none}
.add-course-footer .btn-save:hover{opacity:0.9}
@media(min-width:768px){
  .add-course-overlay{align-items:center}
  .add-course-panel{border-radius:var(--radius);max-height:85vh}
  .add-course-body .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .add-course-body .form-grid .full-width{grid-column:1/-1}
}

/* ═══════════════════════════════════════════════════════════════════════════
   COURSE DETAIL MODAL (Desktop)
   ═══════════════════════════════════════════════════════════════════════════ */
.detail-overlay{
  position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;
  background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;
  animation:fadeIn 0.2s ease;
}
.dark .detail-overlay{background:rgba(0,0,0,0.7)}
.detail-panel{
  background:var(--bg-card);border-radius:var(--radius);
  width:90%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;
  animation:slideUp 0.25s ease;
}
.detail-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 24px;border-bottom:1px solid var(--border);
}
.detail-header h2{font-size:1.1rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px}
.detail-body{
  padding:16px 24px 24px;overflow-y:auto;flex:1;
}
.detail-field-group{margin-bottom:18px}
.detail-field-label{
  font-size:0.82rem;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;
}
.detail-field-value{
  font-size:0.9rem;color:var(--text);line-height:1.8;
  white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;
  background:var(--bg-input);border-radius:var(--radius-xs);
  padding:10px 14px;border:1px solid var(--border-light);min-height:40px;
  text-align:right;max-width:100%;
}
.detail-field-value:hover{border-color:var(--primary);background:var(--bg-card)}
.detail-action-btn{
  padding:5px 14px;border-radius:var(--radius-xs);border:1px solid var(--border);
  background:var(--bg-card);color:var(--text-secondary);font-family:var(--font);
  font-size:0.78rem;font-weight:500;cursor:pointer;transition:all var(--transition);
  display:inline-flex;align-items:center;gap:4px;
}
.detail-action-btn:hover{background:var(--bg-hover);border-color:var(--primary-light);color:var(--text)}
.detail-select{
  font-family:var(--font);padding:8px 12px;border-radius:var(--radius-xs);
  border:1px solid var(--border);background:var(--bg-card);color:var(--text);
  font-size:0.85rem;cursor:pointer;direction:rtl;width:100%;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TASKS
   ═══════════════════════════════════════════════════════════════════════════ */
.tasks-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
.tasks-header h2{font-size:1.15rem;font-weight:700;color:var(--text)}
.tasks-board{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:768px){.tasks-board{grid-template-columns:1fr 1fr 1fr}}
.task-column{
  background:var(--bg);border-radius:var(--radius);padding:12px;
  border:1px solid var(--border-light);
}
.task-column-header{
  font-size:0.85rem;font-weight:700;color:var(--text);margin-bottom:12px;
  padding-bottom:8px;border-bottom:2px solid var(--border);display:flex;align-items:center;gap:8px;
}
.task-column .task-count{font-size:0.75rem;color:var(--text-muted);font-weight:400}
.task-card{
  background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:12px;margin-bottom:8px;transition:all var(--transition);cursor:pointer;
}
.task-card:hover{box-shadow:var(--shadow);border-color:var(--primary-light)}
.task-card .task-title{font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:4px}
.task-card .task-desc{font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.task-card .task-meta{display:flex;gap:6px;flex-wrap:wrap}
.priority-badge{
  display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;
  font-size:0.65rem;font-weight:500;
}
.priority-high{background:#fee2e2;color:#dc2626}
.priority-medium{background:#fef3c7;color:#d97706}
.priority-low{background:#d1fae5;color:#059669}
.dark .priority-high{background:#450a0a;color:#fca5a5}
.dark .priority-medium{background:#451a03;color:#fbbf24}
.dark .priority-low{background:#064e3b;color:#6ee7b7}
.task-status-btn{
  display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;
  font-size:0.65rem;font-weight:500;border:1px solid var(--border);background:var(--bg-card);
  color:var(--text-secondary);cursor:pointer;font-family:var(--font);transition:all var(--transition);
}
.task-status-btn:hover{background:var(--bg-hover)}
.task-new-form{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.task-new-form input[type=text]{flex:1;min-width:150px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-input);color:var(--text);font-family:var(--font);font-size:0.85rem}
.task-new-form input:focus{outline:none;border-color:var(--primary)}
.task-new-form button{padding:8px 16px;border-radius:var(--radius-xs);background:var(--primary);color:#fff;font-family:var(--font);font-size:0.82rem;font-weight:600;cursor:pointer}
.priority-dropdown{
  padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);
  background:var(--bg-card);color:var(--text);font-family:var(--font);
  font-size:0.82rem;cursor:pointer;
}

.toolbar-row{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
.add-task-btn{
  padding:8px 16px;border-radius:var(--radius-xs);background:var(--primary);color:#fff;
  border:none;font-family:var(--font);font-size:0.82rem;font-weight:600;cursor:pointer;white-space:nowrap;
}
.add-task-btn:hover{opacity:0.9}
.task-search-input{
  width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);
  background:var(--bg-input);color:var(--text);font-family:var(--font);font-size:0.85rem;box-sizing:border-box;
}
.task-search-input:focus{outline:none;border-color:var(--primary)}

/* ═══════════════════════════════════════════════════════════════════════════
   REPORTS VIEW
   ═══════════════════════════════════════════════════════════════════════════ */
.reports-header{margin-bottom:20px}
.reports-header h2{font-size:1.15rem;font-weight:700;color:var(--text);margin-bottom:8px}
.reports-header p{font-size:0.85rem;color:var(--text-secondary)}
.report-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px}
.report-controls .field{display:flex;flex-direction:column;gap:4px}
.report-controls .field label{font-size:0.75rem;font-weight:600;color:var(--text-secondary)}
.report-controls .field input[type=date]{padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-input);color:var(--text);font-family:var(--font);font-size:0.85rem}
.report-controls .field input:focus{outline:none;border-color:var(--primary)}
.report-controls .gen-btn{
  padding:8px 24px;border-radius:var(--radius-xs);background:var(--primary);color:#fff;
  font-family:var(--font);font-size:0.85rem;font-weight:600;cursor:pointer;
}
.report-progress{margin-bottom:20px}
.report-progress .progress-label{font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px}
.report-progress .progress-bar{
  height:8px;background:var(--border);border-radius:999px;overflow:hidden;
}
.report-progress .progress-fill{
  height:100%;background:var(--primary);border-radius:999px;transition:width 0.3s ease;
}
.report-output{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;white-space:pre-wrap;direction:rtl;text-align:right;font-size:0.85rem;line-height:1.8;max-height:500px;overflow-y:auto;display:none}
.report-output.show{display:block}
.report-output h3{font-size:1rem;font-weight:700;color:var(--text);margin:16px 0 8px}
.report-output h3:first-child{margin-top:0}
.report-output .stat-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)}
.report-output .stat-row:last-child{border-bottom:none}
.download-btn{padding:8px 20px;border-radius:var(--radius-xs);background:var(--success);color:#fff;font-family:var(--font);font-size:0.85rem;font-weight:600;cursor:pointer;margin-top:12px;display:inline-flex;align-items:center;gap:8px}
.download-btn:hover{opacity:0.9}

/* Status section styling */
.status-section{
  background:var(--bg-input);border-radius:var(--radius);padding:16px;
  border:1px solid var(--border-light);margin-top:4px;
}
.status-section .field-label{font-size:0.85rem;margin-bottom:10px}
.status-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.status-actions .status-btn{
  padding:8px 20px;border-radius:999px;font-family:var(--font);font-size:0.82rem;font-weight:500;
  border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary);
  transition:all var(--transition);cursor:pointer;
}
.status-actions .status-btn:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
.status-actions .status-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.status-actions .status-btn.approve{color:var(--success);border-color:var(--success)}
.status-actions .status-btn.approve.active{background:var(--success);color:#fff;border-color:var(--success)}
.status-actions .status-btn.changes{color:var(--danger);border-color:var(--danger)}
.status-actions .status-btn.changes.active{background:var(--danger);color:#fff;border-color:var(--danger)}
.status-actions .status-btn.pending{color:var(--warning);border-color:var(--warning)}
.status-actions .status-btn.pending.active{background:var(--warning);color:#fff;border-color:var(--warning)}

/* Typography improvements for Persian */
.field-value,.modal-textarea{font-feature-settings:'ss01' 1,'ss02' 1}
.course-card .card-title{font-size:1rem;font-weight:700;line-height:1.5}
.summary-item .s-value{font-size:0.85rem}

/* Desktop field spacing */
@media(min-width:768px){
  .field-group{margin-bottom:24px}
  .field-value{font-size:0.88rem;padding:10px 14px}
  .course-card-fields{column-count:2;column-gap:24px}
  .course-card-fields .field-group{break-inside:avoid}
  .course-card-fields .status-section{column-span:all}
  .field-value.textarea-field{min-height:120px}
}
</style>
</head>
<body>
<div id="app"></div>

<script>
(function(){
'use strict';

// ═════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════
const state = {
  courses: [],
  filtered: [],
  search: '',
  filterStatus: 'all',
  dark: localStorage.getItem('dark') === 'true',
  loading: true,
  saving: new Set(),
  undoStack: [],
  expandedCard: null,
  currentView: localStorage.getItem('view') || 'courses',
  showAddCourse: false,
  tasks: [],
  taskLoading: false,
  reportStart: '',
  reportEnd: '',
  reportData: null,
  reportLoading: false,
  loadError: false,
  contacts: [],
  contactSearch: '',
  showAddContact: false,
  editContactId: null,
};

const API = {
  async get(endpoint) {
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    try { return JSON.parse(text); } catch(e) { throw new Error('Invalid JSON response'); }
  },
  async post(endpoint, data) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    try { return JSON.parse(text); } catch(e) { throw new Error('Invalid JSON response'); }
  },
};

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'className') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v);
  });
  (children || []).forEach(c => { if (c != null) e.append(c); });
  return e;
}

function statusBadge(status) {
  const cls = status === 'تایید شده' || status === 'تایید نهایی' ? 'approved'
    : status === 'نیاز به ویرایش' ? 'changes'
    : status === 'تایید با توضیحات' ? 'approved-notes'
    : 'pending';
  const icons = { approved: '✓', pending: '○', changes: '✗', 'approved-notes': '!' };
  return '<span class="badge ' + cls + '">' + (icons[cls] || '') + ' ' + (status || 'در حال بررسی') + '</span>';
}

function statusOptions(selected) {
  const opts = ['در حال بررسی', 'تایید شده', 'نیاز به ویرایش', 'تایید نهایی', 'تایید با توضیحات'];
  return opts.map(o => '<option value="' + o + '"' + (o === selected ? ' selected' : '') + '>' + o + '</option>').join('');
}

function fieldIcon(key) {
  const icons = {
    course_name: '📚', normal_price: '💰', discounted_price: '🏷️', syllabus: '📋',
    duration: '⏱️', sessions_count: '📊', full_description: '📝', certificate_status: '🎓',
    installment_conditions: '💳', instructor: '👤', offers: '🎁', seo_checklist: '🔍',
    course_url: '🔗', last_update: '📅', keywords: '🔑'
  };
  return icons[key] || '📄';
}

function persianLabel(key) {
  const labels = {
    course_name: 'نام دوره', normal_price: 'قیمت عادی', discounted_price: 'قیمت با تخفیف',
    syllabus: 'سرفصل های دوره', duration: 'مدت زمان', sessions_count: 'تعداد جلسات',
    full_description: 'اطلاعات دوره', certificate_status: 'فلش و گواهینامه',
    installment_conditions: 'شرایط خرید اقساطی', instructor: 'مدرس', offers: 'پیشنهادات',
    seo_checklist: 'چک لیست سئو', course_url: 'لینک دوره', last_update: 'آخرین تاریخ آپدیت',
    keywords: 'کلمات کلیدی مرتبط', review_status: 'وضعیت بازبینی', notes: 'یادداشت‌ها'
  };
  return labels[key] || key;
}

const largeFields = ['syllabus', 'full_description', 'seo_checklist', 'installment_conditions', 'offers'];
const summaryFields = ['instructor', 'duration', 'normal_price', 'discounted_price'];
const displayFields = ['course_name', 'normal_price', 'discounted_price', 'duration', 'sessions_count', 'instructor',
  'certificate_status', 'installment_conditions', 'course_url', 'last_update', 'keywords',
  'offers', 'seo_checklist', 'syllabus', 'full_description'];

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function toast(msg, undoFn) {
  const container = $('#toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span>' + msg + '</span>';
  if (undoFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = 'بازگردانی';
    btn.onclick = () => { undoFn(); t.classList.add('toast-hide'); setTimeout(() => t.remove(), 300); };
    t.appendChild(btn);
  }
  container.appendChild(t);
  setTimeout(() => { if (t.parentNode) { t.classList.add('toast-hide'); setTimeout(() => t.remove(), 300); } }, 4000);
}

// ═════════════════════════════════════════════════════════════════════════
// API
// ═════════════════════════════════════════════════════════════════════════
let loadCoursesTimer = null;
async function loadCourses() {
  state.loading = true;
  state.loadError = false;
  render();

  // Safety timeout: force loading off after 8 seconds
  if (loadCoursesTimer) clearTimeout(loadCoursesTimer);
  loadCoursesTimer = setTimeout(function() {
    if (state.loading) {
      state.loading = false;
      state.loadError = true;
      render();
    }
  }, 8000);

  try {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.filterStatus !== 'all') params.set('status', state.filterStatus);
    const data = await API.get('/api/courses?' + params.toString());
    state.courses = data.courses || [];
    state.loadError = false;
  } catch (e) {
    console.error('loadCourses error:', e);
    state.loadError = true;
    state.courses = [];
  } finally {
    state.loading = false;
    if (loadCoursesTimer) { clearTimeout(loadCoursesTimer); loadCoursesTimer = null; }
    applyFilters();
  }
}

async function updateCourse(id, field, value) {
  const idx = state.courses.findIndex(c => c.id === id);
  if (idx === -1) return;
  const prev = state.courses[idx][field];
  state.undoStack.push({ id, field, value: prev });
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.courses[idx][field] = value;

  // Skip render() calls while modal editor is open
  // Otherwise render() destroys the focused textarea, causing keyboard flicker on mobile
  if (!editorCourseId) {
    state.saving.add(id + ':' + field);
    render();
  }

  try {
    await API.post('/api/course/' + id, { field, value });
    if (!editorCourseId) {
      state.saving.delete(id + ':' + field);
      render();
    }
  } catch (e) {
    state.courses[idx][field] = prev;
    if (!editorCourseId) {
      state.saving.delete(id + ':' + field);
      render();
    }
    toast('خطا در ذخیره‌سازی');
  }
}

function undoLast() {
  if (!state.undoStack.length) return;
  const last = state.undoStack.pop();
  const idx = state.courses.findIndex(c => c.id === last.id);
  if (idx === -1) return;
  state.courses[idx][last.field] = last.value;
  updateCourse(last.id, last.field, last.value);
  toast('بازگردانی شد');
}

async function syncFromSheet() {
  const btn = $('#sync-btn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const data = await API.post('/api/sync', {});
    if (data.success) {
      state.courses = data.courses || [];
      applyFilters();
      toast('هماهنگ‌سازی با شیت انجام شد (' + (data.sync ? data.sync.total : '') + ' دوره)');
    } else {
      toast('خطا در هماهنگ‌سازی: ' + (data.error || ''));
    }
  } catch (e) {
    toast('خطا در ارتباط با سرور');
  }
  if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
}

function applyFilters() {
  let list = state.courses ? [...state.courses] : [];
  if (state.search) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(c =>
      (c.course_name || '').toLowerCase().includes(q) ||
      (c.keywords || '').toLowerCase().includes(q) ||
      (c.instructor || '').toLowerCase().includes(q)
    );
  }
  if (state.filterStatus !== 'all') {
    list = list.filter(c => c.review_status === state.filterStatus);
  }
  state.filtered = list;
  render();
}

function setFilter(status) {
  state.filterStatus = status;
  applyFilters();
}

function setSearch(val) {
  state.search = val;
  applyFilters();
}

function toggleDark() {
  state.dark = !state.dark;
  localStorage.setItem('dark', state.dark);
  document.documentElement.classList.toggle('dark', state.dark);
  render();
}

function toggleExpand(id) {
  state.expandedCard = state.expandedCard === id ? null : id;
  render();
}

// ═════════════════════════════════════════════════════════════════════════
// MOBILE FULL-SCREEN EDITOR
// ═════════════════════════════════════════════════════════════════════════
let editorCourseId = null;
let editorField = null;
let editorSaveTimer = null;

function openEditor(courseId, fieldKey) {
  editorCourseId = courseId;
  editorField = fieldKey;
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;

  // Append modal overlay directly without full re-render
  // This avoids destroying existing DOM (and focused elements) on mobile
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  const frag = renderModal();
  const root = $('#app');
  if (root) root.appendChild(frag);

  // Focus textarea on next frame to ensure DOM is ready
  requestAnimationFrame(function() {
    const ta = $('.modal-textarea');
    if (ta) {
      ta.value = course[fieldKey] || '';
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  });
}

function closeEditor() {
  editorCourseId = null;
  editorField = null;
  if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
  render();
}

function saveEditor() {
  if (!editorCourseId || !editorField) return;
  const ta = $('.modal-textarea');
  if (!ta) return;
  updateCourse(editorCourseId, editorField, ta.value);
  closeEditor();
  toast('✓ ذخیره شد');
}

function copyField(text) {
  if (!text) { toast('متن خالی است'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast('کپی شد');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('کپی شد'); } catch(e) { toast('خطا در کپی'); }
  document.body.removeChild(ta);
}

function renderModal() {
  if (!editorCourseId || !editorField) return document.createDocumentFragment();
  const course = state.courses.find(c => c.id === editorCourseId);
  if (!course) return document.createDocumentFragment();
  const frag = document.createDocumentFragment();
  const overlay = el('div', { className: 'modal-overlay', onclick: function(e) { if (e.target === this) closeEditor(); } });
  const editor = el('div', { className: 'modal-editor' });
  const dir = (editorField === 'course_url' || editorField === 'keywords') ? 'ltr' : 'rtl';

  // Header
  const header = el('div', { className: 'modal-header' });
  const title = el('div', { className: 'modal-title' });
  title.innerHTML = fieldIcon(editorField) + ' ' + persianLabel(editorField);
  header.appendChild(title);
  const closeBtn = el('button', { className: 'modal-close', onclick: closeEditor }, document.createTextNode('✕'));
  header.appendChild(closeBtn);
  editor.appendChild(header);

  // Body
  const body = el('div', { className: 'modal-body' });
  const ta = el('textarea', {
    className: 'modal-textarea',
    dir: dir,
  });
  ta.textContent = course[editorField] || '';
  body.appendChild(ta);
  editor.appendChild(body);

  // Footer
  const footer = el('div', { className: 'modal-footer' });
  const statusEl = el('span', { className: 'modal-status' });
  footer.appendChild(statusEl);
  const saveBtn = el('button', {
    className: 'modal-save',
    onclick: saveEditor
  }, document.createTextNode('💾 ذخیره'));
  footer.appendChild(saveBtn);
  editor.appendChild(footer);

  overlay.appendChild(editor);
  frag.appendChild(overlay);

  // Auto-save on input (does NOT close modal — only explicit save button does)
  ta.oninput = function() {
    if (editorSaveTimer) clearTimeout(editorSaveTimer);
    editorSaveTimer = setTimeout(function() {
      updateCourse(editorCourseId, editorField, ta.value);
      if (statusEl) statusEl.textContent = '✓ ذخیره شد';
    }, 600);
  };
  setTimeout(function() { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 100);

  return frag;
}

// ═════════════════════════════════════════════════════════════════════════
// DESKTOP COURSE DETAIL MODAL
// ═════════════════════════════════════════════════════════════════════════
let detailCourseId = null;

function openDetailView(courseId) {
  detailCourseId = courseId;
  render();
}

function closeDetailView() {
  detailCourseId = null;
  render();
}

function renderDetailModal() {
  if (!detailCourseId) return document.createDocumentFragment();
  const course = state.courses.find(function(c) { return c.id === detailCourseId; });
  if (!course) return document.createDocumentFragment();
  const frag = document.createDocumentFragment();
  const overlay = el('div', {
    className: 'detail-overlay',
    onclick: function(e) { if (e.target === this) closeDetailView(); }
  });
  const panel = el('div', { className: 'detail-panel' });

  // Header
  const header = el('div', { className: 'detail-header' });
  header.innerHTML = '<h2>📄 ' + esc(course.course_name || 'دوره') + '</h2>';
  const closeBtn = el('button', {
    className: 'modal-close',
    onclick: closeDetailView
  }, document.createTextNode('✕'));
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Body — all fields
  const body = el('div', { className: 'detail-body' });
  const sectionBreaks = ['installment_conditions', 'course_url', 'seo_checklist', 'syllabus'];
  displayFields.forEach(function(key) {
    if (sectionBreaks.includes(key)) {
      body.appendChild(el('div', { className: 'section-divider' }));
    }
    const group = el('div', { className: 'detail-field-group' });
    const label = el('div', { className: 'detail-field-label' });
    label.innerHTML = fieldIcon(key) + ' ' + persianLabel(key);
    group.appendChild(label);
    const valueDiv = el('div', {
      className: 'detail-field-value hover-highlight',
      onclick: function() { closeDetailView(); setTimeout(function() { openEditor(course.id, key); }, 50); }
    });
    valueDiv.textContent = course[key] || '(خالی)';
    if (!course[key]) valueDiv.style.color = 'var(--text-muted)';
    if (key === 'course_url' || key === 'keywords') valueDiv.setAttribute('dir', 'ltr');
    group.appendChild(valueDiv);
    // Action buttons
    const actions = el('div', { style: 'display:flex;gap:6px;margin-top:6px' });
    const editBtn = el('button', {
      className: 'detail-action-btn',
      onclick: function() { closeDetailView(); setTimeout(function() { openEditor(course.id, key); }, 50); }
    }, document.createTextNode('✏️ ویرایش'));
    actions.appendChild(editBtn);
    const copyBtn = el('button', {
      className: 'detail-action-btn',
      onclick: function(e) { e.stopPropagation(); copyField(course[key] || ''); }
    }, document.createTextNode('📋 کپی'));
    actions.appendChild(copyBtn);
    group.appendChild(actions);
    body.appendChild(group);
  });

  // Status section
  body.appendChild(el('div', { className: 'section-divider' }));
  const statusGroup = el('div', { className: 'detail-field-group' });
  const statusLabel = el('div', { className: 'detail-field-label' });
  statusLabel.textContent = '🏷️ وضعیت بازبینی نهایی';
  statusGroup.appendChild(statusLabel);
  const statusSelect = el('select', {
    className: 'detail-select',
    onchange: function() { updateCourse(course.id, 'review_status', this.value); }
  });
  statusSelect.innerHTML = statusOptions(course.review_status);
  statusGroup.appendChild(statusSelect);
  body.appendChild(statusGroup);

  panel.appendChild(body);
  overlay.appendChild(panel);
  frag.appendChild(overlay);
  return frag;
}

// ═════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═════════════════════════════════════════════════════════════════════════
function setView(view) {
  state.currentView = view;
  localStorage.setItem('view', view);
  if (view === 'tasks') loadTasks();
  if (view === 'reports') initReport();
  if (view === 'contacts') loadContacts();
  render();
}

function renderNav() {
  const nav = el('nav', { className: 'nav-bar' });
  const items = [
    { id: 'courses', label: 'دوره‌ها', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { id: 'contacts', label: 'مخاطبین', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
    { id: 'add', label: 'جدید', special: 'nav-add', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>' },
    { id: 'tasks', label: 'وظایف', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
    { id: 'reports', label: 'گزارشات', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>' },
  ];
  items.forEach(function(item) {
    if (item.id === 'add') {
      const btn = el('button', {
        className: 'nav-item nav-add',
        onclick: function() { state.showAddCourse = true; render(); }
      });
      btn.innerHTML = '<span class="nav-icon">' + item.svg + '</span><span class="nav-label">' + item.label + '</span>';
      nav.appendChild(btn);
    } else {
      const btn = el('button', {
        className: 'nav-item' + (state.currentView === item.id ? ' active' : ''),
        onclick: function() { setView(item.id); }
      });
      btn.innerHTML = '<span class="nav-icon">' + item.svg + '</span><span>' + item.label + '</span>';
      nav.appendChild(btn);
    }
  });
  return nav;
}

// ═════════════════════════════════════════════════════════════════════════
// ADD COURSE MODAL
// ═════════════════════════════════════════════════════════════════════════
function renderAddCourseModal() {
  if (!state.showAddCourse) return document.createDocumentFragment();
  const frag = document.createDocumentFragment();
  const overlay = el('div', {
    className: 'add-course-overlay',
    onclick: function(e) { if (e.target === this) { state.showAddCourse = false; render(); } }
  });
  const panel = el('div', { className: 'add-course-panel', onclick: function(e) { e.stopPropagation(); } });
  const header = el('div', { className: 'add-course-header' });
  header.innerHTML = '<h2>➕ افزودن دوره جدید</h2><button class="modal-close" id="add-close">✕</button>';
  panel.appendChild(header);

  const body = el('div', { className: 'add-course-body' });
  const fieldDefs = [
    { key: 'course_name', label: 'نام دوره', type: 'text', full: true },
    { key: 'normal_price', label: 'قیمت عادی', type: 'text' },
    { key: 'discounted_price', label: 'قیمت با تخفیف', type: 'text' },
    { key: 'duration', label: 'مدت زمان', type: 'text' },
    { key: 'sessions_count', label: 'تعداد جلسات', type: 'text' },
    { key: 'instructor', label: 'مدرس', type: 'text' },
    { key: 'certificate_status', label: 'فلش و گواهینامه', type: 'text' },
    { key: 'installment_conditions', label: 'شرایط خرید اقساطی', type: 'text', large: true },
    { key: 'course_url', label: 'لینک دوره', type: 'text' },
    { key: 'last_update', label: 'آخرین تاریخ آپدیت', type: 'text' },
    { key: 'keywords', label: 'کلمات کلیدی', type: 'text', full: true },
    { key: 'offers', label: 'پیشنهادات', type: 'text', large: true },
    { key: 'seo_checklist', label: 'چک لیست سئو', type: 'text', large: true, full: true },
    { key: 'syllabus', label: 'سرفصل های دوره', type: 'text', large: true, full: true },
    { key: 'full_description', label: 'اطلاعات دوره', type: 'text', large: true, full: true },
  ];

  let gridHtml = '<div class="form-grid">';
  fieldDefs.forEach(f => {
    const cls = f.full ? ' full-width' : '';
    if (f.large) {
      gridHtml += '<div class="field-group' + cls + '"><label>' + f.label + '</label><textarea id="af-' + f.key + '" rows="4" dir="rtl"></textarea></div>';
    } else {
      gridHtml += '<div class="field-group' + cls + '"><label>' + f.label + '</label><input type="text" id="af-' + f.key + '" dir="rtl"></div>';
    }
  });
  gridHtml += '</div>';
  body.innerHTML = gridHtml;

  panel.appendChild(body);

  const footer = el('div', { className: 'add-course-footer' });
  const cancelBtn = el('button', { className: 'btn-cancel', onclick: function() { state.showAddCourse = false; render(); } }, document.createTextNode('انصراف'));
  const saveBtn = el('button', { className: 'btn-save', onclick: saveNewCourse }, document.createTextNode('💾 ذخیره دوره'));
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  panel.appendChild(footer);

  overlay.appendChild(panel);
  frag.appendChild(overlay);

  // Wire close button
  setTimeout(function() {
    const cb = document.getElementById('add-close');
    if (cb) cb.onclick = function() { state.showAddCourse = false; render(); };
  }, 50);

  return frag;
}

async function saveNewCourse() {
  const data = {};
  const fields = ['course_name','normal_price','discounted_price','syllabus','duration','sessions_count','full_description','certificate_status','installment_conditions','instructor','offers','seo_checklist','course_url','last_update','keywords'];
  fields.forEach(f => {
    const el = document.getElementById('af-' + f);
    if (el) data[f] = el.value;
  });
  if (!data.course_name || !data.course_name.trim()) { toast('نام دوره الزامی است'); return; }
  try {
    const res = await API.post('/api/courses', data);
    if (res.success) {
      toast('دوره اضافه شد');
      state.showAddCourse = false;
      await loadCourses();
      render();
    } else {
      toast('خطا: ' + (res.error || 'نامشخص'));
    }
  } catch(e) {
    toast('خطا در ارتباط با سرور');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// TASKS VIEW
// ═════════════════════════════════════════════════════════════════════════
async function loadTasks() {
  state.taskLoading = true;
  if (state.currentView === 'tasks') render();
  try {
    const data = await API.get('/api/tasks');
    state.tasks = data.tasks || [];
  } catch(e) {
    console.error('loadTasks error:', e);
    state.tasks = [];
  }
  state.taskLoading = false;
  if (state.currentView === 'tasks') render();
}

async function createTask() {
  const input = document.getElementById('new-task-input');
  if (!input || !input.value.trim()) { toast('عنوان وظیفه الزامی است'); return; }
  const prioSelect = document.getElementById('task-priority-select');
  const priority = prioSelect ? prioSelect.value : 'medium';
  try {
    await API.post('/api/tasks', { title: input.value.trim(), status: 'todo', priority: priority, created_by: 'client' });
    input.value = '';
    await loadTasks();
    render();
  } catch(e) { toast('خطا'); }
}

async function updateTaskStatus(id, status) {
  try {
    await API.post('/api/tasks/' + id, { field: 'status', value: status });
    await loadTasks();
    render();
  } catch(e) { toast('خطا'); }
}

async function deleteTask(id) {
  if (!confirm('حذف شود؟')) return;
  try {
    await fetch('/api/tasks/' + id, { method: 'DELETE' });
    await loadTasks();
    render();
  } catch(e) { toast('خطا'); }
}

// No inline function definitions needed - all event delegation is in the global handler below

function renderTasksView() {
  const wrap = el('div', { className: 'fade-in' });

  const header = el('div', { className: 'tasks-header' });
  header.innerHTML = '<h2>📋 مدیریت وظایف</h2>';
  wrap.appendChild(header);

  // New task form
  const form = el('div', { className: 'task-new-form' });
  form.innerHTML =
    '<label class="prio-label">میزان اولویت:</label>' +
    '<select id="task-priority-select" class="priority-dropdown">' +
      '<option value="low">↓ پایین</option>' +
      '<option value="medium" selected>متوسط</option>' +
      '<option value="high">↑ بالا</option>' +
    '</select>' +
    '<input type="text" id="new-task-input" placeholder="وظیفه جدید..." dir="rtl">' +
    '<button id="create-task-btn">➕ افزودن</button>';
  wrap.appendChild(form);

  if (state.taskLoading) {
    wrap.innerHTML += '<div style="text-align:center;padding:40px;color:var(--text-muted)">⏳</div>';
    return wrap;
  }

  const board = el('div', { className: 'tasks-board' });
  const columns = [
    { status: 'todo', title: '📋 برای انجام', tasks: state.tasks.filter(t => t.status === 'todo') },
    { status: 'in_progress', title: '🔄 در حال انجام', tasks: state.tasks.filter(t => t.status === 'in_progress') },
    { status: 'done', title: '✅ انجام شده', tasks: state.tasks.filter(t => t.status === 'done') },
  ];

  columns.forEach(col => {
    const colDiv = el('div', { className: 'task-column' });
    const colHeader = el('div', { className: 'task-column-header' });
    colHeader.innerHTML = col.title + ' <span class="task-count">(' + col.tasks.length + ')</span>';
    colDiv.appendChild(colHeader);

    col.tasks.forEach(task => {
      const card = el('div', { className: 'task-card' });
      const priorityClass = 'priority-' + (task.priority || 'low');
      card.innerHTML =
        '<div class="task-title">' + esc(task.title) + '</div>' +
        (task.description ? '<div class="task-desc">' + esc(task.description) + '</div>' : '') +
        '<div class="task-meta">' +
          '<span class="priority-badge ' + priorityClass + '">' + ({low:'پایین',medium:'متوسط',high:'بالا'}[task.priority] || 'medium') + '</span>' +
          (task.due_date ? '<span style="font-size:0.65rem;color:var(--text-muted)">📅 ' + esc(task.due_date) + '</span>' : '') +
        '</div>';
      // Action buttons - use data attributes with event delegation
      const actions = el('div', { style: 'margin-top:8px;display:flex;gap:4px;flex-wrap:wrap' });
      if (col.status === 'todo') {
        actions.innerHTML += '<button class="task-status-btn" data-task-action="start" data-task-id="' + task.id + '">🔄 در حال انجام</button>';
      }
      if (col.status === 'in_progress') {
        actions.innerHTML += '<button class="task-status-btn" data-task-action="done" data-task-id="' + task.id + '">✅ انجام شده</button>';
        actions.innerHTML += '<button class="task-status-btn" data-task-action="pause" data-task-id="' + task.id + '">⏸ در انتظار انجام</button>';
      }
      if (col.status === 'done') {
        actions.innerHTML += '<button class="task-status-btn" data-task-action="reopen" data-task-id="' + task.id + '">🔄 در حال انجام</button>';
      }
      actions.innerHTML += '<button class="task-status-btn" style="color:var(--danger)" data-task-action="delete" data-task-id="' + task.id + '">🗑 حذف</button>';
      card.appendChild(actions);
      colDiv.appendChild(card);
    });

    if (!col.tasks.length) {
      colDiv.innerHTML += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem">خالی</div>';
    }
    board.appendChild(colDiv);
  });

  wrap.appendChild(board);
  return wrap;
}

// ═════════════════════════════════════════════════════════════════════════
// REPORTS VIEW
// ═════════════════════════════════════════════════════════════════════════
function initReport() {
  if (!state.reportStart) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    state.reportStart = y + '-' + m + '-01';
    // Calculate end of month
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    state.reportEnd = y + '-' + m + '-' + String(lastDay).padStart(2, '0');
  }
  state.reportData = null;
}

async function generateReport() {
  if (!state.reportStart) { toast('تاریخ شروع را وارد کنید'); return; }
  state.reportLoading = true;
  render();
  try {
    const url = '/api/report?start=' + state.reportStart + (state.reportEnd ? '&end=' + state.reportEnd : '');
    const data = await API.get(url);
    state.reportData = data;
    state.reportLoading = false;
    render();
  } catch(e) {
    state.reportLoading = false;
    toast('خطا در تولید گزارش');
    render();
  }
}

function downloadReport() {
  if (!state.reportData) return;
  const d = state.reportData;
  const pct = d.period.totalDays > 0 ? Math.round(d.period.passedDays / d.period.totalDays * 100) : 0;

  let html = '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>گزارش ماهانه</title>';
  html += '<style>body{font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;padding:40px;color:#1a1d29;line-height:1.8}';
  html += 'h1{font-size:1.5rem;margin-bottom:8px}h2{font-size:1.2rem;margin:24px 0 8px;border-bottom:2px solid #7c3aed;padding-bottom:4px}';
  html += '.stat{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb}';
  html += '.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.75rem}';
  html += '.badge-done{background:#d1fae5;color:#065f46}.badge-progress{background:#fef3c7;color:#92400e}.badge-todo{background:#f3f4f6;color:#6b7280}';
  html += 'ul{list-style:none;padding:0}li{padding:6px 0;border-bottom:1px solid #f3f4f6}';
  html += '.footer{margin-top:40px;font-size:0.8rem;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px}</style></head><body>';
  html += '<h1>📊 گزارش ماهانه</h1>';
  html += '<p style="color:#6b7280">دوره: ' + d.period.start + ' تا ' + d.period.end + '</p>';
  html += '<p>پیشرفت: ' + pct + '% (' + d.period.passedDays + ' روز از ' + d.period.totalDays + ' روز)</p>';
  html += '<p>تولید شده در: ' + new Date(d.reportGenerated).toLocaleDateString('fa-IR') + '</p>';

  html += '<h2>📋 وظایف تکمیل شده</h2>';
  html += '<p>تعداد: ' + (d.completedTasks || []).length + '</p><ul>';
  (d.completedTasks || []).forEach(t => { html += '<li>✓ ' + esc(t.title) + '</li>'; });
  html += '</ul>';

  html += '<h2>🔄 وظایف در حال انجام</h2>';
  html += '<p>تعداد: ' + (d.inProgressTasks || []).length + '</p><ul>';
  (d.inProgressTasks || []).forEach(t => { html += '<li>🔄 ' + esc(t.title) + '</li>'; });
  html += '</ul>';

  html += '<h2>📚 تغییرات دوره‌ها</h2>';
  html += '<p>تعداد: ' + (d.courseChanges || []).length + '</p><ul>';
  (d.courseChanges || []).forEach(c => { html += '<li>' + esc(c.course_name) + ' — ' + (c.review_status || '') + '</li>'; });
  html += '</ul>';

  html += '<h2>📈 خلاصه</h2>';
  html += '<div class="stat"><span>کل دوره‌ها</span><span>' + (d.totalCourses || 0) + '</span></div>';
  html += '<div class="stat"><span>وظایف تکمیل شده</span><span>' + (d.completedTasks || []).length + '</span></div>';
  html += '<div class="stat"><span>وظایف در حال انجام</span><span>' + (d.inProgressTasks || []).length + '</span></div>';

  html += '<div class="footer">گزارش خودکار — سامانه مدیریت بازبینی روان‌کلاس</div>';
  html += '</body></html>';

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report-' + state.reportStart + '.html';
  a.click();
  URL.revokeObjectURL(url);
  toast('گزارش دانلود شد');
}

function renderReportsView() {
  const wrap = el('div', { className: 'fade-in' });
  const header = el('div', { className: 'reports-header' });
  header.innerHTML = '<h2>📊 گزارشات ماهانه</h2><p>مشاهده پیشرفت و خلاصه فعالیت‌ها</p>';
  wrap.appendChild(header);

  const controls = el('div', { className: 'report-controls' });
  controls.innerHTML =
    '<div class="field"><label>از تاریخ</label><input type="date" id="rp-start" value="' + state.reportStart + '" dir="ltr"></div>' +
    '<div class="field"><label>تا تاریخ</label><input type="date" id="rp-end" value="' + state.reportEnd + '" dir="ltr"></div>' +
    '<button class="gen-btn" id="rp-gen">📄 تولید گزارش</button>';
  wrap.appendChild(controls);

  if (!state.reportData && !state.reportLoading) {
    const hint = el('div', { style: 'text-align:center;padding:60px 20px;color:var(--text-muted)' });
    hint.innerHTML = 'تاریخ را انتخاب کنید و دکمه تولید گزارش را بزنید';
    wrap.appendChild(hint);
    // Wire events on next tick
    setTimeout(function() {
      const s = document.getElementById('rp-start');
      const e = document.getElementById('rp-end');
      const g = document.getElementById('rp-gen');
      if (s) s.onchange = function() { state.reportStart = this.value; };
      if (e) e.onchange = function() { state.reportEnd = this.value; };
      if (g) g.onclick = generateReport;
    }, 50);
    return wrap;
  }

  if (state.reportLoading) {
    wrap.innerHTML += '<div style="text-align:center;padding:40px;color:var(--text-muted)">⏳ در حال تولید گزارش...</div>';
    return wrap;
  }

  const d = state.reportData;
  if (!d) return wrap;
  const pct = d.period.totalDays > 0 ? Math.round(d.period.passedDays / d.period.totalDays * 100) : 0;

  // Progress bar
  const prog = el('div', { className: 'report-progress' });
  prog.innerHTML =
    '<div class="progress-label">⏱ پیشرفت ماه: ' + d.period.passedDays + ' روز از ' + d.period.totalDays + ' روز (' + pct + '%)</div>' +
    '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  wrap.appendChild(prog);

  // Report output
  const output = el('div', { className: 'report-output show' });
  let outHtml = '<h3>📋 وظایف تکمیل شده</h3><p>' + (d.completedTasks || []).length + ' مورد</p>';
  if ((d.completedTasks || []).length) {
    outHtml += '<ul>';
    d.completedTasks.forEach(t => { outHtml += '<li>✓ ' + esc(t.title) + '</li>'; });
    outHtml += '</ul>';
  }
  outHtml += '<h3>🔄 وظایف در حال انجام</h3><p>' + (d.inProgressTasks || []).length + ' مورد</p>';
  if ((d.inProgressTasks || []).length) {
    outHtml += '<ul>';
    d.inProgressTasks.forEach(t => { outHtml += '<li>🔄 ' + esc(t.title) + '</li>'; });
    outHtml += '</ul>';
  }
  outHtml += '<h3>📚 تغییرات دوره‌ها</h3><p>' + (d.courseChanges || []).length + ' مورد</p>';
  if ((d.courseChanges || []).length) {
    outHtml += '<ul>';
    d.courseChanges.forEach(c => { outHtml += '<li>' + esc(c.course_name) + ' — ' + (c.review_status || '') + '</li>'; });
    outHtml += '</ul>';
  }
  outHtml += '<h3>📈 خلاصه</h3>';
  outHtml += '<div class="stat-row"><span>کل دوره‌ها</span><span>' + (d.totalCourses || 0) + '</span></div>';
  outHtml += '<div class="stat-row"><span>وظایف تکمیل شده</span><span>' + (d.completedTasks || []).length + '</span></div>';
  outHtml += '<div class="stat-row"><span>وظایف در حال انجام</span><span>' + (d.inProgressTasks || []).length + '</span></div>';
  outHtml += '<div class="stat-row"><span>تاریخ گزارش</span><span>' + new Date(d.reportGenerated).toLocaleDateString('fa-IR') + '</span></div>';
  outHtml += '<button class="download-btn" data-action="download-report">📥 دانلود گزارش</button>';
  output.innerHTML = outHtml;
  wrap.appendChild(output);

  // Wire events on next tick
  setTimeout(function() {
    const s = document.getElementById('rp-start');
    const e = document.getElementById('rp-end');
    const g = document.getElementById('rp-gen');
    if (s) s.onchange = function() { state.reportStart = this.value; };
    if (e) e.onchange = function() { state.reportEnd = this.value; };
    if (g) g.onclick = generateReport;
  }, 50);

  return wrap;
}

// ─── Contacts Frontend ────────────────────────────────────────────────────────

async function loadContacts() {
  state.contacts = [];
  try {
    const data = await API.get('/api/contacts');
    state.contacts = data.contacts || [];
  } catch(e) {
    toast('خطا در بارگذاری مخاطبین');
  }
  render();
}

function renderContactsView() {
  const wrap = el('div', { className: 'fade-in' });
  const header = el('div', { className: 'tasks-header' });
  header.innerHTML = '<h2>👤 مخاطبین</h2><p>مدیریت لیست مخاطبین و ارتباطات</p>';
  wrap.appendChild(header);

  const toolbar = el('div', { className: 'toolbar-row' });
  const searchWrap = el('div', { style: 'position:relative;flex:1' });
  const searchInput = el('input', {
    type: 'text', placeholder: 'جستجوی مخاطب...', value: state.contactSearch,
    className: 'task-search-input',
    oninput: function() { state.contactSearch = this.value; render(); }
  });
  searchWrap.appendChild(searchInput);
  toolbar.appendChild(searchWrap);

  const addBtn = el('button', {
    className: 'add-task-btn',
    onclick: function() { state.showAddContact = true; renderAddContactModal(); }
  }, document.createTextNode('+ جدید'));
  toolbar.appendChild(addBtn);

  const exportBtn = el('button', {
    className: 'add-task-btn',
    style: 'background:var(--primary);margin-right:8px',
    onclick: function() { exportContacts(); }
  }, document.createTextNode('📥 خروجی'));
  toolbar.appendChild(exportBtn);

  const importBtn = el('button', {
    className: 'add-task-btn',
    style: 'background:var(--primary);margin-right:8px',
    onclick: function() { document.getElementById('contact-csv-input').click(); }
  }, document.createTextNode('📤 ورودی'));
  toolbar.appendChild(importBtn);

  const fileInput = el('input', {
    type: 'file', id: 'contact-csv-input', accept: '.csv',
    style: 'display:none',
    onchange: function(e) { importContactsCSV(e.target); }
  });
  toolbar.appendChild(fileInput);
  wrap.appendChild(toolbar);

  // Filter contacts by search
  let filtered = state.contacts;
  if (state.contactSearch) {
    const q = state.contactSearch.trim().toLowerCase();
    filtered = filtered.filter(function(c) {
      return (c.first_name + ' ' + c.last_name).toLowerCase().includes(q) ||
             (c.phone || '').toLowerCase().includes(q) ||
             (c.email || '').toLowerCase().includes(q);
    });
  }

  if (!filtered.length) {
    const empty = el('div', { className: 'empty-state' });
    empty.innerHTML = '<div class="empty-icon">📭</div><h3>مخاطبی یافت نشد</h3><p>' +
      (state.contacts.length ? 'موردی با جستجوی شما مطابقت ندارد' : 'هنوز مخاطبی اضافه نشده') + '</p>';
    wrap.appendChild(empty);
    return wrap;
  }

  const list = el('div', { className: 'contact-list' });
  filtered.forEach(function(c) {
    const card = el('div', { className: 'task-card', style: 'margin-bottom:10px;padding:14px' });
    const nameLine = el('div', { style: 'display:flex;justify-content:space-between;align-items:center' });
    const nameSpan = el('span', {
      style: 'font-weight:700;font-size:1rem;color:var(--text)'
    }, document.createTextNode(c.first_name + ' ' + c.last_name || '—'));
    nameLine.appendChild(nameSpan);

    const actions = el('div', { style: 'display:flex;gap:6px' });
    const editBtn = el('button', {
      className: 'badge-action', style: 'cursor:pointer',
      onclick: function() { openEditContact(c.id); }
    }, document.createTextNode('✏️'));
    actions.appendChild(editBtn);
    const delBtn = el('button', {
      className: 'badge-action', style: 'cursor:pointer',
      onclick: function() { if (confirm('حذف شود؟')) deleteContact(c.id); }
    }, document.createTextNode('🗑️'));
    actions.appendChild(delBtn);
    nameLine.appendChild(actions);
    card.appendChild(nameLine);

    if (c.phone) {
      const p = el('div', { style: 'font-size:0.85rem;color:var(--text-secondary);margin-top:6px' });
      p.innerHTML = '📞 ' + esc(c.phone) + (c.email ? ' &nbsp;|&nbsp; ✉️ ' + esc(c.email) : '');
      card.appendChild(p);
    } else if (c.email) {
      const p = el('div', { style: 'font-size:0.85rem;color:var(--text-secondary);margin-top:6px' });
      p.innerHTML = '✉️ ' + esc(c.email);
      card.appendChild(p);
    }

    if (c.notes) {
      const n = el('div', { style: 'font-size:0.8rem;color:var(--text-muted);margin-top:6px;background:var(--card-bg);padding:8px;border-radius:6px' });
      n.textContent = c.notes;
      card.appendChild(n);
    }

    list.appendChild(card);
  });
  wrap.appendChild(list);

  return wrap;
}

function openEditContact(id) {
  state.editContactId = id;
  render();
}

function closeContactModals() {
  state.showAddContact = false;
  state.editContactId = null;
  render();
}

function renderAddContactModal() {
  const overlay = el('div', { className: 'modal-overlay show', onclick: function(e) { if (e.target === this) closeContactModals(); } });
  const modal = el('div', { className: 'modal show', style: 'max-width:450px;padding:24px' });
  modal.innerHTML =
    '<h3 style="margin-bottom:16px">➕ مخاطب جدید</h3>' +
    '<div class="field"><label>نام</label><input type="text" id="ac-first" placeholder="نام"></div>' +
    '<div class="field"><label>نام خانوادگی</label><input type="text" id="ac-last" placeholder="نام خانوادگی"></div>' +
    '<div class="field"><label>تلفن</label><input type="text" id="ac-phone" placeholder="تلفن" dir="ltr"></div>' +
    '<div class="field"><label>ایمیل</label><input type="email" id="ac-email" placeholder="ایمیل" dir="ltr"></div>' +
    '<div class="field"><label>یادداشت</label><textarea id="ac-notes" rows="3" placeholder="یادداشت..." style="width:100%"></textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:16px">' +
    '<button class="save-btn" id="ac-save" style="flex:1">ذخیره</button>' +
    '<button class="cancel-btn" id="ac-cancel" style="flex:1">انصراف</button></div>';
  modal.querySelector('#ac-save').onclick = function() { saveNewContact(); };
  modal.querySelector('#ac-cancel').onclick = function() { closeContactModals(); };
  overlay.appendChild(modal);
  return overlay;
}

function renderEditContactModal(contact) {
  if (!contact) return document.createDocumentFragment();
  const overlay = el('div', { className: 'modal-overlay show', onclick: function(e) { if (e.target === this) closeContactModals(); } });
  const modal = el('div', { className: 'modal show', style: 'max-width:450px;padding:24px' });
  modal.innerHTML =
    '<h3 style="margin-bottom:16px">✏️ ویرایش مخاطب</h3>' +
    '<div class="field"><label>نام</label><input type="text" id="ec-first" value="' + escAttr(contact.first_name) + '"></div>' +
    '<div class="field"><label>نام خانوادگی</label><input type="text" id="ec-last" value="' + escAttr(contact.last_name) + '"></div>' +
    '<div class="field"><label>تلفن</label><input type="text" id="ec-phone" value="' + escAttr(contact.phone) + '" dir="ltr"></div>' +
    '<div class="field"><label>ایمیل</label><input type="email" id="ec-email" value="' + escAttr(contact.email) + '" dir="ltr"></div>' +
    '<div class="field"><label>یادداشت</label><textarea id="ec-notes" rows="3" style="width:100%">' + esc(contact.notes) + '</textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:16px">' +
    '<button class="save-btn" id="ec-save" style="flex:1">ذخیره تغییرات</button>' +
    '<button class="cancel-btn" id="ec-cancel" style="flex:1">انصراف</button></div>';
  modal.querySelector('#ec-save').onclick = function() { saveEditedContact(contact.id); };
  modal.querySelector('#ec-cancel').onclick = function() { closeContactModals(); };
  overlay.appendChild(modal);
  return overlay;
}

async function saveNewContact() {
  const first = document.getElementById('ac-first');
  const last = document.getElementById('ac-last');
  const phone = document.getElementById('ac-phone');
  const email = document.getElementById('ac-email');
  const notes = document.getElementById('ac-notes');
  if (!first || !last) return;
  try {
    const res = await API.post('/api/contacts', {
      first_name: first.value || '',
      last_name: last.value || '',
      phone: phone ? phone.value : '',
      email: email ? email.value : '',
      notes: notes ? notes.value : ''
    });
    if (res && res.success) {
      state.contacts.push(res.contact);
      toast('✓ مخاطب اضافه شد');
    }
  } catch(e) {
    toast('خطا در ذخیره');
  }
  closeContactModals();
}

async function saveEditedContact(id) {
  const fields = ['first_name', 'last_name', 'phone', 'email', 'notes'];
  const ids = ['ec-first', 'ec-last', 'ec-phone', 'ec-email', 'ec-notes'];
  for (let i = 0; i < fields.length; i++) {
    const el2 = document.getElementById(ids[i]);
    if (!el2) continue;
    const val = el2.value || '';
    const contact = state.contacts.find(function(c) { return c.id === id; });
    if (contact && contact[fields[i]] === val) continue;
    try {
      await API.post('/api/contacts/' + id, { field: fields[i], value: val });
    } catch(e) {
      toast('خطا در ذخیره ' + fields[i]);
    }
  }
  // Reload
  const data = await API.get('/api/contacts');
  if (data && data.contacts) {
    state.contacts = data.contacts;
  }
  toast('✓ ذخیره شد');
  closeContactModals();
}

async function deleteContact(id) {
  try {
    await fetch('/api/contacts/' + id, { method: 'DELETE' });
    state.contacts = state.contacts.filter(function(c) { return c.id !== id; });
    toast('✓ حذف شد');
    render();
  } catch(e) {
    toast('خطا در حذف');
  }
}

async function exportContacts() {
  try {
    const r = await fetch('/api/contacts/export');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('✓ خروجی گرفته شد');
  } catch(e) {
    toast('خطا در خروجی');
  }
}

async function importContactsCSV(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;
    // Parse simple CSV
    const lines = text.split('\\n').filter(function(l) { return l.trim(); });
    if (lines.length < 2) { toast('فایل CSV معتبر نیست'); return; }
    const headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
    const contacts = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
      const obj = {};
      headers.forEach(function(h, idx) { obj[h] = vals[idx] || ''; });
      contacts.push(obj);
    }
    try {
      const res = await API.post('/api/contacts/import', { contacts: contacts });
      if (res && res.success) {
        toast('✓ ' + (res.imported || 0) + ' مخاطب وارد شد');
        const data = await API.get('/api/contacts');
        if (data && data.contacts) state.contacts = data.contacts;
        render();
      }
    } catch(e) {
      toast('خطا در ورود اطلاعات');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ═════════════════════════════════════════════════════════════════════════
// RENDER
// ═════════════════════════════════════════════════════════════════════════
function render() {
  const root = $('#app');
  if (!root) return;
  document.documentElement.classList.toggle('dark', state.dark);

  // Preserve modal textarea state if editor is open (defense-in-depth)
  let savedModalValue = null;
  let savedModalScroll = null;
  if (editorCourseId) {
    const existingTa = $('.modal-textarea');
    if (existingTa) {
      savedModalValue = existingTa.value;
      savedModalScroll = existingTa.scrollTop;
    }
  }

  root.innerHTML = '';
  root.appendChild(renderHeader());
  root.appendChild(renderNav());
  root.appendChild(renderToastContainer());

  if (state.currentView === 'tasks') {
    const main = el('div', { className: 'app', style: 'padding-bottom:120px' });
    main.appendChild(renderTasksView());
    root.appendChild(main);
  } else if (state.currentView === 'reports') {
    const main = el('div', { className: 'app', style: 'padding-bottom:120px' });
    main.appendChild(renderReportsView());
    root.appendChild(main);
  } else if (state.currentView === 'contacts') {
    const main = el('div', { className: 'app', style: 'padding-bottom:120px' });
    main.appendChild(renderContactsView());
    root.appendChild(main);
    // Contact add/edit modals appended to root (same as course modals)
    if (state.showAddContact) {
      root.appendChild(renderAddContactModal());
    }
    if (state.editContactId) {
      const contact = state.contacts.find(function(c) { return c.id === state.editContactId; });
      if (contact) root.appendChild(renderEditContactModal(contact));
    }
  } else {
    // Courses (default)
    const main = el('div', { className: 'app' });
    if (state.loading && !state.courses.length) {
      // Show skeleton with safety message
      main.appendChild(renderSkeletons());
      const waitMsg = el('div', { style: 'text-align:center;padding:4px 0 16px;font-size:0.78rem;color:var(--text-muted)' },
        document.createTextNode('در حال بارگذاری اطلاعات...')
      );
      main.appendChild(waitMsg);
    } else if (state.loadError && !state.courses.length) {
      // Error state with retry
      const errorDiv = el('div', { style: 'text-align:center;padding:60px 20px' });
      errorDiv.innerHTML =
        '<div style="font-size:3rem;margin-bottom:12px">⚠️</div>' +
        '<h3 style="font-size:1.05rem;color:var(--text);margin-bottom:8px">خطا در بارگذاری داده‌ها</h3>' +
        '<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:20px">داده‌ای یافت نشد — لطفا دوباره تلاش کنید</p>' +
        '<button class="filter-btn active" id="retry-load-btn">🔄 تلاش مجدد</button>';
      main.appendChild(errorDiv);
    } else {
      main.appendChild(renderMetrics());
      main.appendChild(renderFilters());
      main.appendChild(renderCourseCounts());
      main.appendChild(renderMobileView());
      main.appendChild(renderDesktopView());
      if (!state.filtered.length && !state.loading) {
        // Empty results after filter
        const empty = el('div', { className: 'empty-state' });
        empty.innerHTML = '<div class="empty-icon">📭</div><h3>دوره‌ای یافت نشد</h3><p>موردی با فیلترهای انتخابی شما مطابقت ندارد</p>';
        main.appendChild(empty);
      }
    }
    root.appendChild(main);
  }
  root.appendChild(renderModal());
  // Restore modal textarea state if editor was open (prevents keyboard flicker on re-render)
  if (editorCourseId && savedModalValue !== null) {
    const newTa = $('.modal-textarea');
    if (newTa) {
      newTa.value = savedModalValue;
      newTa.scrollTop = savedModalScroll || 0;
      newTa.focus();
    }
  }
  root.appendChild(renderDetailModal());
  root.appendChild(renderAddCourseModal());
}

function renderHeader() {
  const header = el('header', { className: 'header' });
  const logo = el('div', { className: 'header-logo' },
    (function(){
      const wrap = el('div', { className: 'psych-icon' });
      wrap.innerHTML = '<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><path class="icon-stroke" d="M14 4C8.48 4 4 8.48 4 14s4.48 10 10 10 10-4.48 10-10S19.52 4 14 4z"/><path class="icon-stroke" d="M14 10v8"/><path class="icon-stroke" d="M10 14h8"/><circle class="icon-stroke" cx="14" cy="14" r="2" fill="var(--primary)"/></svg>';
      return wrap;
    })(),
    el('span', { className: 'logo-text' }, document.createTextNode('روان‌کلاس'))
  );
  header.appendChild(logo);
  const wrap = el('div', { className: 'search-wrap' },
    el('span', { className: 'search-icon' }, document.createTextNode('🔍')),
    el('input', {
      type: 'text', placeholder: 'جستجوی دوره...', value: state.search,
      oninput: debounce(function(){ setSearch(this.value); }, 300)
    })
  );
  header.appendChild(wrap);
  const actions = el('div', { className: 'header-actions' });
  const syncBtn = el('button', {
    id: 'sync-btn', title: 'هماهنگ‌سازی با شیت',
    onclick: syncFromSheet
  }, document.createTextNode('🔄'));
  actions.appendChild(syncBtn);
  const undoBtn = el('button', {
    title: 'بازگردانی (Ctrl+Z)',
    onclick: undoLast
  }, document.createTextNode('↩️'));
  actions.appendChild(undoBtn);
  const darkBtn = el('button', {
    title: state.dark ? 'حالت روشن' : 'حالت تاریک',
    onclick: toggleDark
  }, document.createTextNode(state.dark ? '☀️' : '🌙'));
  actions.appendChild(darkBtn);
  header.appendChild(actions);
  return header;
}

function renderToastContainer() {
  return el('div', { id: 'toast-container', className: 'toast-container' });
}

function renderSkeletons() {
  const frag = document.createDocumentFragment();
  const metrics = el('div', { className: 'metrics' });
  for (let i = 0; i < 4; i++) metrics.appendChild(el('div', { className: 'skeleton skeleton-metric' }));
  frag.appendChild(metrics);
  for (let i = 0; i < 5; i++) frag.appendChild(el('div', { className: 'skeleton skeleton-card' }));
  return frag;
}

function renderMetrics() {
  const total = state.courses.length;
  const pending = state.courses.filter(c => c.review_status === 'در حال بررسی' || !c.review_status).length;
  const approved = state.courses.filter(c => c.review_status === 'تایید شده' || c.review_status === 'تایید نهایی').length;
  const changes = state.courses.filter(c => c.review_status === 'نیاز به ویرایش').length;
  const metrics = el('div', { className: 'metrics' });
  const items = [
    { label: 'کل دوره‌ها', value: total, cls: 'purple' },
    { label: 'در انتظار بازبینی', value: pending, cls: 'yellow' },
    { label: 'تایید شده', value: approved, cls: 'green' },
    { label: 'نیاز به ویرایش', value: changes, cls: 'red' },
  ];
  items.forEach(item => {
    const card = el('div', { className: 'metric-card' });
    card.innerHTML = '<div class="metric-label">' + item.label + '</div><div class="metric-value ' + item.cls + '">' + item.value + '</div>';
    metrics.appendChild(card);
  });
  return metrics;
}

function renderFilters() {
  const filters = el('div', { className: 'filters' });
  const items = [
    { label: 'همه', value: 'all' },
    { label: 'در انتظار بازبینی', value: 'در حال بررسی' },
    { label: 'تایید شده', value: 'تایید شده' },
    { label: 'نیاز به ویرایش', value: 'نیاز به ویرایش' },
    { label: 'تایید نهایی', value: 'تایید نهایی' },
  ];
  items.forEach(item => {
    const btn = el('button', {
      className: 'filter-btn' + (state.filterStatus === item.value ? ' active' : ''),
      onclick: () => setFilter(item.value)
    }, document.createTextNode(item.label));
    filters.appendChild(btn);
  });
  return filters;
}

function renderCourseCounts() {
  return el('div', { className: 'course-counts' },
    document.createTextNode('نمایش ' + state.filtered.length + ' دوره از ' + state.courses.length + ' دوره')
  );
}

function renderMobileView() {
  const wrap = el('div', { className: 'mobile-view fade-in' });
  if (!state.filtered.length) {
    wrap.appendChild(el('div', { className: 'empty-state' },
      el('div', { className: 'empty-icon' }, document.createTextNode('📭')),
      el('h3', {}, document.createTextNode('دوره‌ای یافت نشد')),
      el('p', {}, document.createTextNode('موردی با فیلترهای انتخابی شما مطابقت ندارد'))
    ));
    return wrap;
  }
  state.filtered.forEach(course => {
    wrap.appendChild(renderCard(course));
  });
  return wrap;
}

function renderCard(course) {
  const isOpen = state.expandedCard === course.id;
  const card = el('div', { className: 'course-card fade-in' });

  // Header
  const header = el('div', { className: 'course-card-header', onclick: () => toggleExpand(course.id) });
  const main = el('div', { className: 'card-main' });
  main.innerHTML = '<div class="card-title">' + esc(course.course_name || '') + '</div>' +
    '<div class="card-meta">' +
    statusBadge(course.review_status) +
    '<span>📅 ' + esc(course.last_update || '') + '</span>' +
    '</div>';
  header.appendChild(main);
  header.innerHTML += '<div class="card-expand' + (isOpen ? ' open' : '') + '">▼</div>';
  card.appendChild(header);

  // Summary (always visible)
  const summary = el('div', { className: 'course-card-summary' });
  const sumItems = [
    { label: 'مدرس', value: course.instructor },
    { label: 'مدت زمان', value: course.duration },
    { label: 'قیمت عادی', value: course.normal_price },
    { label: 'قیمت با تخفیف', value: course.discounted_price },
  ];
  sumItems.forEach(item => {
    const div = el('div', { className: 'summary-item' });
    div.innerHTML = '<div class="s-label">' + item.label + '</div><div class="s-value">' + esc(item.value || '') + '</div>';
    summary.appendChild(div);
  });
  card.appendChild(summary);

  // Expanded body — all fields + status at bottom
  const body = el('div', { className: 'course-card-body' + (isOpen ? ' open' : '') });
  const fields = el('div', { className: 'course-card-fields' });
  // Fields where a section divider should appear before them
  const sectionBreaks = ['installment_conditions', 'course_url', 'seo_checklist', 'syllabus'];
  displayFields.forEach(key => {
    if (sectionBreaks.includes(key)) {
      fields.appendChild(el('div', { className: 'section-divider' }));
    }
    fields.appendChild(renderField(course, key));
  });
  fields.appendChild(el('div', { className: 'section-divider' }));
  fields.appendChild(renderStatusField(course));
  body.appendChild(fields);
  card.appendChild(body);
  return card;
}

function renderStatusField(course) {
  const section = el('div', { className: 'status-section' });
  const label = el('div', { className: 'field-label' },
    document.createTextNode('🏷️ وضعیت بازبینی نهایی')
  );
  section.appendChild(label);

  // Quick action buttons
  const actions = el('div', { className: 'status-actions' });
  const statuses = [
    { key: 'در حال بررسی', label: '⏳ در انتظار', cls: 'pending' },
    { key: 'تایید شده', label: '✓ تایید شده', cls: 'approve' },
    { key: 'نیاز به ویرایش', label: '✗ نیاز به ویرایش', cls: 'changes' },
  ];
  statuses.forEach(s => {
    const btn = el('button', {
      className: 'status-btn ' + s.cls + (course.review_status === s.key ? ' active' : ''),
      onclick: function() { updateCourse(course.id, 'review_status', s.key); toast(s.label); }
    }, document.createTextNode(s.label));
    actions.appendChild(btn);
  });
  section.appendChild(actions);

  // Dropdown for all status options
  const select = el('select', {
    className: 'status-select',
    style: 'margin-top:10px',
    onchange: function() { updateCourse(course.id, 'review_status', this.value); }
  });
  select.innerHTML = statusOptions(course.review_status);
  section.appendChild(select);
  return section;
}

function renderField(course, key) {
  const group = el('div', { className: 'field-group' });
  const label = el('div', { className: 'field-label' });
  label.innerHTML = fieldIcon(key) + ' ' + persianLabel(key);
  // Copy button
  const cpBtn = el('button', {
    className: 'copy-btn', title: 'کپی متن',
    onclick: function(e) { e.stopPropagation(); copyField(course[key] || ''); }
  }, document.createTextNode('📋'));
  label.appendChild(cpBtn);
  group.appendChild(label);

  const isLarge = largeFields.includes(key);
  const isSaving = state.saving.has(course.id + ':' + key);
  const value = course[key] || '';

  // Display div — click to open mobile modal, or double-click to inline edit on desktop
  const display = el('div', {
    className: 'field-value' + (isLarge ? ' textarea-field' : '') + (isSaving ? ' saving' : '') + ' hover-highlight',
    onclick: function() { openEditor(course.id, key); }
  });
  display.textContent = value || '(خالی)';
  if (!value) display.style.color = 'var(--text-muted)';
  if (key === 'course_url' || key === 'keywords') display.setAttribute('dir', 'ltr');
  display.style.textAlign = 'right';
  group.appendChild(display);

  return group;
}

function renderDesktopView() {
  const wrap = el('div', { className: 'desktop-view fade-in' });
  if (!state.filtered.length) {
    wrap.appendChild(el('div', { className: 'empty-state' },
      el('div', { className: 'empty-icon' }, document.createTextNode('📭')),
      el('h3', {}, document.createTextNode('دوره‌ای یافت نشد')),
      el('p', {}, document.createTextNode('موردی با فیلترهای انتخابی شما مطابقت ندارد'))
    ));
    return wrap;
  }
  const tableWrap = el('div', { className: 'table-wrap' });
  const table = el('table', { className: 'data-table' });

  // Header
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  const headers = ['#', 'نام دوره', 'قیمت عادی', 'قیمت با تخفیف', 'مدت زمان', 'تعداد جلسات',
    'مدرس', 'فلش و گواهینامه', 'وضعیت', 'آخرین آپدیت', 'کلمات کلیدی', 'پیشنهادات', 'جزئیات'];
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  state.filtered.forEach((course, idx) => {
    const row = document.createElement('tr');
    const cells = [
      idx + 1,
      course.course_name,
      course.normal_price,
      course.discounted_price,
      course.duration,
      course.sessions_count,
      course.instructor,
      course.certificate_status,
      course.review_status,
      course.last_update,
      course.keywords,
      course.offers
    ];
    cells.forEach((val, ci) => {
      const td = document.createElement('td');
      if (ci === 0) { td.textContent = val; }
      else if (ci === 8) { td.innerHTML = statusBadge(val); }
      else {
        const colKey = ['', 'course_name', 'normal_price', 'discounted_price', 'duration', 'sessions_count',
          'instructor', 'certificate_status', 'review_status', 'last_update', 'keywords', 'offers'][ci];
        const isLong = largeFields.includes(colKey);
        if (isLong) {
          // Long fields: show truncated preview with modal edit button
          const displayDiv = el('div', { className: 'cell-long-preview' });
          displayDiv.textContent = val || '';
          if (!val) displayDiv.style.color = 'var(--text-muted)';
          td.appendChild(displayDiv);
          const actionRow = el('div', { style: 'display:flex;gap:4px;margin-top:4px' });
          const editBtn = el('button', {
            className: 'cell-action-btn',
            onclick: function() { openEditor(course.id, colKey); }
          }, document.createTextNode('✏️'));
          actionRow.appendChild(editBtn);
          const copyBtn = el('button', {
            className: 'cell-action-btn',
            onclick: function(e) { e.stopPropagation(); copyField(val || ''); }
          }, document.createTextNode('📋'));
          actionRow.appendChild(copyBtn);
          td.appendChild(actionRow);
        } else {
          const input = el('input', {
            className: 'cell-edit',
            type: 'text',
            value: val || '',
            placeholder: '—',
            oninput: debounce(function() {
              updateCourse(course.id, colKey, this.value);
            }, 800)
          });
          td.appendChild(input);
        }
      }
      row.appendChild(td);
    });
    // Detail button
    const detailTd = document.createElement('td');
    const detailBtn = el('button', {
      className: 'cell-action-btn',
      onclick: function() { openDetailView(course.id); }
    }, document.createTextNode('📄'));
    detailTd.appendChild(detailBtn);
    row.appendChild(detailTd);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  return wrap;
}

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoLast();
  }
});

// ═════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════
if (state.dark) document.documentElement.classList.add('dark');

// ─── Global event delegation ───
document.addEventListener('click', function(e) {
  // Retry button (error view)
  if (e.target.id === 'retry-load-btn') {
    loadCourses();
    return;
  }
  // Create task button
  if (e.target.id === 'create-task-btn') {
    e.preventDefault();
    createTask();
    return;
  }
  // Download report button
  if (e.target.matches('[data-action="download-report"]')) {
    downloadReport();
    return;
  }
  // Task action buttons (data-task-action)
  const btn = e.target.closest('[data-task-action]');
  if (btn) {
    const id = parseInt(btn.getAttribute('data-task-id'));
    const action = btn.getAttribute('data-task-action');
    if (action === 'start' || action === 'reopen') {
      updateTaskStatus(id, 'in_progress');
    } else if (action === 'done') {
      updateTaskStatus(id, 'done');
    } else if (action === 'pause') {
      updateTaskStatus(id, 'todo');
    } else if (action === 'delete') {
      deleteTask(id);
    }
  }
});

// Enter key on task input
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.id === 'new-task-input') {
    e.preventDefault();
    createTask();
  }
});

// ─── Bootstrap: render shell immediately, load data async ───
render();
loadCourses().catch(function(e) {
  console.error('Bootstrap error:', e);
  state.loading = false;
  state.loadError = true;
  render();
});

// Safety timeout: if render() never completes (unlikely but defense-in-depth)
setTimeout(function() {
  if (state.loading) {
    state.loading = false;
    state.loadError = true;
    render();
  }
}, 10000);

// ─── DEBUG MODE: log raw API responses to console ───
(function() {
  // Wrap API.get to log responses
  const origGet = API.get;
  API.get = async function(url) {
    console.log('[DEBUG] GET', url);
    try {
      const r = await fetch(url);
      const text = await r.text();
      console.log('[DEBUG] Response status:', r.status);
      console.log('[DEBUG] Raw response (first 500 chars):', text.substring(0, 500));
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        console.error('[DEBUG] JSON parse error:', e.message);
        throw new Error('Invalid JSON response from ' + url);
      }
      if (!r.ok) {
        console.error('[DEBUG] HTTP error:', r.status, data);
        throw new Error('HTTP ' + r.status + ': ' + (data.error || ''));
      }
      console.log('[DEBUG] Parsed data:', data);
      return data;
    } catch(e) {
      console.error('[DEBUG] Fetch error:', e);
      throw e;
    }
  };

  // Wrap API.post similarly
  const origPost = API.post;
  API.post = async function(url, body) {
    console.log('[DEBUG] POST', url, body);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await r.text();
      console.log('[DEBUG] Response status:', r.status);
      console.log('[DEBUG] Raw response (first 500 chars):', text.substring(0, 500));
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        console.error('[DEBUG] JSON parse error:', e.message);
        throw new Error('Invalid JSON response from ' + url);
      }
      if (!r.ok) {
        console.error('[DEBUG] HTTP error:', r.status, data);
        throw new Error('HTTP ' + r.status + ': ' + (data.error || ''));
      }
      console.log('[DEBUG] Parsed data:', data);
      return data;
    } catch(e) {
      console.error('[DEBUG] Fetch error:', e);
      throw e;
    }
  };
})();

})();
</script>
</body>
</html>`;

// ─── Main Fetch Handler ─────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    await ensureTableExists(env);

    try {
      // API Routes
      if (path === '/api/courses' && method === 'GET') {
        return await handleGetCourses(request, env);
      }
      if (path === '/api/courses' && method === 'POST') {
        // Create single course (has course_name) or bulk import (has courses array)
        const body = await request.json().catch(() => ({}));
        if (body && body.course_name) return await handleCreateCourse(request, env);
        if (body && body.courses) return await handleImport(request, env);
        return await handleSync(request, env);
      }
      if (path === '/api/metrics' && method === 'GET') {
        return await handleMetrics(env);
      }
      if (path === '/api/sync' && method === 'POST') {
        return await handleSync(request, env);
      }
      if (path === '/api/import' && method === 'POST') {
        return await handleImport(request, env);
      }
      if (path === '/api/debug' && method === 'GET') {
        return await handleDebug(env);
      }
      if (path === '/api/tasks' && method === 'GET') {
        return await handleGetTasks(env);
      }
      if (path === '/api/tasks' && method === 'POST') {
        return await handleCreateTask(request, env);
      }
      if (path === '/api/report' && method === 'GET') {
        return await handleReport(request, env);
      }
      const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
      if (taskMatch) {
        const id = parseInt(taskMatch[1]);
        if (method === 'PUT') return await handleUpdateTask(request, env, id);
        if (method === 'DELETE') return await handleDeleteTask(env, id);
      }
      const courseMatch = path.match(/^\/api\/course\/(\d+)$/);
      if (courseMatch) {
        const id = parseInt(courseMatch[1]);
        if (method === 'GET') return await handleGetCourse(request, env, id);
        if (method === 'POST' || method === 'PUT') return await handleUpdateCourse(request, env, id);
      }

      // Contacts routes
      if (path === '/api/contacts' && method === 'GET') {
        return await handleGetContacts(env);
      }
      if (path === '/api/contacts' && method === 'POST') {
        return await handleCreateContact(request, env);
      }
      if (path === '/api/contacts/import' && method === 'POST') {
        return await handleImportContacts(request, env);
      }
      if (path === '/api/contacts/export' && method === 'GET') {
        return await handleExportContacts(request, env);
      }
      const contactMatch = path.match(/^\/api\/contacts\/(\d+)$/);
      if (contactMatch) {
        const id = parseInt(contactMatch[1]);
        if (method === 'POST' || method === 'PUT') return await handleUpdateContact(request, env, id);
        if (method === 'DELETE') return await handleDeleteContact(env, id);
      }

      // Serve frontend
      return new Response(HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: 'Internal server error: ' + e.message }, 500);
    }
  }
};
