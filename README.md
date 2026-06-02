# 🇶🇦 Qatar Hypermarket Price Comparison

Compare fruit & vegetable prices across **Rawabi**, **Family Food Centre**, and **Lulu Hypermarket** in Qatar — updated automatically every 6 hours.

---

## 📸 Features

- **Live price comparison** — side-by-side prices from 3 hypermarkets
- **Search & filter** — by product name, category, and brand
- **Price history chart** — click any product to see historical trends
- **Company comparison chart** — bar chart of average prices per store
- **Excel export** — download filtered table as `.xlsx`
- **Auto-scraping** — GitHub Actions runs every 6 hours and commits updated DB
- **Lowest price highlight** — green badge marks the cheapest option

---

## 🏗️ Project Structure

```
qatar-price-compare/
│
├── scraper/                  # Python scrapers
│   ├── rawabi.py             # Rawabi Hypermarket scraper
│   ├── family.py             # Family Food Centre scraper
│   ├── lulu.py               # Lulu Hypermarket scraper
│   ├── database.py           # SQLite operations
│   ├── models.py             # SQL schema
│   ├── utils.py              # Brand extraction, price parsing
│   ├── main.py               # Orchestrator (runs all scrapers)
│   └── requirements.txt
│
├── frontend/                 # Next.js 14 app
│   ├── src/app/
│   │   ├── page.tsx          # Main dashboard
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── lib/db.ts         # SQLite helper for API routes
│   │   └── api/
│   │       ├── products/     # Price comparison query
│   │       ├── categories/   # Category list
│   │       ├── brands/       # Brand list
│   │       └── price-history/ # Historical prices for charts
│   └── package.json
│
├── data/
│   └── products.db           # SQLite database (committed to git)
│
├── .github/workflows/
│   └── scrape.yml            # GitHub Actions schedule
│
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/qatar-price-compare.git
cd qatar-price-compare
```

### 2. Run the scrapers locally

```bash
cd scraper
pip install -r requirements.txt
playwright install chromium
python main.py
```

This creates `data/products.db` with scraped products and prices.

### 3. Run the frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ☁️ Deployment

### Frontend → Vercel

1. Push repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Set **Root Directory** to `frontend`
4. Add environment variable:
   - `DATABASE_PATH` = `/data/products.db`
5. Deploy!

> **Note:** The `data/products.db` file must be committed to your git repo. Vercel reads it at build time. The GitHub Actions workflow updates it automatically every 6 hours and pushes changes, triggering a new Vercel deployment.

### Scraper → GitHub Actions

The workflow runs automatically on push and every 6 hours.

To trigger manually:
- Go to **Actions** tab in GitHub → **Scrape Qatar Hypermarket Prices** → **Run workflow**

---

## 🗄️ Database Schema

```sql
companies    (id, name, website)
categories   (id, name)
brands       (id, name)
products     (id, company_id, category_id, brand_id, product_name, product_url, image_url)
price_history (id, product_id, price, currency, scraped_at)
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Scraping | Python · Playwright · Async |
| Storage | SQLite (better-sqlite3) |
| Frontend | Next.js 14 · TypeScript · Tailwind CSS |
| Charts | Recharts |
| Export | SheetJS (xlsx) |
| Automation | GitHub Actions |
| Hosting | Vercel |

---

## 📝 Adding a New Supermarket

1. Create `scraper/newstore.py` following the same pattern as `rawabi.py`
2. Add it to `scraper/main.py` in `asyncio.gather()`
3. Insert the company in `models.py` SEED SQL
4. The frontend will automatically pick it up (add a new column in `page.tsx`)

---

## 📊 Sample Search Results

| Product | Brand | Category | Rawabi | Family | Lulu | Avg |
|---------|-------|----------|--------|--------|------|-----|
| Tomato Local | Unknown | Fruits & Vegetables | 7.00 | 8.00 | 6.50 | 7.17 |
| Banana Cavendish | Dole | Fruits & Vegetables | 4.50 | 5.00 | 4.25 | 4.58 |

---

## ⚠️ Notes

- Websites are dynamic (JS-rendered) — Playwright is required (not BeautifulSoup)
- Prices update **once per day** per product (deduped by date)
- The scraper has a **20-page safety limit** per category
- If a product only exists at one store, other prices show as `—`

---

## 📄 License

MIT
