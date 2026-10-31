/**
 * Local CSV Import Script
 * Usage: node scripts/import-csv.js [worker-url] [csv-path]
 *
 * Defaults:
 *   worker-url: http://localhost:8787
 *   csv-path:   C:\Users\pckala.org\Desktop\ravanclass - Sheet1.csv
 *
 * Reads the local CSV file, parses it, and sends all course data
 * to the Worker's /api/import endpoint which persists into D1.
 */

const fs = require('fs');

const COLUMNS = [
  'course_name', 'normal_price', 'discounted_price', 'syllabus', 'duration',
  'sessions_count', 'full_description', 'certificate_status', 'installment_conditions',
  'instructor', 'offers', 'seo_checklist', 'course_url', 'last_update', 'keywords'
];

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

function isSummaryRow(course) {
  if (!course.course_name) return true;
  const name = course.course_name.trim();
  if (name.startsWith('تعداد دوره')) return true;
  if (name.startsWith('------')) return true;
  if (name === '' && Object.values(course).every(v => !v)) return true;
  return false;
}

async function main() {
  const workerUrl = (process.env.WORKER_URL || process.argv[2] || 'http://localhost:8787').replace(/\/+$/, '');
  const csvPath = process.argv[3] || 'C:\\Users\\pckala.org\\Desktop\\ravanclass - Sheet1.csv';

  console.log('=== CSV Import Tool ===');
  console.log('Worker URL:', workerUrl);
  console.log('CSV path:', csvPath);

  if (!fs.existsSync(csvPath)) {
    console.error('ERROR: CSV file not found:', csvPath);
    process.exit(1);
  }

  const csv = fs.readFileSync(csvPath, 'utf8');
  const allRows = parseCSV(csv);

  if (allRows.length < 2) {
    console.error('ERROR: CSV has no data rows (only', allRows.length, 'row(s) found)');
    process.exit(1);
  }

  const headers = allRows[0];
  console.log('Headers:', headers.join(' | '));
  console.log('Header count:', headers.length);

  // Parse data rows (skip header), filter out summary
  const rawCourses = allRows.slice(1).map((r, i) => sheetRowToCourse(r, i));
  const courses = rawCourses.filter(c => !isSummaryRow(c));
  const filteredCount = rawCourses.length - courses.length;

  console.log('Total data rows in CSV:', rawCourses.length);
  console.log('Summary/footer rows filtered:', filteredCount);
  console.log('Courses to import:', courses.length);

  if (courses.length === 0) {
    console.error('ERROR: No valid courses found in CSV');
    process.exit(1);
  }

  // Log first course as preview
  console.log('\nSample course (first):');
  COLUMNS.forEach(col => {
    const val = courses[0][col] || '(empty)';
    const preview = val.length > 80 ? val.substring(0, 80) + '...' : val;
    console.log('  ' + col + ':', preview);
  });

  // Send to worker
  console.log('\nSending to worker...');
  try {
    const resp = await fetch(workerUrl + '/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courses }),
    });

    const result = await resp.json();
    if (result.success) {
      console.log('\n✓ Import successful!');
      console.log('  Inserted:', result.inserted);
      console.log('  Updated:', result.updated);
      console.log('  Total courses in DB:', result.total);
    } else {
      console.error('\n✗ Import failed:', result.error);
      process.exit(1);
    }
  } catch (e) {
    console.error('\n✗ Connection failed:', e.message);
    console.log('\nMake sure your worker is running:');
    console.log('  npm run dev    (local dev)');
    console.log('  npm run deploy (deployed)');
    console.log('\nThen run: node scripts/import-csv.js https://your-worker-url.workers.dev');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
