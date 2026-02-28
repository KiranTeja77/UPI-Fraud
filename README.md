# 🍯 Agentic Honey-Pot for Scam Detection & Intelligence Extraction

An AI-powered honeypot system that detects scam messages, engages scammers in believable multi-turn conversations, and extracts actionable intelligence.

## 🚀 Features

- **Scam Detection**: Combines rule-based pattern matching with AI-powered analysis (Google Gemini)
- **Autonomous AI Agent**: Maintains believable human-like personas throughout conversations
- **Multi-turn Conversations**: Handles extended dialogues with dynamic response adaptation
- **Intelligence Extraction**: Automatically extracts bank accounts, UPI IDs, phone numbers, phishing links, and suspicious keywords
- **Session Management**: Tracks conversation state and intelligence across multiple interactions
- **GUVI Callback Integration**: Automatically reports extracted intelligence to evaluation endpoint

## 📋 Prerequisites

- Node.js 18+
- Python 3.8+ (for ML fraud API)
- Google Gemini API key (for AI-powered responses)
- MongoDB (for Active Defense chat sessions)

---

## 🏃 How to run everything

Use **3 terminals** (or run ML API only when you want fused ML risk).

### Terminal 1 — Backend (Node)

```bash
# From project root
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, MONGODB_URI, API_KEY, and optionally ML_FRAUD_API_URL

npm install
npm run dev
```

Backend runs at **http://localhost:3000**.

### Terminal 2 — Frontend (React)

```bash
# From project root
cd client
npm install
npm run dev
```

Open **http://localhost:5173** in the browser.

### Terminal 3 — ML Fraud API (optional)

Only needed if you want ML risk fused with rule-based risk.

```bash
# From project root
pip install -r ml_api/requirements.txt
python ml_api/train.py
cd ml_api
uvicorn main:app --host 0.0.0.0 --port 5000
```

Then in `.env` set:
```env
ML_FRAUD_API_URL=http://localhost:5000/predict
ML_FRAUD_TIMEOUT_MS=150
```
Restart the Node backend so it picks up the ML URL.

**Quick check:**  
- Backend: http://localhost:3000/health  
- Frontend: http://localhost:5173  
- ML API: http://localhost:5000/health (use **localhost**, not 0.0.0.0)

**Order:** Start backend first, then frontend. Start ML API only if you use it; then set `ML_FRAUD_API_URL` in `.env` and restart the backend.

---

## ⚙️ Installation

1. **Clone and install dependencies**:
   ```bash
   cd "spam detection"
   npm install
   ```

2. **Configure environment**:
   ```bash
   # Copy example config
   cp .env.example .env
   
   # Edit .env with your keys
   ```

3. **Required Environment Variables**:
   ```env
   PORT=3000
   API_KEY=your-secret-api-key
   GEMINI_API_KEY=your-gemini-api-key
   ```

## 🏃 Running the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

## 📡 API Endpoints

### Authentication
All endpoints require the `x-api-key` header:
```
x-api-key: YOUR_SECRET_API_KEY
```

### POST /api/honeypot
Process an incoming message from a suspected scammer.

**Request**:
```json
{
  "sessionId": "unique-session-id",
  "message": {
    "sender": "scammer",
    "text": "Your bank account will be blocked. Verify immediately.",
    "timestamp": "2024-01-21T10:15:30Z"
  },
  "conversationHistory": [],
  "metadata": {
    "channel": "SMS",
    "language": "English",
    "locale": "IN"
  }
}
```

**Response**:
```json
{
  "status": "success",
  "reply": "What do you mean? Why will my account be blocked?"
}
```

### GET /api/honeypot/session/:sessionId
Get detailed information about a session.

### POST /api/honeypot/session/:sessionId/callback
Manually trigger the GUVI callback for a session.

### DELETE /api/honeypot/session/:sessionId
Delete a session.

## 🧠 How It Works

### 1. Scam Detection
- **Rule-based scoring**: Analyzes messages for urgency tactics, threats, financial requests, impersonation, and reward baits
- **AI analysis**: Uses Google Gemini for semantic understanding and contextual analysis
- **Combined confidence**: Weighs both methods for accurate detection

### 2. Agent Behavior
The AI agent adapts its persona based on conversation stage:
- **Early (messages 1-2)**: Confused, asking for clarification
- **Building (messages 3-5)**: Worried, showing concern
- **Questioning (messages 6-8)**: Asking for credentials, reference numbers
- **Extended (messages 9+)**: Stalling, gathering more information

### 3. Intelligence Extraction
Automatically extracts:
- 📱 **Phone Numbers**: Indian mobile formats
- 💳 **Bank Accounts**: 9-18 digit account numbers
- 📲 **UPI IDs**: Standard UPI format (user@bank)
- 🔗 **Phishing Links**: Suspicious URLs
- ⚠️ **Keywords**: Urgency/threat indicators

### 4. GUVI Callback
When sufficient intelligence is gathered, automatically sends to:
```
POST https://hackathon.guvi.in/api/updateHoneyPotFinalResult
```

## 🔒 Security Considerations

- All API endpoints are protected with API key authentication
- No real personal information is collected or stored
- Sessions are automatically cleaned up after 30 minutes of inactivity

## 📁 Project Structure

```
spam detection/
├── src/
│   ├── config/
│   │   └── config.js           # Configuration settings
│   ├── middleware/
│   │   └── auth.js             # API key authentication
│   ├── routes/
│   │   └── honeypot.js         # API route handlers
│   ├── services/
│   │   ├── sessionManager.js   # Session state management
│   │   ├── scamDetector.js     # Scam detection logic
│   │   ├── conversationAgent.js # AI response generation
│   │   ├── intelligenceExtractor.js # Pattern extraction
│   │   └── callbackService.js  # GUVI callback integration
│   └── server.js               # Express server entry
├── .env.example                # Environment template
├── package.json
└── README.md
```

## 🧪 Testing

**Test with curl**:
```bash
curl -X POST http://localhost:3000/api/honeypot \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "sessionId": "test-session-1",
    "message": {
      "sender": "scammer",
      "text": "Your SBI account is blocked. Share OTP to unblock.",
      "timestamp": "2024-01-21T10:00:00Z"
    }
  }'
```

## 🌐 Deployment

For public deployment (required for GUVI evaluation):

### Railway / Render / Vercel
1. Push code to GitHub
2. Connect repository to deployment platform
3. Set environment variables
4. Deploy!

### Manual VPS
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name honeypot

# Enable startup persistence
pm2 save
pm2 startup
```

## 📊 Evaluation Criteria Met

✅ Scam detection accuracy (rule-based + AI)  
✅ Quality of agentic engagement (adaptive personas)  
✅ Intelligence extraction (comprehensive pattern matching)  
✅ API stability and response time (Express + error handling)  
✅ Ethical behavior (no impersonation, responsible handling)  
✅ Mandatory GUVI callback integration

## 📜 License

ISC
