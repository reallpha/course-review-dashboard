<div dir="rtl" align="right">

# داشبورد مدیریت دوره‌ها (Course Review Dashboard) 🎓

پنل مدیریت و بررسی دوره‌ها — ساخته‌شده روی Cloudflare Workers + D1

یک داشبورد مدرن، سبک و کاملاً فارسی برای بررسی، ویرایش و تأیید دوره‌ها. این پروژه سیستم بررسی محتوای مبتنی بر Google Sheets را به یک رابط کاربری سریع، واکنش‌گرا و بدون نیاز به سرور اختصاصی تبدیل می‌کند.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![RTL](https://img.shields.io/badge/RTL-Persian-success)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

## 📖 معرفی پروژه

**Course Review Dashboard** یک پنل مدیریت سبک و سریع است که روی Cloudflare Workers اجرا می‌شود و برای بررسی، ویرایش و تأیید دوره‌ها طراحی شده است. با این پنل می‌توانید داده‌های دوره‌ها را از یک Google Sheet بخوانید، در پایگاه داده D1 ذخیره کنید، و از یک رابط کاربری کاملاً فارسی و راست‌چین آن‌ها را مدیریت کنید.

این پروژه با ترکیب یکپارچه‌سازی Google Sheets و ابزارهای ویرایش درجا، کار بررسی دوره‌ها را ساده‌تر می‌کند. جستجو، فیلتر، متریک‌های زنده، ویرایش با ذخیره خودکار و امکان بازگردانی آخرین تغییر، بخشی از قابلیت‌های آن هستند.

- **توسعه‌داده‌شده توسط:** [reallpha](https://github.com/reallpha)
- **زبان رابط کاربری:** فارسی و راست‌چین (RTL)
- **پلتفرم اجرا:** Cloudflare Workers
- **پایگاه داده:** Cloudflare D1 (SQLite)
- **مجوز:** MIT

---

## ✨ قابلیت‌ها

### 🎨 طراحی و تجربه کاربری
- طراحی **Mobile-first** و واکنش‌گرا (کارت در موبایل، جدول در دسکتاپ)
- پشتیبانی کامل فارسی و راست‌چین (RTL)
- فونت اختصاصی فارسی (Vazirmatn)
- حالت روشن و تیره (Dark Mode)
- اعلان‌های Toast برای بازخورد عملیات
- هدر چسبان و اهداف لمسی بزرگ در موبایل
- آکاردئون بازشو برای مشاهده جزئیات در موبایل

### ✏️ مدیریت و ویرایش
- **ویرایش درجا** (Inline Editing) — روی هر فیلد کلیک کنید و همان‌جا ویرایش کنید
- **ذخیره خودکار** — تغییرات ۸۰۰ میلی‌ثانیه بعد از توقف تایپ ذخیره می‌شوند
- **بازگردانی آخرین تغییر** (Undo) با `Ctrl+Z` / `Cmd+Z`
- جستجو در نام دوره‌ها و کلمات کلیدی
- فیلتر بر اساس وضعیت بررسی
- دکمه‌های اقدام سریع (✓ / ✗) برای تأیید یا رد دوره

### 📊 داشبورد و آمار
- نمایش متریک‌های زنده: تعداد کل، در انتظار، تأییدشده، نیاز به تغییر
- به‌روزرسانی خودکار پس از هر تغییر

### 🔄 یکپارچه‌سازی
- **همگام‌سازی یک‌کلیکی** از Google Sheet با دکمه 🔄
- Google Sheet به‌عنوان منبع اصلی داده (Source of Truth)
- ذخیره‌سازی محلی در D1 برای پاسخ‌دهی سریع

### 🛠️ زیرساخت
- بدون نیاز به احراز هویت (لینک عمومی قابل اشتراک)
- بدون سرویس پولی — کاملاً روی پلن رایگان Cloudflare
- API سبک و قابل توسعه
- استقرار با یک دستور (`wrangler deploy`)
- سازگار با آخرین نسخه‌های مرورگرها

---

## 📁 ساختار پروژه

```
course-review-dashboard/
├── schema.sql        # اسکیمای پایگاه داده D1
├── wrangler.jsonc    # تنظیمات Cloudflare Workers
├── package.json      # متادیتای پروژه
├── src/
│   └── index.js      # Worker (API + فرانت‌اند امبد شده)
└── README.md
```

---

## 🚀 راهنمای استقرار

### پیش‌نیازها

1. [Node.js](https://nodejs.org/) نسخه ۱۸ یا بالاتر
2. Wrangler CLI
3. حساب Cloudflare با D1 فعال

نصب Wrangler:

```bash
npm install -g wrangler
```

### گام ۱ — ورود به Cloudflare

```bash
wrangler login
```

### گام ۲ — ساخت پایگاه داده D1

```bash
cd course-review-dashboard
wrangler d1 create course-review-db
```

مقدار `database_id` را از خروجی کپی کنید.

### گام ۳ — به‌روزرسانی تنظیمات

فایل `wrangler.jsonc` را باز کنید و مقدار `your-database-id-here` را با ID واقعی جایگزین کنید.

### گام ۴ — مقداردهی اسکیما

```bash
wrangler d1 execute course-review-db --file=schema.sql
```

### گام ۵ — استقرار Worker

```bash
wrangler deploy
```

### گام ۶ — همگام‌سازی اولیه (اختیاری)

آدرس Worker خود را باز کنید و دکمه 🔄 را در نوار بالا بزنید تا داده‌ها از Google Sheet خوانده شوند.

آدرس نهایی Worker به این شکل خواهد بود:

```
https://course-review-dashboard.<your-subdomain>.workers.dev
```

---

## ⚙️ نحوه کارکرد

1. **منبع داده:** Google Sheet پیکربندی‌شده، منبع اصلی داده است.
2. **همگام‌سازی:** با کلیک روی 🔄 همه ردیف‌ها از شیت خوانده و در D1 ذخیره می‌شوند.
3. **ویرایش:** روی هر فیلد کلیک کنید — تغییر به‌صورت خودکار در D1 ذخیره می‌شود.
4. **بررسی:** هر دوره یک فیلد وضعیت بررسی دارد که با dropdown یا دکمه‌های ✓ / ✗ تنظیم می‌شود.
5. **بازگردانی:** با `Ctrl+Z` یا دکمه ↩️ آخرین ویرایش برگردانده می‌شود.

---

## 🔌 مسیرهای API

| متد | مسیر | توضیح |
|------|------|--------|
| GET | `/api/courses` | فهرست دوره‌ها (query: `?search=term&status=approved`) |
| GET | `/api/course/:id` | دریافت یک دوره |
| POST | `/api/course/:id` | به‌روزرسانی یک فیلد `{ field: "name", value: "new" }` |
| POST | `/api/sync` | همگام‌سازی از Google Sheet |
| GET | `/api/metrics` | دریافت متریک‌های داشبورد |

---

## 📋 ستون‌های Google Sheet

| ستون | عنوان فارسی |
|------|-------------|
| course_name | نام دوره |
| normal_price | قیمت عادی |
| discounted_price | قیمت با تخفیف |
| syllabus | سرفصل‌های دوره |
| duration | مدت زمان |
| sessions_count | تعداد جلسات |
| full_description | اطلاعات دوره |
| certificate_status | فلش و گواهینامه |
| installment_conditions | شرایط خرید اقساطی |
| instructor | مدرس |
| offers | پیشنهادات |
| seo_checklist | چک‌لیست سئو |
| course_url | لینک دوره |
| last_update | آخرین تاریخ آپدیت |
| keywords | کلمات کلیدی مرتبط |

---

## 📱 واکنش‌گرایی (Responsiveness)

- **موبایل (<768px):** چیدمان کارتی، آکاردئون بازشو، هدر چسبان، اهداف لمسی بزرگ
- **دسکتاپ (≥768px):** چیدمان جدولی با ویرایش درجا، هدر ستون‌های چسبان

---

## 🧰 پشته فناوری

- **Runtime:** Cloudflare Workers
- **پایگاه داده:** Cloudflare D1 (SQLite)
- **فرانت‌اند:** Vanilla JavaScript (بدون فریم‌ورک)
- **استایل:** CSS Custom Properties با پشتیبانی Dark Mode
- **فونت:** Vazirmatn (فارسی) از Google Fonts

---

## ✅ سازگاری

- Cloudflare Workers
- Cloudflare D1
- مرورگرهای مدرن (Chrome, Firefox, Edge, Safari)
- رابط کاربری فارسی و RTL
- پلن رایگان Cloudflare (بدون نیاز به سرویس پولی)

---

این پروژه تحت مجوز [MIT](./LICENSE) منتشر شده است.
