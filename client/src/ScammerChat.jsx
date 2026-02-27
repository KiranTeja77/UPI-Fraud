import { useState, useEffect } from 'react';
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

function ScammerChat({ apiUrl, apiKey }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const fetchSession = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/chat/session/${SESSION_ID}`, {
        headers: { 'x-api-key': apiKey }
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') return;
      setMessages((data.messages || []).map((m, idx) => ({ id: idx, sender: m.sender, text: m.text })));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [apiUrl, apiKey]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setError('');
    setIsSending(true);

    try {
      const res = await fetch(`${apiUrl}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          scammerId: 'demo-scammer-001',
          victimId: 'demo-victim-001',
          text
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        setError(data.message || 'Failed to send message');
        return;
      }
      await fetchSession();
    } catch (e) {
      setError('Failed to reach server');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-shield">🛡️</div>
          <div className="logo-text">
            <h1>Active Defense Chat — Scammer View</h1>
            <span className="tagline">Scammer sends messages • Sees victim replies when safe, bot replies when risky</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="scanner-layout">
          <section className="chat-feed glass-card">
            <div className="chat-top-bar">
              <h2>🟥 Scammer Conversation</h2>
            </div>
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="welcome-state">
                  <div className="welcome-icon">🎭</div>
                  <h3>Start a Scam Message</h3>
                  <p>This view represents what the scammer sees. They never see risk scores or alerts.</p>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className="chat-entry">
                  {m.sender === 'scammer' ? (
                    <div className="user-bubble">
                      <div className="bubble-label">🟥 You</div>
                      <p>{m.text}</p>
                    </div>
                  ) : m.sender === 'victim' ? (
                    <div className="result-bubble">
                      <div className="reasoning-section">
                        <p><strong>🟦 Victim:</strong> {m.text}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="result-bubble">
                      <div className="reasoning-section">
                        <p><strong>🤖 Reply:</strong> {m.text}</p>
                      </div>
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

            <div className="chat-input-area">
              <textarea
                className="message-input"
                placeholder="Type a scam message as the attacker..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={isSending}
              />
              <button
                className="scan-btn"
                onClick={sendMessage}
                disabled={!input.trim() || isSending}
              >
                {isSending ? <span className="spinner"></span> : <span>Send</span>}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default ScammerChat;

