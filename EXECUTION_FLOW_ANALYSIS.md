# Complete Code Analysis & Pin-to-Pin Execution Flow

## 1. System Overview

**Stack:** Node.js, Express, MongoDB, React (Vite), Gemini AI (OpenAI-compatible client).

**Purpose:** UPI fraud detection with (a) one-off message/QR scanning, (b) regional alerts, (c) honeypot conversation engine, and (d) **Active Defense Chat** — a demo where Scammer UI and Victim UI share a session: scammer sends messages, backend scores risk and may divert to honeypot; victim sees messages + risk banner and can reply only when the latest message is not high-risk.

**Entry points:**
- **Server:** `src/server.js` → mounts `/api/honeypot`, `/api/upi`, `/api/chat`; loads `./db.js` (MongoDB).
- **Client:** `client/src/App.jsx` → path `/scammer` → `ScammerChat`, path `/victim` → `VictimChat`; otherwise main app (scanner, QR, alerts, tips, defense links). Session ID for scammer/victim comes from `?session=` or defaults to `demo-session-001`.

---

## 2. Architecture (No Changes)

| Layer | Role |
|-------|------|
| **Routes** | `upifraud.js`, `honeypot.js`, `activeDefenseRoutes.js` — auth, delegate to controllers |
| **Controllers** | `autoDefenseController.js` (handleChatMessage, getChatSession), `activeDefenseController.js` (handleActiveDefenseChat) |
| **Services** | messageExtractor, scamDetector, upiTransactionAnalyzer, qrDecoderService, qrAnalyzerService, honeypotService, conversationAgent, intelligenceExtractor, callbackService, regionalAlertService, sessionManager |
| **Models** | ChatSession (sessionId, scammerId, victimId, messages[], extractedDetails, lastRisk, divertedToHoneypot, isScamConfirmed), Blacklist (scammerId, upiIds[], phoneNumbers[]) |
| **Frontend** | ScammerChat (sends to `/api/chat/send`, shows honeypot reply from response), VictimChat (polls `/api/chat/session/:sessionId`, shows risk banner + messages, blocks reply only when high-risk diverted) |

---

## 3. Pin-to-Pin Execution Flows

### Flow A: Message Scanner (One-off paste)

1. **Entry:** User on main app, Message Scanner tab. Types/pastes text → clicks Scan.
2. **Frontend:** `App.jsx` `scanMessage()` → `POST /api/upi/scan` with `{ message }`, header `x-api-key`.
3. **Route:** `upifraud.js` `POST /scan` → `authenticateApiKey` → route handler.
4. **Extract:** `extractTransactionFromMessage(message)` (messageExtractor): rule-based (UPI IDs, phones, amount, bank accounts, links) + Gemini AI extraction → merged object (allUpiIds, phoneNumbers, amount, etc.).
5. **Build transaction:** `transaction` = { senderUPI, receiverUPI, amount, type, description, isNewPayee, source } from extracted.
6. **Analyze:** `analyzeTransaction(transaction)` (upiTransactionAnalyzer): rule-based patterns + Gemini → riskScore 0–100, riskLevel, indicators, recommendedActions, reasoning.
7. **Response:** `{ status, extracted, analysis, responseTimeMs }` → frontend adds to scanHistory and renders risk + extracted details.

---

### Flow B: QR Scanner

1. **Entry:** User selects image in QR tab → Scan.
2. **Frontend:** `App.jsx` `scanQrImage()` → `POST /api/upi/scan-qr` multipart, field `qrImage`, `x-api-key`.
3. **Route:** `upifraud.js` `POST /scan-qr` → multer (memory, 5MB) → handler.
4. **Decode:** `decodeQrFromBuffer(req.file.buffer)` (qrDecoderService): Jimp read image, try variants (full, crop, grayscale), qrcode-reader → raw string (e.g. `upi://pay?...`).
5. **Analyze QR:** `analyzeUpiQr(raw)` (qrAnalyzerService): parse UPI URI (pa, pn, am), rule-based QR risk, optional `analyzeTransaction` for same payload → merged risk + warnings.
6. **Response:** `{ status, extracted, analysis }` → frontend shows risk + extracted UPI/amount/merchant.

---

### Flow C: Active Defense — Scammer Sends Message (Core)

1. **Entry:** User on `/scammer` (same session as victim via `?session=...` or default). Types text → Send.
2. **Frontend:** `ScammerChat.jsx` `sendMessage()`:
   - Pushes local message `{ sender: 'scammer', text }`.
   - `POST /api/chat/send` with `{ sessionId, scammerId: 'demo-scammer-001', victimId: 'demo-victim-001', text }`, `x-api-key`.
