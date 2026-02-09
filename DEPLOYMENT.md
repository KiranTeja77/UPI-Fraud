# 🚀 Deployment Guide - Agentic Honey-Pot

This guide covers deploying both the **Backend (Express API)** and **Frontend (React + Vite)** to production.

---

## 📁 Project Structure

```
spam detection/
├── src/                  # Backend (Express.js API)
├── client/               # Frontend (React + Vite)
├── Dockerfile            # Docker config for backend
├── render.yaml           # Render.com blueprint
└── .env.example          # Backend env template
```

---

## 🔧 Prerequisites

1. **GitHub Account** - Push your code to a GitHub repository
2. **Production API Keys**:
   - `API_KEY` - Strong secret key for API authentication
   - `PERPLEXITY_API_KEY` - Get from [Perplexity AI](https://www.perplexity.ai/settings/api)

---

## 🌐 Option A: Render (Backend) + Vercel (Frontend)

### Step 1: Push to GitHub

```bash
cd "spam detection"
git init
git add .
git commit -m "Initial commit for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/honeypot-api.git
git push -u origin main
```

### Step 2: Deploy Backend to Render

1. Go to [Render.com](https://render.com) and sign up/login
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Render will detect `render.yaml` and auto-configure
5. **Set Environment Variables** in the dashboard:
   - `API_KEY`: Your strong secret API key
   - `PERPLEXITY_API_KEY`: Your Perplexity API key
   - `CLIENT_URL`: Your frontend URL (after Vercel deploy)
   - `NODE_ENV`: `production`
6. Click **Apply** to deploy

**Your backend URL will be:** `https://honeypot-api.onrender.com`

### Step 3: Deploy Frontend to Vercel

1. Go to [Vercel.com](https://vercel.com) and sign up/login
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. **Configure**:
   - **Root Directory**: `client`
   - **Framework Preset**: Vite
5. **Set Environment Variables**:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://honeypot-api.onrender.com`)
   - `VITE_API_KEY`: Same as your backend `API_KEY`
6. Click **Deploy**

**Your frontend URL will be:** `https://your-app.vercel.app`

### Step 4: Update Backend CORS

Go back to Render and update the `CLIENT_URL` environment variable:
```
CLIENT_URL=https://your-app.vercel.app
```

---

## 🐳 Option B: Railway (Full Stack)

Railway supports both backend and frontend in one deployment.

### Step 1: Deploy to Railway

1. Go to [Railway.app](https://railway.app) and connect GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Railway will detect the Dockerfile

### Step 2: Configure Environment Variables

In Railway dashboard, add:
```env
PORT=3000
NODE_ENV=production
API_KEY=your-strong-secret-key
PERPLEXITY_API_KEY=your-perplexity-key
CLIENT_URL=*
PERPLEXITY_MODEL=sonar
```

### Step 3: Deploy Frontend Separately

For the frontend, create another service:
1. Click **New** → **GitHub Repo**
2. Set **Root Directory** to `client`
3. Add environment variables:
   - `VITE_API_URL`: Your Railway backend URL
   - `VITE_API_KEY`: Your API key

---

## ☁️ Option C: Fly.io (Backend Only)

### Step 1: Install Fly CLI

```bash
# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Login
fly auth login
```

### Step 2: Launch App

```bash
cd "spam detection"
fly launch --name honeypot-api
```

### Step 3: Set Secrets

```bash
fly secrets set API_KEY="your-strong-secret-key"
fly secrets set PERPLEXITY_API_KEY="your-perplexity-key"
fly secrets set NODE_ENV="production"
fly secrets set CLIENT_URL="https://your-frontend.vercel.app"
```

### Step 4: Deploy

```bash
fly deploy
```

---

## 🔒 Security Checklist

- [ ] Use a **strong, unique API_KEY** (at least 32 characters)
- [ ] Never commit `.env` files to Git
- [ ] Set `NODE_ENV=production` in production
- [ ] Configure `CLIENT_URL` to restrict CORS
- [ ] Enable HTTPS (handled by platform)

---

## 🧪 Verify Deployment

### Test Backend Health

```bash
curl https://your-backend-url.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-21T10:00:00.000Z",
  "version": "1.0.0"
}
```

### Test API Endpoint

```bash
curl -X POST https://your-backend-url.onrender.com/api/honeypot \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "sessionId": "test-session",
    "message": {
      "sender": "scammer",
      "text": "Your account is blocked. Send OTP now!",
      "timestamp": "2024-01-21T10:00:00Z"
    }
  }'
```

---

## 🔄 Continuous Deployment

Both Render and Vercel support auto-deploy:
- Push to `main` branch → Automatic redeploy
- Environment variables can be updated without redeploy

---

## 📝 Environment Variables Reference

### Backend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | `development` or `production` | Yes |
| `API_KEY` | Authentication key for API | Yes |
| `PERPLEXITY_API_KEY` | Perplexity AI API key | Yes |
| `PERPLEXITY_MODEL` | AI model (`sonar`, `sonar-pro`) | No |
| `CLIENT_URL` | Frontend URL for CORS | Yes (prod) |

### Frontend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend API URL | Yes |
| `VITE_API_KEY` | API authentication key | Yes |

---

## 🆘 Troubleshooting

### CORS Errors
- Ensure `CLIENT_URL` is set correctly on backend
- Check that frontend `VITE_API_URL` doesn't have trailing slash

### 503 Service Unavailable
- Free tier services may sleep after inactivity
- First request after sleep may timeout (wait 30s and retry)

### API Key Errors
- Ensure `x-api-key` header is being sent
- Verify API_KEY matches between frontend and backend

---

## 🎉 You're Live!

Once deployed, your honeypot system is ready to:
- ✅ Detect scam messages
- ✅ Engage scammers with AI responses
- ✅ Extract intelligence (phone numbers, UPI IDs, etc.)
- ✅ Report to GUVI callback endpoint
