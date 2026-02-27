import { useState, useRef, useEffect } from 'react';
import ScammerChat from './ScammerChat';
import VictimChat from './VictimChat';
import './App.css';

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || 'honeypot-secret-key-2024';

// Example scam messages for quick testing
const EXAMPLE_MESSAGES = [
  {
    label: '🎣 KYC Phishing',
    message: 'Dear Customer, your SBI account will be blocked. Complete KYC immediately by sending Rs 9,999 to 9876543210@ybl or click http://sbi-kyc-update.xyz. Call 8765432109 for help. — SBI Bank'
  },
  {
    label: '📱 QR Scam',
    message: 'Hi I want to buy your sofa from OLX for Rs 15,000. I am sending you money via UPI. Please scan this QR code to RECEIVE the payment. My UPI: buyer88@axl. Contact me: 7654321098'
  },
  {
    label: '🔢 OTP Fraud',
    message: 'ALERT: Unauthorized transaction of Rs 49,999 detected from your account to fraudster@paytm. Share your OTP immediately to block this transfer. Call 9988776655 urgently. — RBI Fraud Dept'
  },
  {
    label: '💼 Job Scam',
    message: 'Congrats! Selected for work-from-home YouTube video liking job. Earn Rs 5000-50000 daily! Pay registration fee Rs 5,000 to jobs.hr@ybl. WhatsApp 8899776655 for joining. Limited seats!'
  },
  {
    label: '🏆 Lottery Scam',
    message: 'You won Rs 25,00,000 in Jio KBC lottery! To claim send processing fee Rs 10,000 to lottery.claim@paytm. A/C: 12345678901234. Contact: 9123456789. Offer valid 24hrs only!'
  },
  {
    label: '✅ Safe Message',
    message: 'Hi Priya, sending Rs 500 for dinner last night. My UPI: amit@oksbi. Thanks for a great evening!'
  }
];