3. **Route:** `activeDefenseRoutes.js` `POST /send` → `authenticateApiKey` → `handleChatMessage`.
4. **Controller:** `autoDefenseController.handleChatMessage`:
   - Validate sessionId, scammerId, text. Trim/slice text (MAX 4000).
   - **DB:** `ChatSession.findOne({ sessionId })` or create new with sessionId, scammerId, victimId.
   - **Extract:** `extractTransactionFromMessage(cleanText)` → upis, phones, etc.
   - **Blacklist check:** `Blacklist.findOne({ $or: [ { scammerId }, { upiIds: { $in: upis } }, { phoneNumbers: { $in: phones } } ] })`.
   - **Append message:** `session.messages.push({ sender: 'scammer', text: cleanText, deliveredToVictim: false })`.
   - **Merge extracted:** `session.extractedDetails = mergeExtracted(..., extracted)`.

5. **Branch 1 — Blacklisted or already diverted:**
   - Set `session.divertedToHoneypot = true`, `session.isScamConfirmed = true`.
   - **Run risk engine for this message** (so victim sees current risk): `detectScam`, `analyzeTransaction`, optional `analyzeUpiQr` → `mergeRiskResults` → `currentRisk`. Set `session.lastRisk = currentRisk`.
   - Mark last message `deliveredToVictim = true` (victim sees scammer text).
   - `honeypotReply = generateHoneypotReply(cleanText, sessionId)` (conversationAgent).
   - Push `{ sender: 'honeypot', text: honeypotReply, deliveredToVictim: false }`.
   - `session.save()`. Return `{ status, diverted: true, risk: currentRisk, honeypotReply }`.

6. **Branch 2 — Not blacklisted, not yet diverted:**
   - **Risk engine:** `detectScam(cleanText)`, `analyzeTransaction(txnForAnalysis)`, optional `analyzeUpiQr(cleanText)` → `mergeRiskResults` → `finalRisk`. Set `session.lastRisk = finalRisk`, `lastMessage = session.messages[session.messages.length - 1]`.
   - **If finalRisk.riskScore >= 70:**  
     Blacklist upsert (scammerId, upiIds, phoneNumbers), `divertedToHoneypot = true`, `isScamConfirmed = true`, generate honeypot reply, push honeypot message (deliveredToVictim: false), set `lastMessage.deliveredToVictim = true`. Save, return `{ status, diverted: true, risk: finalRisk, honeypotReply }`.
   - **Else if finalRisk.riskScore >= 40:**  
     `lastMessage.deliveredToVictim = true`, generate skeptical honeypot reply, push it with `deliveredToVictim: true`, `divertedToHoneypot = false`. Save, return `{ status, diverted: false, risk: finalRisk, honeypotReply }`.
   - **Else (low risk):**  
     `lastMessage.deliveredToVictim = true`. Save, return `{ status, diverted: false, risk: finalRisk, honeypotReply: null }`.

7. **Frontend (Scammer):** On success, if `data.honeypotReply` present, append `{ sender: 'honeypot', text: data.honeypotReply }` to local messages. Scammer never sees risk or diversion.

---

### Flow D: Active Defense — Victim Sees Messages & Risk (Polling)

1. **Entry:** User on `/victim` with same session query (or default). Page loads and every 2s.
2. **Frontend:** `VictimChat.jsx` `useEffect` → `GET /api/chat/session/${SESSION_ID}` with `x-api-key`.
3. **Route:** `activeDefenseRoutes.js` `GET /session/:sessionId` → `authenticateApiKey` → `getChatSession`.
4. **Controller:** `getChatSession`:
   - `ChatSession.findOne({ sessionId }).lean()`.
   - If none: return `{ status, messages: [], isScamConfirmed: false, risk: null, extractedDetails: null }`.
   - Else: `deliveredMessages = session.messages.filter(m => m.deliveredToVictim)`.
   - Return `{ status, messages: deliveredMessages.map(m => ({ sender, text, timestamp })), isScamConfirmed: !!session.isScamConfirmed, risk: session.lastRisk || null, extractedDetails: null }`.
