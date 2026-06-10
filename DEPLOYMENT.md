# 🚀 Vercel Deployment Guide

## ⚡ Quick Start (2 minutes)

### Step 1: Go to Vercel
1. Visit [vercel.com](https://vercel.com)
2. Sign up with GitHub (if needed)

### Step 2: Create New Project
1. Click **"Add New"** → **"Project"**
2. Click **"Import Git Repository"**
3. Select: **`mahadinayeem/Qatar-Price-Compare`**
4. Click **"Import"**

### Step 3: Configure (Auto-Detected ✅)
- ✅ **Framework**: Next.js (auto-detected)
- ✅ **Root Directory**: `frontend` (auto-detected)
- ✅ **Build Command**: `npm run build` (from vercel.json)
- ✅ **Output Directory**: `.next` (from vercel.json)
- ✅ **Install Command**: `npm install` (from vercel.json)

### Step 4: Deploy
- Click **"Deploy"** button
- Wait 2-3 minutes
- ✅ Your app is live!

---

## 🎯 Your Live URL
After deployment:
```
https://qatar-price-compare.vercel.app
```
(or whatever you name the project)

---

## 🗄️ Database & Data

### Location
- **Path**: `frontend/data/products.db`
- **Status**: ✅ Committed to Git
- **Updated**: Every 6 hours (GitHub Actions)

### Auto-Updates
GitHub Actions workflow automatically:
1. Runs web scrapers every 6 hours
2. Updates SQLite database
3. Commits changes
4. Vercel auto-redeploys

---

## 🔧 Environment Variables (Optional)

For **Google Drive uploads**, add to Vercel:
```
GOOGLE_CREDENTIALS = your_service_account_json
GOOGLE_DRIVE_FOLDER_ID = your_folder_id
```

Without these, the app still works fine with local database.

---

## ✨ Features Included

✅ **Live Price Comparison** - Rawabi, Family, Lulu  
✅ **Search & Filter** - By product type  
✅ **CSV Export** - Download filtered data  
✅ **Price History Charts** - Click products to see trends  
✅ **Dark Mode** - Toggle dark/light theme  
✅ **Auto-Updates** - New data every 6 hours  
✅ **Zero Downtime** - Vercel handles scaling  

---

## 📊 What's Included

```
frontend/          ← Next.js app (deployed to Vercel)
├── src/
│   ├── app/page.tsx      (Main dashboard)
│   ├── api/              (Backend API routes)
│   └── lib/db.ts         (SQLite database handler)
├── data/products.db      (SQLite database - auto-updated)
├── package.json          (Dependencies)
└── tsconfig.json

data/              ← Historical data
└── daily/         (Updated by GitHub Actions)

vercel.json        ← Deployment config (all preset ✅)
.vercelignore      ← Files to skip
```

---

## 🚨 Troubleshooting

### Deployment fails
- Check Vercel build logs
- Ensure `frontend/data/products.db` exists in Git
- Run: `git status` to confirm file is tracked

### Database not updating
- Check GitHub Actions → Workflows
- Verify `.github/workflows/scrape.yml` is running
- Check scraper logs

### Port issues
- Vercel automatically assigns ports
- No manual configuration needed

---

## 📝 Manual Deploy

To redeploy anytime:
```bash
git push origin main
# Vercel auto-redeploys within seconds
```

---

**Everything is ready! Just import to Vercel and go live!** 🎉
