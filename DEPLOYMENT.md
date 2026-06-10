# 🚀 Vercel Deployment Guide

## Quick Deploy to Vercel

### Step 1: Connect GitHub to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"**
3. Select **"Import Git Repository"**
4. Choose your GitHub repo: `mahadinayeem/Qatar-Price-Compare`
5. Click **"Import"**

### Step 2: Configure Project
- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `./frontend`
- **Build Command**: `npm run build`
- **Install Command**: `npm install`

### Step 3: Environment Variables
Click **"Add Environment Variable"** and set:

```
DATABASE_PATH = ./data/products.db
```

### Step 4: Deploy
Click **"Deploy"** button. Vercel will:
- Build the Next.js app
- Deploy to CDN
- Give you a live URL

---

## Auto-Update Data (GitHub Actions)

The project already has `.github/workflows/` setup to:
- Run scraper every 6 hours
- Update the SQLite database
- Commit changes to `data/products.db`
- Auto-redeploy on Vercel

---

## Your Live URL
After deployment, you'll get a URL like:
```
https://qatar-price-compare.vercel.app
```

---

## Troubleshooting

### Database not found
- Ensure `frontend/data/products.db` is committed to Git
- Check Vercel build logs

### Port issues
- Vercel assigns ports automatically
- No need to manually set ports

### Database locked
- Only one instance should access DB at a time
- Vercel runs single instance by default

---

## Manual Redeploy
```bash
# Push to main branch
git push origin main

# Vercel auto-redeploys on push
```

---

For support: Check Vercel dashboard logs under "Deployments"