5. **Frontend (Victim):**
   - `setMessages(data.messages)` (mapped to { id, type: 'scammer'|'honeypot', text }).
   - `setIsScamConfirmed(!!data.isScamConfirmed)`.
   - If `data.risk && data.risk.riskScore !== undefined` then `setSessionRisk(data.risk)` else `setSessionRisk(null)`.
   - **Banner:** If `sessionRisk` exists, render risk banner (always): riskLevel, riskScore/100, fraud category, indicators, recommendedActions (no extracted UPI/phones/links).
   - **Messages:** Scammer messages in result-bubble; honeypot messages as "Auto Defensive Reply" user-bubble; local victim replies from state.
   - **Scam card:** Only if `isScamConfirmed && numericRiskScore >= 70`: show "Scam Activity Detected / directed to honeypot".
   - **Reply gate:** `isHighRiskDiversion = sessionRisk && numericRiskScore >= 70 && sessionRisk.diverted`; `canVictimReply = !isHighRiskDiversion`. Textarea/button disabled when !canVictimReply; placeholder "Blocked due to high fraud risk" when blocked.

---

### Flow E: Honeypot Core (Standalone API)

1. **Entry:** External client (e.g. GUVI) or test sends `POST /api/honeypot` with `{ sessionId, message: { sender, text }, conversationHistory?, metadata? }`, `x-api-key`.
2. **Route:** `honeypot.js` `POST /` → validate sessionId, message.text.
3. **Session:** `sessionManager.getSession(sessionId)` (in-memory: conversationHistory, scamScores, extractedIntelligence, scamDetected, etc.).
4. **Append & intel:** If message.sender === 'scammer', add to session; sync conversationHistory if provided; `extractIntelligence(message.text)` → add to session.
5. **Scam detect:** `detectScam(message.text, session.conversationHistory)`; if scammer, update scamScores and scamDetected (once true, stays true).
6. **Reply:** `generateResponse(message.text, session)` (conversationAgent) → AI or persona reply; add to conversationHistory; optional agent notes and tactics.
7. **Callback:** If `sessionManager.shouldSendCallback(sessionId)` (scamDetected, enough messages), `extractFromConversation`, `prepareCallbackData`, `sendCallback` to GUVI, mark callbackSent.
8. **Response:** `{ status, reply, debug: { sessionId, scamDetected, confidence, messageCount, responseTimeMs, callbackSent } }`.

---

### Flow F: Regional Alerts

1. **Entry:** Main app, Alerts tab; user picked a scan result and language.
2. **Frontend:** `POST /api/upi/alert` with `{ fraudResult: analysis, language }`, `x-api-key`.
3. **Route:** `upifraud.js` `POST /alert` → `generateAlert(fraudResult, language)` (regionalAlertService): if Gemini + non-English, AI-generated localized JSON (title, body, actions, emergency); else static template. Return `{ status, alert }`.
4. **Frontend:** Renders alert in chosen language.

---

## 4. Key Data and Decisions

- **Session bridge:** Scammer and Victim use the same `sessionId` (from URL `?session=` or `demo-session-001`). All messages and risk for that conversation live under one `ChatSession` and one `lastRisk`.
- **Delivered vs not:** Only messages with `deliveredToVictim: true` are returned by `getChatSession`. High-risk diversion: scammer message is delivered so victim sees it; honeypot reply is not delivered to victim. Medium-risk: both scammer and honeypot reply delivered.
- **Risk is session-level:** One `lastRisk` per session, updated on every `handleChatMessage` (including in the blacklisted/diverted branch so a later safe message shows low risk and allows reply).
- **Blocking victim reply:** Only when `sessionRisk.riskScore >= 70` and `sessionRisk.diverted` (i.e. high-risk diversion). Safe or medium risk allows reply.
- **No extracted details to victim:** `getChatSession` always returns `extractedDetails: null`; victim sees only risk summary (score, level, category, indicators, actions).
- **Blacklist:** Keyed by scammerId; stores upiIds and phoneNumbers. Any later message (same or different session) matching these or scammerId is forced through the diverted branch and gets current-message risk so victim still sees correct safe/risky state.

---

## 5. File-to-Flow Quick Reference

| Flow | Entry | Route | Controller / Logic | Response |
|------|--------|--------|--------------------|----------|
| Message scan | App scanMessage | POST /api/upi/scan | upifraud: extractTransactionFromMessage → analyzeTransaction | extracted + analysis |
| QR scan | App scanQrImage | POST /api/upi/scan-qr | upifraud: decodeQrFromBuffer → analyzeUpiQr | extracted + analysis |
| Scammer send | ScammerChat sendMessage | POST /api/chat/send | autoDefenseController.handleChatMessage | status, diverted, risk, honeypotReply |
| Victim poll | VictimChat useEffect | GET /api/chat/session/:id | autoDefenseController.getChatSession | messages, isScamConfirmed, risk |
| Honeypot | External POST | POST /api/honeypot | honeypot route inline | reply, debug |
| Alert | App generateAlert | POST /api/upi/alert | regionalAlertService.generateAlert | alert |

This is the complete pin-to-pin execution flow for the current codebase.
