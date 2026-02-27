import { useEffect, useState } from 'react';
import './App.css';

function getSessionIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('session');
    if (fromUrl && typeof fromUrl === 'string' && fromUrl.trim()) {
      return fromUrl.trim();
    }
  } catch {
    // ignore and fall back
  }
  return 'demo-session-001';
}

const SESSION_ID = getSessionIdFromUrl();

function VictimChat({ apiUrl, apiKey }) {
  const [messages, setMessages] = useState([]);
  const [victimInput, setVictimInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isScamConfirmed, setIsScamConfirmed] = useState(false);
  const [sessionRisk, setSessionRisk] = useState(null);
  const [error, setError] = useState('');

  const fetchSession = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/chat/session/${SESSION_ID}`, {
        headers: { 'x-api-key': apiKey }
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        setError(data.message || 'Failed to fetch session');
        return;
      }
      const nextMessages = (data.messages || []).map((m, idx) => ({
        id: idx,
        type: m.sender,
        text: m.text
      }));
      setMessages(nextMessages);
      setIsScamConfirmed(!!data.isScamConfirmed);
      if (data.risk && data.risk.riskScore !== undefined) {
        setSessionRisk(data.risk);
      } else {
        setSessionRisk(null);
      }
    } catch (e) {
      setError('Failed to reach server');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await fetchSession();
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiUrl, apiKey]);

  const numericRiskScore =
    sessionRisk && sessionRisk.riskScore != null
      ? Number(sessionRisk.riskScore)
      : null;

  const isHighRiskDiversion =
    sessionRisk &&
    numericRiskScore !== null &&
    Number.isFinite(numericRiskScore) &&
    numericRiskScore >= 70 &&
    sessionRisk.diverted;

  const canVictimReply = !isHighRiskDiversion;

  const handleVictimSend = async () => {
    const text = victimInput.trim();
    if (!text || !canVictimReply || isSending) return;

    setVictimInput('');
    setError('');
    setIsSending(true);

    try {
      const res = await fetch(`${apiUrl}/api/chat/victim-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ sessionId: SESSION_ID, text })
      });
      const data = await res.json();

      if (!res.ok || data.status !== 'success') {
        setError(data.message || 'Failed to send');
        setVictimInput(text);
        return;
      }
      await fetchSession();
    } catch (e) {
      setError('Failed to reach server');
      setVictimInput(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleVictimKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleVictimSend();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-shield">🛡️</div>
          <div className="logo-text">
            <h1>Active Defense Chat — Victim View</h1>
            <span className="tagline">Victim sees full risk analysis & defensive responses</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="scanner-layout">
          <section className="chat-feed glass-card">
            <div className="chat-top-bar">
              <h2>🟦 Victim Risk View</h2>
            </div>

            {sessionRisk && (
              <div className={`risk-banner ${(sessionRisk.riskLevel || 'low').toLowerCase()}`}>
                <div className="risk-header">
                  <span>{sessionRisk.riskEmoji ?? '✅'}</span>
                  <strong>{sessionRisk.riskLevel ?? 'LOW'}</strong>
                  <span>{numericRiskScore != null && Number.isFinite(numericRiskScore) ? numericRiskScore : 0}/100</span>
                </div>

                <div className="risk-category">
                  Category:{' '}
                  {typeof sessionRisk.fraudCategory === 'string'
                    ? sessionRisk.fraudCategory
                    : sessionRisk.fraudCategory?.name || 'Unknown'}
                </div>

                {sessionRisk.indicators?.length > 0 && (
                  <ul>
                    {sessionRisk.indicators.map((ind, i) => (
                      <li key={i}>{ind}</li>
                    ))}
                  </ul>
                )}

                {sessionRisk.recommendedActions?.length > 0 && (
                  <div className="risk-actions">
                    {sessionRisk.recommendedActions.map((act, i) => (
                      <div key={i}>• {act}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="welcome-state">
                  <div className="welcome-icon">🛡️</div>
                  <h3>Chat with the other user</h3>
                  <p>When their message is safe (low risk), you can reply here. If they send something suspicious, it will be blocked and redirected to the honeypot.</p>
                </div>
              )}

              {messages.map(m => (
                <div key={m.id} className="chat-entry">
                  {m.type === 'scammer' && (
                    <div className="result-bubble">
                      <div className="extracted-section">
                        <h4>🟥 Other user</h4>
                        <p className="tip-desc">{m.text}</p>
                      </div>
                    </div>
                  )}

                  {m.type === 'honeypot' && (
                    <div className="user-bubble">
                      <div className="bubble-label">🤖 Auto Defensive Reply</div>
                      <p>{m.text}</p>
                    </div>
                  )}

                  {m.type === 'victim' && (
                    <div className="user-bubble">
                      <div className="bubble-label">🟦 You (Victim)</div>
                      <p>{m.text}</p>
                    </div>
                  )}
                </div>
              ))}

              {error && (
                <div className="error-bubble">
                  <span>❌</span>
                  <span>{error}</span>
                </div>
              )}
            </div>

            {isScamConfirmed && numericRiskScore != null && Number.isFinite(numericRiskScore) && numericRiskScore >= 70 && (
              <div className="alert-display glass-card risk-border-high">
                <h2 className="alert-title">🚨 Scam Activity Detected</h2>
                <p className="alert-body">
                  This message has been classified as risky and the sender has been diverted to a honeypot.
                  Their details have been securely stored in the blacklist to protect future victims.
                </p>
              </div>
            )}

            <div className="chat-input-area">
              <textarea
                className="message-input"
                value={victimInput}
                onChange={(e) => setVictimInput(e.target.value)}
                onKeyDown={handleVictimKeyDown}
                rows={2}
                disabled={!canVictimReply}
                placeholder={
                  canVictimReply
                    ? 'Type message...'
                    : 'Blocked due to high fraud risk'
                }
              />
              <button
                className="scan-btn"
                type="button"
                onClick={handleVictimSend}
                disabled={!canVictimReply || !victimInput.trim() || isSending}
              >
                {isSending ? <span className="spinner"></span> : 'Send'}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default VictimChat;