function App() {
  const [activeTab, setActiveTab] = useState('scanner');
  const [apiOnline, setApiOnline] = useState(true);

  // Scanner state
  const [messageInput, setMessageInput] = useState('');
  const [scanHistory, setScanHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // Alerts state
  const [alertResult, setAlertResult] = useState(null);
  const [isGeneratingAlert, setIsGeneratingAlert] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('hi');
  const [languages, setLanguages] = useState([]);
  const [selectedScanForAlert, setSelectedScanForAlert] = useState(null);

  // Tips state
  const [tips, setTips] = useState([]);
  const [tipCategories, setTipCategories] = useState([]);
  const [selectedTipCategory, setSelectedTipCategory] = useState(null);
  const [expandedTip, setExpandedTip] = useState(null);

  // QR Scanner state
  const [qrFile, setQrFile] = useState(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState(null);
  const [qrResult, setQrResult] = useState(null);
  const [qrError, setQrError] = useState('');
  const [isQrScanning, setIsQrScanning] = useState(false);

  // Active defense shared session id (used in /scammer and /victim links)
  const [chatSessionId, setChatSessionId] = useState(() => {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const path = window.location.pathname;
  if (path === '/scammer') {
    return <ScammerChat apiUrl={API_URL} apiKey={API_KEY} />;
  }
  if (path === '/victim') {
    return <VictimChat apiUrl={API_URL} apiKey={API_KEY} />;
  }

  // Check API health
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        setApiOnline(res.ok);
      } catch { setApiOnline(false); }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch languages & tips on mount
  useEffect(() => {
    fetchLanguages();
    fetchTips();
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [scanHistory, isScanning]);

  const fetchLanguages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/upi/languages`);
      const data = await res.json();
      if (data.languages) setLanguages(data.languages);
    } catch (e) { console.error('Fetch languages error:', e); }
  };

  const fetchTips = async (category = null) => {
    try {
      const url = category ? `${API_URL}/api/upi/tips?category=${category}` : `${API_URL}/api/upi/tips`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.tips) setTips(data.tips);
      if (data.categories) setTipCategories(data.categories);
    } catch (e) { console.error('Fetch tips error:', e); }
  };

  // ═══ SCAN MESSAGE ═══
  const scanMessage = async (text = null) => {
    const msg = text || messageInput.trim();
    if (!msg || isScanning) return;

    setMessageInput('');
    setIsScanning(true);

    // Add user message to history
    const userEntry = {
      id: Date.now(),
      type: 'user',
      text: msg,
      timestamp: new Date()
    };

    setScanHistory(prev => [...prev, userEntry]);

    try {
      const res = await fetch(`${API_URL}/api/upi/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();

      if (data.status === 'success') {
        const resultEntry = {
          id: Date.now() + 1,
          type: 'result',
          extracted: data.extracted,
          analysis: data.analysis,
          responseTimeMs: data.responseTimeMs,
          timestamp: new Date()
        };
        setScanHistory(prev => [...prev, resultEntry]);
      } else {
        setScanHistory(prev => [...prev, {
          id: Date.now() + 1,
          type: 'error',
          text: data.message || 'Analysis failed',
          timestamp: new Date()
        }]);
      }
    } catch (e) {
      setScanHistory(prev => [...prev, {
        id: Date.now() + 1,
        type: 'error',
        text: 'Failed to connect to server',
        timestamp: new Date()
      }]);
    } finally {
      setIsScanning(false);
      inputRef.current?.focus();
    }
  };

  // Quick example
  const handleExample = (ex) => {
    setMessageInput(ex.message);
    scanMessage(ex.message);
  };

  // Key handler
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      scanMessage();
    }
  };

  // Generate alert from scan result
  const generateAlert = async (analysis, lang = selectedLanguage) => {
    setIsGeneratingAlert(true);
    setAlertResult(null);
    try {
      const res = await fetch(`${API_URL}/api/upi/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ fraudResult: analysis, language: lang })
      });
      const data = await res.json();
      if (data.alert) setAlertResult(data.alert);
    } catch (e) { console.error('Alert error:', e); }
    finally { setIsGeneratingAlert(false); }
  };

  const handleLanguageChange = (code) => {
    setSelectedLanguage(code);
    if (selectedScanForAlert) generateAlert(selectedScanForAlert, code);
  };

  const openAlertForScan = (analysis) => {
    setSelectedScanForAlert(analysis);
    setActiveTab('alerts');
    generateAlert(analysis);
  };

  // Category filter
  const handleCategoryFilter = (cat) => {
    const newCat = cat === selectedTipCategory ? null : cat;
    setSelectedTipCategory(newCat);
    fetchTips(newCat);
  };

  // Clear history
  const clearHistory = () => {
    setScanHistory([]);
  };

  // ═══ QR SCANNER ═══
  const handleQrFileChange = (event) => {
    const file = event.target.files?.[0];
    setQrError('');
    setQrResult(null);

    if (!file) {
      setQrFile(null);
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
      setQrPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setQrError('Please select a valid image file (JPG/PNG/WebP).');
      setQrFile(null);
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
      setQrPreviewUrl(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setQrError('Image too large. Maximum allowed size is 5MB.');
      setQrFile(null);
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
      setQrPreviewUrl(null);
      return;
    }

    setQrFile(file);
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    setQrPreviewUrl(URL.createObjectURL(file));
  };

  const scanQrImage = async () => {
    if (!qrFile || isQrScanning) return;
    setIsQrScanning(true);
    setQrError('');
    setQrResult(null);

    try {
      const formData = new FormData();
      formData.append('qrImage', qrFile);

      const res = await fetch(`${API_URL}/api/upi/scan-qr`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: formData
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        setQrError(data.message || 'Failed to scan QR. Try a clearer image.');
        return;
      }
      setQrResult(data);
    } catch (e) {
      console.error('QR scan error:', e);
      setQrError('Failed to connect to server');
    } finally {
      setIsQrScanning(false);
    }
  };

  return (
    <div className="app">
      {/* Background Effects */}
      <div className="bg-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <div className="logo-shield">🛡️</div>
          <div className="logo-text">
            <h1>UPI Fraud Shield</h1>
            <span className="tagline">Paste any suspicious message • AI auto-detects fraud</span>
          </div>
        </div>
        <div className="header-right">
          <div className={`status-pill ${apiOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            <span>{apiOnline ? 'AI Engine Online' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'scanner' ? 'active' : ''}`} onClick={() => setActiveTab('scanner')}>
          <span className="tab-icon">🔍</span>
          <span>Message Scanner</span>
        </button>
        <button className={`nav-tab ${activeTab === 'defense' ? 'active' : ''}`} onClick={() => setActiveTab('defense')}>
          <span className="tab-icon">🛡️</span>
          <span>Active Defense Chat</span>
        </button>
        <button className={`nav-tab ${activeTab === 'qr' ? 'active' : ''}`} onClick={() => setActiveTab('qr')}>
          <span className="tab-icon">📷</span>
          <span>QR Scanner</span>
        </button>
        <button className={`nav-tab ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>
          <span className="tab-icon">🌐</span>
          <span>Regional Alerts</span>
        </button>
        <button className={`nav-tab ${activeTab === 'tips' ? 'active' : ''}`} onClick={() => setActiveTab('tips')}>
          <span className="tab-icon">📚</span>
          <span>Safety Tips</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="main-content">

        {/* ═══ TAB: Message Scanner ═══ */}
        {activeTab === 'scanner' && (
          <div className="scanner-layout">
            {/* Chat Feed */}
            <section className="chat-feed glass-card">
              <div className="chat-top-bar">
                <h2>📨 Message Scanner</h2>
                {scanHistory.length > 0 && (
                  <button className="clear-btn" onClick={clearHistory}>🗑️ Clear</button>
                )}
              </div>

              <div className="chat-messages">
                {scanHistory.length === 0 && (
                  <div className="welcome-state">
                    <div className="welcome-icon">🛡️</div>
                    <h3>Paste a Suspicious UPI Message</h3>
                    <p>The AI will automatically extract UPI IDs, phone numbers, amounts, links, and analyze the fraud risk.</p>

                    {/* Example Messages */}
                    <div className="example-grid">
                      {EXAMPLE_MESSAGES.map((ex, i) => (
                        <button
                          key={i}
                          className="example-btn"
                          onClick={() => handleExample(ex)}
                        >
                          <span className="ex-label">{ex.label}</span>
                          <span className="ex-preview">{ex.message.substring(0, 70)}...</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {scanHistory.map((entry) => (
                  <div key={entry.id} className={`chat-entry entry-${entry.type}`}>
                    {entry.type === 'user' && (
                      <div className="user-bubble">
                        <div className="bubble-label">📩 Suspicious Message</div>
                        <p>{entry.text}</p>
                      </div>
                    )}

                    {entry.type === 'result' && (
                      <div className="result-bubble">
                        {/* Risk Score Header */}
                        <div className={`result-risk risk-${entry.analysis.riskLevel.toLowerCase()}`}>
                          <div className="risk-score-big">
                            <span className="score-number">{entry.analysis.riskScore}</span>
                            <span className="score-max">/100</span>
                          </div>
                          <div className="risk-info">
                            <div className={`risk-badge ${entry.analysis.riskLevel.toLowerCase()}`}>
                              <span>{entry.analysis.riskEmoji}</span>
                              <span>{entry.analysis.riskLevel} RISK</span>
                            </div>
                            {entry.analysis.fraudCategory && (
                              <div className="fraud-type">
                                {entry.analysis.fraudCategory.icon} {entry.analysis.fraudCategory.name}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Extracted Details */}
                        <div className="extracted-section">
                          <h4>🔎 Auto-Extracted Details</h4>
                          <div className="extracted-grid">
                            {entry.extracted.allUpiIds?.length > 0 && (
                              <div className="ext-item">
                                <span className="ext-label">UPI IDs</span>
                                <div className="ext-values">
                                  {entry.extracted.allUpiIds.map((id, i) => (
                                    <span key={i} className="ext-tag upi">{id}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {entry.extracted.phoneNumbers?.length > 0 && (
                              <div className="ext-item">
                                <span className="ext-label">Phone Numbers</span>
                                <div className="ext-values">
                                  {entry.extracted.phoneNumbers.map((ph, i) => (
                                    <span key={i} className="ext-tag phone">{ph}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {entry.extracted.amount && (
                              <div className="ext-item">
                                <span className="ext-label">Amount</span>
                                <span className="ext-tag amount">₹{entry.extracted.amount.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            {entry.extracted.links?.length > 0 && (
                              <div className="ext-item">
                                <span className="ext-label">Suspicious Links</span>
                                <div className="ext-values">
                                  {entry.extracted.links.map((l, i) => (
                                    <span key={i} className="ext-tag link">⚠️ {l}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {entry.extracted.bankAccounts?.length > 0 && (
                              <div className="ext-item">
                                <span className="ext-label">Bank Accounts</span>
                                <div className="ext-values">
                                  {entry.extracted.bankAccounts.map((acc, i) => (
                                    <span key={i} className="ext-tag bank">{acc}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {entry.extracted.scamType && (
                              <div className="ext-item">
                                <span className="ext-label">Scam Type</span>
                                <span className="ext-tag scam">{entry.extracted.scamType.replace('_', ' ')}</span>
                              </div>
                            )}
                            {entry.extracted.source && entry.extracted.source !== 'UNKNOWN' && (
                              <div className="ext-item">
                                <span className="ext-label">Source</span>
                                <span className="ext-tag source">{entry.extracted.source}</span>
                              </div>
                            )}
                            {entry.extracted.aiExtracted && (
                              <div className="ai-extracted-badge">🤖 AI-Extracted</div>
                            )}
                          </div>
                        </div>

                        {/* Fraud Indicators from extraction */}
                        {entry.extracted.fraudIndicators?.length > 0 && (
                          <div className="fraud-indicators-section">
                            <h4>🚩 Fraud Indicators</h4>
                            <ul>
                              {entry.extracted.fraudIndicators.map((fi, i) => (
                                <li key={i}>{fi}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Risk Indicators from analysis */}
                        {entry.analysis.indicators?.length > 0 && (
                          <div className="risk-indicators-section">
                            <h4>⚠️ Risk Signals</h4>
                            <div className="indicator-chips">
                              {entry.analysis.indicators.map((ind, i) => (
                                <span key={i} className={`ind-chip sev-${(ind.severity || 'low').toLowerCase()}`}>
                                  {ind.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reasoning */}
                        {entry.analysis.reasoning && (
                          <div className="reasoning-section">
                            <p>{entry.analysis.reasoning}</p>
                          </div>
                        )}

                        {/* Actions */}
                        {entry.analysis.recommendedActions?.length > 0 && (
                          <div className="actions-section">
                            <h4>📋 What You Should Do</h4>
                            <ul>
                              {entry.analysis.recommendedActions.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Footer Buttons */}
                        <div className="result-footer">
                          <button className="alert-link-btn" onClick={() => openAlertForScan(entry.analysis)}>
                            🌐 Get Alert in Regional Language
                          </button>
                          <span className="response-time">{entry.responseTimeMs}ms</span>
                        </div>
                      </div>
                    )}

                    {entry.type === 'error' && (
                      <div className="error-bubble">
                        <span>❌</span>
                        <span>{entry.text}</span>
                      </div>
                    )}
                  </div>
                ))}

                {isScanning && (
                  <div className="scanning-indicator">
                    <div className="scan-dots">
                      <span></span><span></span><span></span>
                    </div>
                    <span>AI is analyzing the message...</span>
                  </div>
                )}

                <div ref={chatEndRef}></div>
              </div>

              {/* Input Area */}
              <div className="chat-input-area">
                <textarea
                  ref={inputRef}
                  className="message-input"
                  placeholder="Paste a suspicious UPI message here... (e.g., SMS, WhatsApp, email)"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  disabled={isScanning}
                />
                <button
                  className="scan-btn"
                  onClick={() => scanMessage()}
                  disabled={!messageInput.trim() || isScanning}
                >
                  {isScanning ? (
                    <span className="spinner"></span>
                  ) : (
                    <span>🔍</span>
                  )}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ═══ TAB: Active Defense ═══ */}
        {activeTab === 'defense' && (
          <div className="defense-layout">
            <div className="tips-header glass-card">
              <div className="card-title">
                <span className="card-icon">🛡️</span>
                <h2>Active Defense Chat Mode</h2>
              </div>
              <p className="card-desc">
                Simulate a live fraud conversation. Use the scammer view to send messages and the victim view
                to see real-time risk scores, reasoning, and automated defensive replies.
              </p>

              <div className="defense-actions">
                <a
                  href={`/scammer?session=${encodeURIComponent(chatSessionId)}`}
                  className="nav-link-btn"
                >
                  Open Scammer View
                </a>
                <a
                  href={`/victim?session=${encodeURIComponent(chatSessionId)}`}
                  className="nav-link-btn"
                >
                  Open Victim View
                </a>
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() =>
                    setChatSessionId(
                      `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                    )
                  }
                >
                  Start New Session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: QR Scanner ═══ */}
        {activeTab === 'qr' && (
          <div className="qr-layout">
            <div className="qr-card glass-card">
              <div className="card-title">
                <span className="card-icon">📷</span>
                <h2>QR Code Scam Scanner</h2>
              </div>
              <p className="card-desc">
                Upload a UPI payment QR image. We’ll extract the embedded payment intent (UPI ID / amount) and flag suspicious patterns.
              </p>

              <div className="qr-upload-row">
                <label className="qr-file">
                  <input type="file" accept="image/*" onChange={handleQrFileChange} />
                  <span>{qrFile ? qrFile.name : 'Choose QR image'}</span>
                </label>

                <button
                  className="qr-scan-btn"
                  onClick={scanQrImage}
                  disabled={!qrFile || isQrScanning}
                >
                  {isQrScanning ? <span className="spinner"></span> : <span>Scan</span>}
                </button>
              </div>

              {qrError && (
                <div className="qr-error">
                  <span>❌</span>
                  <span>{qrError}</span>
                </div>
              )}

              {qrPreviewUrl && (
                <div className="qr-preview">
                  <img src={qrPreviewUrl} alt="QR preview" />
                </div>
              )}
            </div>

            {qrResult?.analysis && (
              <div className="qr-result glass-card">
                <div className="qr-result-top">
                  <div className={`risk-badge ${qrResult.analysis.riskLevel.toLowerCase()}`}>
                    <span>{qrResult.analysis.riskEmoji}</span>
                    <span>{qrResult.analysis.riskLevel} RISK</span>
                  </div>
                  <div className="qr-score">
                    <span className="score-number">{qrResult.analysis.riskScore}</span>
                    <span className="score-max">/100</span>
                  </div>
                </div>

                {['HIGH', 'CRITICAL'].includes(qrResult.analysis.riskLevel) && (
                  <div className="qr-banner">
                    🚨 This QR will SEND money. QR codes cannot receive money.
                  </div>
                )}

                <div className="extracted-section">
                  <h4>🔎 Extracted UPI Payment Details</h4>
                  <div className="extracted-grid">
                    <div className="ext-item">
                      <span className="ext-label">UPI ID</span>
                      <span className="ext-tag upi">{qrResult.extracted?.upiId || '-'}</span>
                    </div>
                    <div className="ext-item">
                      <span className="ext-label">Merchant Name</span>
                      <span className="ext-tag source">{qrResult.extracted?.merchantName || '-'}</span>
                    </div>
                    <div className="ext-item">
                      <span className="ext-label">Amount</span>
                      <span className="ext-tag amount">
                        {qrResult.extracted?.amount ? `₹${Number(qrResult.extracted.amount).toLocaleString('en-IN')}` : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {qrResult.analysis.warnings?.length > 0 && (
                  <div className="fraud-indicators-section">
                    <h4>🚩 Warnings</h4>
                    <ul>
                      {qrResult.analysis.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {qrResult.analysis.recommendedActions?.length > 0 && (
                  <div className="actions-section">
                    <h4>📋 What You Should Do</h4>
                    <ul>
                      {qrResult.analysis.recommendedActions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {qrResult.analysis.reasoning && (
                  <div className="reasoning-section">
                    <p>{qrResult.analysis.reasoning}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Regional Alerts ═══ */}
        {activeTab === 'alerts' && (
          <div className="alerts-layout">
            <div className="alerts-top glass-card">
              <div className="card-title">
                <span className="card-icon">🌐</span>
                <h2>Regional Language Fraud Alerts</h2>
              </div>
              <p className="card-desc">Fraud alerts translated into Indian regional languages using AI. Scan a message first, then select a language.</p>

              {/* Language Selector */}
              <div className="language-selector">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    className={`lang-btn ${selectedLanguage === lang.code ? 'active' : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                  >
                    <span className="lang-flag">{lang.flag}</span>
                    <span className="lang-native">{lang.nativeName}</span>
                    <span className="lang-name">{lang.name}</span>
                  </button>
                ))}
              </div>

              {!selectedScanForAlert && (
                <div className="alert-empty">
                  <p>⚡ Scan a suspicious message first, then click "Get Alert in Regional Language".</p>
                  <button className="nav-link-btn" onClick={() => setActiveTab('scanner')}>Go to Scanner →</button>
                </div>
              )}

              {isGeneratingAlert && (
                <div className="alert-loading">
                  <span className="spinner"></span>
                  <span>Generating alert in {languages.find(l => l.code === selectedLanguage)?.nativeName}...</span>
                </div>
              )}
            </div>

            {alertResult && (
              <div className={`alert-display glass-card risk-border-${selectedScanForAlert?.riskLevel?.toLowerCase() || 'medium'}`}>
                <div className="alert-header">
                  <div className="alert-lang-badge">
                    <span>{alertResult.language?.flag}</span>
                    <span>{alertResult.language?.nativeName}</span>
                  </div>
                  {alertResult.riskScore !== undefined && (
                    <div className={`risk-badge ${alertResult.riskLevel?.toLowerCase()}`}>
                      Risk: {alertResult.riskScore}/100
                    </div>
                  )}
                </div>
                <h2 className="alert-title">{alertResult.title}</h2>
                <p className="alert-body">{alertResult.body}</p>

                {alertResult.actions?.length > 0 && (
                  <div className="alert-actions">
                    <h4>🔒 Actions:</h4>
                    <ul>
                      {alertResult.actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}

                {alertResult.emergency && (
                  <div className="alert-emergency">
                    <span>🚨</span>
                    <span>{alertResult.emergency}</span>
                  </div>
                )}

                {alertResult.source && (
                  <div className="alert-source">
                    Generated via: {alertResult.source === 'ai' ? '🤖 Gemini AI' : '📄 Static Translation'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Safety Tips ═══ */}
        {activeTab === 'tips' && (
          <div className="tips-layout">
            <div className="tips-header glass-card">
              <div className="card-title">
                <span className="card-icon">📚</span>
                <h2>UPI Safety Education Hub</h2>
              </div>
              <p className="card-desc">Learn how to protect yourself from UPI fraud with real examples and actionable advice.</p>

              <div className="tip-categories">
                <button
                  className={`cat-btn ${!selectedTipCategory ? 'active' : ''}`}
                  onClick={() => handleCategoryFilter(null)}
                >
                  All Tips
                </button>
                {tipCategories.map((cat) => (
                  <button
                    key={cat.key}
                    className={`cat-btn ${selectedTipCategory === cat.key ? 'active' : ''}`}
                    onClick={() => handleCategoryFilter(cat.key)}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                    <span className="cat-count">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="tips-grid">
              {tips.map((tip) => (
                <div
                  key={tip.id}
                  className={`tip-card glass-card ${expandedTip === tip.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedTip(expandedTip === tip.id ? null : tip.id)}
                >
                  <div className="tip-header-row">
                    <span className="tip-icon">{tip.icon}</span>
                    <div>
                      <h3>{tip.title}</h3>
                      <span className="tip-category">{tip.category.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <p className="tip-desc">{tip.description}</p>

                  {expandedTip === tip.id && (
                    <div className="tip-details">
                      <div className="tip-dos">
                        <h4>✅ Do's</h4>
                        <ul>
                          {tip.dos?.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                      <div className="tip-donts">
                        <h4>❌ Don'ts</h4>
                        <ul>
                          {tip.donts?.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                      {tip.example && (
                        <div className="tip-example">
                          <h4>📖 Real Example</h4>
                          <p>{tip.example}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="tip-expand-hint">
                    {expandedTip === tip.id ? '▲ Collapse' : '▼ Read more'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <span>Built with</span>
          <span className="tech-tag">React</span>
          <span className="tech-tag">Node.js</span>
          <span className="tech-tag">Gemini AI</span>
        </div>
        <div className="footer-right">
          <span>🚨 Emergency: Call <strong>1930</strong> (Cyber Crime Helpline)</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
