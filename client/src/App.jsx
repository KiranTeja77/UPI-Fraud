import { useState, useRef, useEffect } from 'react';
import './App.css';

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || 'honeypot-secret-key-2024';

// Quick message templates
const QUICK_MESSAGES = [
  { label: '🏦 Bank Fraud', message: 'Your SBI account will be blocked today. Share OTP immediately to verify.' },
  { label: '🎰 Lottery Scam', message: 'Congratulations! You won Rs. 50 Lakhs lottery. Pay Rs. 5000 processing fee. UPI: winner@paytm' },
  { label: '📋 KYC Scam', message: 'This is RBI calling. Your KYC is expired. Update now at http://rbi-kyc.xyz or face legal action.' },
  { label: '💳 UPI Fraud', message: 'Dear customer, your UPI ID is being misused. Share PIN to block. Contact: +919876543210' },
];

function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(generateSessionId());
  const [stats, setStats] = useState({ scamsDetected: 0, totalMessages: 0 });
  const [detection, setDetection] = useState({ confidence: 0, status: 'waiting', scamType: '-' });
  const [intelligence, setIntelligence] = useState({
    phoneNumbers: [],
    bankAccounts: [],
    upiIds: [],
    phishingLinks: [],
    suspiciousKeywords: [],
  });
  const [agentNotes, setAgentNotes] = useState([]);
  const [callbackSent, setCallbackSent] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);

  const chatContainerRef = useRef(null);

  // Generate unique session ID
  function generateSessionId() {
    return 'session-' + Math.random().toString(36).substring(2, 11);
  }

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Check API status
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        setApiOnline(res.ok);
      } catch {
        setApiOnline(false);
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 30000);
    return () => clearInterval(interval);
  }, []);

  // Send message to API
  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    const timestamp = new Date().toISOString();
    const scammerMessage = {
      sender: 'scammer',
      text: messageText,
      timestamp,
    };

    // Add scammer message to UI
    setMessages(prev => [...prev, scammerMessage]);
    setInputText('');
    setIsLoading(true);
    setStats(prev => ({ ...prev, totalMessages: prev.totalMessages + 1 }));

    try {
      // Build conversation history
      const conversationHistory = messages.map(m => ({
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
      }));

      const response = await fetch(`${API_URL}/api/honeypot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          sessionId,
          message: scammerMessage,
          conversationHistory,
          metadata: {
            channel: 'Web Demo',
            language: 'English',
            locale: 'IN',
          },
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        // Add agent response
        const agentMessage = {
          sender: 'user',
          text: data.reply,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, agentMessage]);
        setStats(prev => ({ ...prev, totalMessages: prev.totalMessages + 1 }));

        // Update detection info
        if (data.debug) {
          const confidence = data.debug.confidence || 0;
          setDetection({
            confidence: Math.round(confidence * 100),
            status: confidence >= 0.6 ? 'scam' : confidence >= 0.4 ? 'suspicious' : 'safe',
            scamType: data.debug.scamDetected ? 'Financial Fraud Detected' : 'Analyzing...',
          });

          if (data.debug.scamDetected) {
            setStats(prev => ({ ...prev, scamsDetected: 1 }));
          }

          if (data.debug.callbackSent) {
            setCallbackSent(true);
          }
        }

        // Fetch session for intelligence
        fetchSessionData();
      }
    } catch (error) {
      console.error('API Error:', error);
      setApiOnline(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch session data for intelligence
  const fetchSessionData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/honeypot/session/${sessionId}`, {
        headers: { 'x-api-key': API_KEY },
      });
      const data = await response.json();

      if (data.session) {
        const intel = data.session.extractedIntelligence || {};
        setIntelligence({
          phoneNumbers: intel.phoneNumbers || [],
          bankAccounts: intel.bankAccounts || [],
          upiIds: intel.upiIds || [],
          phishingLinks: intel.phishingLinks || [],
          suspiciousKeywords: intel.suspiciousKeywords || [],
        });

        if (data.session.agentNotes) {
          setAgentNotes(Array.isArray(data.session.agentNotes)
            ? data.session.agentNotes
            : [data.session.agentNotes]);
        }
      }
    } catch (error) {
      console.error('Fetch session error:', error);
    }
  };

  // Handle new session
  const handleNewSession = () => {
    setSessionId(generateSessionId());
    setMessages([]);
    setDetection({ confidence: 0, status: 'waiting', scamType: '-' });
    setIntelligence({
      phoneNumbers: [],
      bankAccounts: [],
      upiIds: [],
      phishingLinks: [],
      suspiciousKeywords: [],
    });
    setAgentNotes([]);
    setCallbackSent(false);
    setStats({ scamsDetected: 0, totalMessages: 0 });
  };

  // Clear intelligence
  const handleClearIntel = () => {
    setIntelligence({
      phoneNumbers: [],
      bankAccounts: [],
      upiIds: [],
      phishingLinks: [],
      suspiciousKeywords: [],
    });
  };

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  return (
    <div className="app">
      {/* Animated Background */}
      <div className="bg-grid"></div>
      <div className="bg-glow"></div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">🍯</span>
          <div className="logo-text">
            <h1>Agentic Honey-Pot</h1>
            <span className="tagline">AI-Powered Scam Detection & Intelligence Extraction</span>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-badge">
            <span className="stat-icon">🛡️</span>
            <span>{stats.scamsDetected}</span>
            <span className="stat-label">Scams Detected</span>
          </div>
          <div className="stat-badge">
            <span className="stat-icon">💬</span>
            <span>{stats.totalMessages}</span>
            <span className="stat-label">Messages</span>
          </div>
          <div className={`stat-badge status-badge ${!apiOnline ? 'offline' : ''}`}>
            <span className="status-dot"></span>
            <span>{apiOnline ? 'API Online' : 'API Offline'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Chat Panel */}
        <section className="chat-panel">
          <div className="panel-header">
            <h2>💬 Conversation Simulator</h2>
            <p>Test the honeypot with simulated scam messages</p>
          </div>

          {/* Chat Messages */}
          <div className="chat-container" ref={chatContainerRef}>
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <div className="welcome-icon">🎭</div>
                <h3>Simulate a Scam Conversation</h3>
                <p>Send a message as a "scammer" and watch the AI agent respond with a believable persona while extracting intelligence.</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`message ${msg.sender}`}>
                  <div className="message-bubble">
                    <div className="message-sender">
                      {msg.sender === 'scammer' ? '🦹 You (Scammer)' : '🤖 AI Agent (Victim)'}
                    </div>
                    <div className="message-text">{msg.text}</div>
                    <div className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="typing-indicator">
                <span>AI Agent is typing</span>
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="chat-input-area">
            <div className="quick-messages">
              <span className="quick-label">Quick examples:</span>
              {QUICK_MESSAGES.map((qm, index) => (
                <button
                  key={index}
                  className="quick-btn"
                  onClick={() => sendMessage(qm.message)}
                  disabled={isLoading}
                >
                  {qm.label}
                </button>
              ))}
            </div>
            <div className="input-wrapper">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a scam message to test..."
                disabled={isLoading}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage(inputText)}
                disabled={isLoading || !inputText.trim()}
              >
                <span>Send</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* Intelligence Dashboard */}
        <section className="intel-panel">
          {/* Detection Card */}
          <div className="detection-card">
            <div className="card-header">
              <h3>🎯 Scam Detection</h3>
              <span className={`detection-status ${detection.status}`}>
                {detection.status === 'scam' ? '⚠️ SCAM' :
                  detection.status === 'suspicious' ? '🔍 Suspicious' :
                    detection.status === 'safe' ? '✅ Safe' : '⏳ Waiting'}
              </span>
            </div>
            <div className="confidence-meter">
              <div className="meter-track">
                <div
                  className={`meter-fill ${detection.confidence > 60 ? 'danger' : ''}`}
                  style={{ width: `${detection.confidence}%` }}
                ></div>
              </div>
              <div className="meter-labels">
                <span>0%</span>
                <span>Safe</span>
                <span>Suspicious</span>
                <span>Scam</span>
                <span>100%</span>
              </div>
            </div>
            <div className="scam-type">{detection.scamType}</div>
          </div>

          {/* Intelligence Card */}
          <div className="intel-card">
            <div className="card-header">
              <h3>🔍 Extracted Intelligence</h3>
              <button className="clear-btn" onClick={handleClearIntel}>Clear</button>
            </div>
            <div className="intel-grid">
              <div className="intel-item">
                <div className="intel-icon">📱</div>
                <div className="intel-label">Phone Numbers</div>
                <div className="intel-values">
                  {intelligence.phoneNumbers.length > 0
                    ? intelligence.phoneNumbers.join(', ')
                    : '-'}
                </div>
              </div>
              <div className="intel-item">
                <div className="intel-icon">🏦</div>
                <div className="intel-label">Bank Accounts</div>
                <div className="intel-values">
                  {intelligence.bankAccounts.length > 0
                    ? intelligence.bankAccounts.join(', ')
                    : '-'}
                </div>
              </div>
              <div className="intel-item">
                <div className="intel-icon">💳</div>
                <div className="intel-label">UPI IDs</div>
                <div className="intel-values">
                  {intelligence.upiIds.length > 0
                    ? intelligence.upiIds.join(', ')
                    : '-'}
                </div>
              </div>
              <div className="intel-item">
                <div className="intel-icon">🔗</div>
                <div className="intel-label">Phishing Links</div>
                <div className="intel-values">
                  {intelligence.phishingLinks.length > 0
                    ? intelligence.phishingLinks.join(', ')
                    : '-'}
                </div>
              </div>
              <div className="intel-item full-width">
                <div className="intel-icon">⚠️</div>
                <div className="intel-label">Suspicious Keywords</div>
                <div className="intel-tags">
                  {intelligence.suspiciousKeywords.length > 0
                    ? intelligence.suspiciousKeywords.map((kw, i) => (
                      <span key={i} className="intel-tag">{kw}</span>
                    ))
                    : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Agent Notes */}
          <div className="notes-card">
            <div className="card-header">
              <h3>🤖 Agent Notes</h3>
            </div>
            <div className="notes-list">
              {agentNotes.length > 0 ? (
                agentNotes.map((note, index) => (
                  <div key={index} className="note-item">{note}</div>
                ))
              ) : (
                <div className="note-empty">Agent observations will appear here...</div>
              )}
            </div>
          </div>

          {/* Session Card */}
          <div className="session-card">
            <div className="card-header">
              <h3>📊 Session Info</h3>
              <button className="new-session-btn" onClick={handleNewSession}>
                New Session
              </button>
            </div>
            <div className="session-details">
              <div className="session-item">
                <span>Session ID:</span>
                <code>{sessionId.substring(0, 16)}...</code>
              </div>
              <div className="session-item">
                <span>Messages:</span>
                <strong>{messages.length}</strong>
              </div>
              <div className="session-item">
                <span>Callback Status:</span>
                <span className={`callback-status ${callbackSent ? 'sent' : 'pending'}`}>
                  {callbackSent ? '✅ Sent' : '⏳ Pending'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="tech-stack">
          <span>Built with</span>
          <span className="tech-tag">React</span>
          <span className="tech-tag">Node.js</span>
          <span className="tech-tag">Perplexity AI</span>
        </div>
        <div className="footer-links">
          <span>GUVI Hackathon 2026</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
