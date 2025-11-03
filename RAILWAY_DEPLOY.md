# 🚂 Deploy Perplexica to Railway

## Prerequisites
- Railway account (sign up at [railway.app](https://railway.app))
- GitHub account
- Your code pushed to GitHub

## Step 1: Push to GitHub

```bash
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your `Perplefina` repository
5. Railway will detect the `railway.toml` and `app.dockerfile`

## Step 3: Add SearXNG Service

1. In your Railway project, click "+ New Service"
2. Choose "Docker Image"
3. Enter: `searxng/searxng:latest`
4. Set internal port: `8080`
5. Click "Deploy"

## Step 4: Configure Environment Variables

In the **App Service** (not SearXNG), add these variables:

### Required Variables
```
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY_HERE

GEMINI_API_KEY=AIzaSy-YOUR_GEMINI_KEY_HERE

SEARXNG_API_URL=http://searxng.railway.internal:8080

DATA_DIR=/home/perplexica
```

### Optional Variables (if you use them)
```
GROQ_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
AIMLAPI_API_KEY=
```

### General Settings
```
SIMILARITY_MEASURE=cosine
KEEP_ALIVE=5m
```

## Step 5: Add PostgreSQL (Recommended)

1. Click "+ New Service"
2. Choose "Database" → "Add PostgreSQL"
3. Railway will auto-configure `DATABASE_URL`

## Step 6: Configure Networking

### For SearXNG Service:
1. Go to Settings → Networking
2. Make it **private** (no public domain needed)
3. Note the internal URL: `searxng.railway.internal:8080`

### For App Service:
1. Go to Settings → Networking
2. Click "Generate Domain" to get a public URL
3. Your app will be available at: `your-app.up.railway.app`

## Step 7: Deploy!

Railway will automatically deploy both services. Watch the logs:
- Click on each service to see build/deploy logs
- Wait for both to show "Active"
- Visit your public domain

## Troubleshooting

### App won't start?
- Check environment variables are set correctly
- Verify `SEARXNG_API_URL` points to internal Railway URL
- Check logs for errors

### SearXNG not responding?
- Make sure internal networking is enabled
- Verify port is set to `8080`
- Check SearXNG container logs

### Database errors?
- Make sure PostgreSQL service is created
- `DATABASE_URL` should be auto-configured
- Run migrations might need manual trigger first time

## Cost Estimate

- **Hobby Plan**: ~$5/month
  - App service: ~$3
  - SearXNG: ~$2
  - PostgreSQL: Included

- **Pro Plan**: ~$20/month (if you need more resources)

## Next Steps

1. ✅ Set up custom domain (optional)
2. ✅ Configure HTTPS (automatic on Railway)
3. ✅ Set up monitoring/alerts
4. ✅ Add more API keys as needed

## Railway CLI (Optional Advanced)

Install Railway CLI for local development:
```bash
npm install -g @railway/cli
railway login
railway link
railway run npm run dev  # Run locally with Railway env vars
```

---

**Questions?** Check Railway docs: https://docs.railway.app

