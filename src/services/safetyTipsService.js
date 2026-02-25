import OpenAI from 'openai';
import config from '../config/config.js';

let gemini = null;

function initializeAI() {
    if (!gemini && config.geminiApiKey) {
        gemini = new OpenAI({
            apiKey: config.geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
        });
    }
}

// ─── Safety Tips Library ───
const SAFETY_TIPS = [
    // UPI PIN Safety
    {
        id: 'pin-1',
        category: 'UPI_PIN',
        icon: '🔐',
        title: 'Never Share Your UPI PIN',
        description: 'Your UPI PIN is like your ATM PIN. No bank, app, or official will ever ask for it. If someone asks, it\'s a scam.',
        dos: ['Set a strong 4 or 6-digit PIN', 'Change your PIN regularly', 'Cover the screen when entering PIN'],
        donts: ['Share PIN on calls or messages', 'Use birthdate as PIN', 'Enter PIN on unknown apps or websites'],
        example: 'A caller claims to be from your bank and asks for your UPI PIN to "verify" your account. This is 100% a scam — hang up immediately.'
    },
    {
        id: 'pin-2',
        category: 'UPI_PIN',
        icon: '🔑',
        title: 'PIN is Only for SENDING Money',
        description: 'You only need to enter your UPI PIN when you are SENDING money. You NEVER need a PIN to receive money.',
        dos: ['Only enter PIN when you initiate a payment', 'Verify amount before entering PIN'],
        donts: ['Enter PIN when someone says they are sending you money', 'Enter PIN for "collect" requests from unknown people'],
        example: 'Someone sends you a "collect request" on PhonePe saying they want to pay you. If it asks for your PIN, it\'s actually taking money FROM you!'
    },

    // QR Code Safety
    {
        id: 'qr-1',
        category: 'QR_SCAM',
        icon: '📱',
        title: 'QR Codes Are for PAYING, Not Receiving',
        description: 'Scanning a QR code is always for making a payment. You can NEVER receive money by scanning a QR code.',
        dos: ['Only scan QR at trusted merchants', 'Verify the merchant name before paying', 'Check the amount displayed'],
        donts: ['Scan QR codes sent by strangers', 'Scan QR to "receive" money from someone', 'Trust QR codes pasted over other QR codes'],
        example: 'An OLX seller asks you to scan a QR code to "receive" your refund. Scanning it actually deducts money from your account.'
    },
    {
        id: 'qr-2',
        category: 'QR_SCAM',
        icon: '🔍',
        title: 'Verify QR Codes Before Scanning',
        description: 'Fraudsters paste fake QR codes over legitimate ones at shops, petrol pumps, and parking meters.',
        dos: ['Check if QR code looks tampered', 'Verify merchant name on payment screen', 'Ask shop owner to confirm details'],
        donts: ['Blindly scan any QR code', 'Pay without checking recipient name', 'Scan QR codes from WhatsApp/SMS links'],
        example: 'At a petrol pump, a sticker with a fake QR code is placed over the real one, redirecting your payment to a fraudster\'s account.'
    },

    // OTP Fraud
    {
        id: 'otp-1',
        category: 'OTP_FRAUD',
        icon: '🔢',
        title: 'OTP is Your Secret — Never Share It',
        description: 'One-Time Passwords (OTPs) are sent to YOUR phone for YOUR verification. Sharing OTP gives full access to your account.',
        dos: ['Read the OTP message carefully — it tells you what it\'s for', 'Delete OTP messages after use', 'Report if you receive unexpected OTPs'],
        donts: ['Share OTP on call, SMS, or WhatsApp', 'Enter OTP on links sent by strangers', 'Forward OTP messages to anyone'],
        example: 'You get a call: "Sir, ₹50,000 is being debited from your account. Share OTP to block it." This is a scam — the OTP will approve the debit, not block it.'
    },
    {
        id: 'otp-2',
        category: 'OTP_FRAUD',
        icon: '📲',
        title: 'Beware of SIM Swap Attacks',
        description: 'Fraudsters can duplicate your SIM card to receive your OTPs. If your phone suddenly loses signal for a long time, report immediately.',
        dos: ['Set up SIM PIN lock', 'Report to carrier if phone loses signal unexpectedly', 'Use app-based 2FA where possible'],
        donts: ['Share SIM details with strangers', 'Click on links asking to "upgrade" your SIM', 'Ignore prolonged loss of network signal'],
        example: 'Your phone loses network for hours. Meanwhile, someone has gotten a duplicate SIM and is using your OTPs to drain your bank account.'
    },

    // Phishing
    {
        id: 'phish-1',
        category: 'PHISHING',
        icon: '🎣',
        title: 'Don\'t Click Suspicious Links',
        description: 'Phishing links look like your bank\'s website but are fake. They steal your login credentials and personal information.',
        dos: ['Type bank URLs directly in browser', 'Use official banking apps', 'Check for HTTPS and correct domain spelling'],
        donts: ['Click links in SMS or email claiming to be from your bank', 'Enter bank details on websites from forwarded links', 'Download APK files from unknown sources'],
        example: 'SMS: "Your SBI account KYC has expired. Update now: http://sbi-kyc-update.xyz". This is a fake website that looks like SBI but steals your credentials.'
    },
    {
        id: 'phish-2',
        category: 'PHISHING',
        icon: '📧',
        title: 'Verify KYC Updates Directly with Bank',
        description: 'Banks never send links for KYC updates via SMS or WhatsApp. Always visit the bank branch or use the official app.',
        dos: ['Visit bank branch for KYC updates', 'Call the number on your bank card/passbook', 'Use official bank app for account management'],
        donts: ['Click "KYC update" links from SMS/email', 'Share Aadhaar/PAN over phone or chat', 'Trust caller ID — it can be spoofed'],
        example: 'You receive a WhatsApp message with an RBI logo asking you to update KYC within 24hrs or your account will be frozen. This is a phishing scam.'
    },

    // Vishing (Voice Phishing)
    {
        id: 'vish-1',
        category: 'VISHING',
        icon: '📞',
        title: 'Beware of Fake Customer Care Calls',
        description: 'Fraudsters impersonate bank officials, RBI officers, or tech support to extract your financial information.',
        dos: ['Hang up and call your bank on the official number', 'Verify caller identity independently', 'Report suspicious calls to your bank'],
        donts: ['Share any financial details on unsolicited calls', 'Follow instructions to install any app', 'Trust caller ID — scammers spoof numbers'],
        example: 'Call: "This is HDFC Bank. Your credit card has a suspicious charge of ₹89,000. Share your card details to cancel." Real banks never ask this way.'
    },
    {
        id: 'vish-2',
        category: 'VISHING',
        icon: '🎭',
        title: 'Government Officials Won\'t Call for Money',
        description: 'No government agency (RBI, Income Tax, Police, CBI) will call and demand immediate payment or threaten arrest.',
        dos: ['Ask for official written notice', 'Verify through official government websites', 'Report threatening calls to local police'],
        donts: ['Pay money out of fear of arrest', 'Share Aadhaar/PAN on phone', 'Transfer money to "safe accounts" as instructed by callers'],
        example: '"This is CBI calling. Your Aadhaar is linked to money laundering. Transfer ₹2 lakhs to this safe account or be arrested in 2 hours." Total scam.'
    },

    // Remote Access Scams
    {
        id: 'remote-1',
        category: 'REMOTE_ACCESS',
        icon: '💻',
        title: 'Never Install Screen-Sharing Apps on Request',
        description: 'Scammers ask you to install AnyDesk, TeamViewer, or QuickSupport to remotely control your phone and steal money.',
        dos: ['Only install apps from official stores', 'Refuse remote access requests from strangers', 'Uninstall remote apps if installed by mistake'],
        donts: ['Install AnyDesk/TeamViewer when asked by a caller', 'Share access codes of remote apps', 'Allow anyone remote control of your UPI-linked device'],
        example: '"Install AnyDesk so I can help you complete your KYC." Once installed, they see your screen, open your UPI app, and transfer money.'
    },

    // Investment Scams
    {
        id: 'invest-1',
        category: 'INVESTMENT_SCAM',
        icon: '📈',
        title: 'Too Good to Be True Returns = Scam',
        description: 'Promises of doubling money, guaranteed high returns, or crypto investment schemes are almost always fraud.',
        dos: ['Research investment platforms on SEBI website', 'Consult a licensed financial advisor', 'Start with trusted, well-known platforms'],
        donts: ['Send money for "guaranteed returns"', 'Join investment groups on WhatsApp/Telegram', 'Trust screenshots of others\' profits'],
        example: 'WhatsApp group: "Invest ₹10,000 today, get ₹50,000 in 7 days guaranteed!" First few returns may come to build trust, then they disappear with your money.'
    },

    // Job Scams
    {
        id: 'job-1',
        category: 'JOB_SCAM',
        icon: '💼',
        title: 'Real Jobs Don\'t Ask for Money',
        description: 'Legitimate employers never ask candidates to pay registration fees, processing charges, or "security deposits".',
        dos: ['Apply through official company websites', 'Verify job postings on LinkedIn/company pages', 'Research the company before applying'],
        donts: ['Pay any fee for job applications', 'Do "liking/reviewing" tasks for payment', 'Share bank details in job applications via WhatsApp'],
        example: '"Earn ₹5000/day liking YouTube videos! Part-time job from home. Join our Telegram group." After some small payments, they ask you to "invest" more.'
    },

    // General Safety
    {
        id: 'gen-1',
        category: 'GENERAL',
        icon: '🛡️',
        title: 'Enable Transaction Alerts',
        description: 'Keep SMS and email alerts enabled for all bank transactions. This helps you detect unauthorized transactions immediately.',
        dos: ['Enable SMS alerts for all transactions', 'Check bank statements weekly', 'Set daily transaction limits on UPI apps'],
        donts: ['Ignore unexpected transaction alerts', 'Disable notifications for banking apps', 'Wait to report unauthorized transactions'],
        example: 'You receive an SMS about a ₹15,000 debit you didn\'t make. Because you had alerts on, you immediately called the bank and blocked further transactions.'
    },
    {
        id: 'gen-2',
        category: 'GENERAL',
        icon: '📋',
        title: 'Know Your Rights — 48 Hour Rule',
        description: 'Under RBI guidelines, if you report unauthorized transaction within 3 working days, you have zero liability. The bank must credit your amount within 10 days.',
        dos: ['Report fraud within 3 days to bank', 'File FIR at local police station', 'Keep all evidence (screenshots, call records)'],
        donts: ['Delay reporting even by a day', 'Accept bank\'s refusal without escalating', 'Delete evidence of the fraud'],
        example: 'You lost ₹25,000 to a scam. You reported to your bank within 24 hours and filed a complaint at cybercrime.gov.in. The bank refunded the amount in 7 days.'
    },
    {
        id: 'gen-3',
        category: 'GENERAL',
        icon: '🌐',
        title: 'Report Fraud — Cyber Crime Portal',
        description: 'Government of India has a dedicated portal and helpline for reporting cyber fraud. Quick reporting increases recovery chances.',
        dos: ['Call 1930 immediately after a fraud', 'File report at cybercrime.gov.in', 'Report to your bank in parallel'],
        donts: ['Think the money is gone forever', 'Feel embarrassed to report', 'Wait more than 24 hours to take action'],
        example: 'After losing money to a phishing scam, you called 1930 within 30 minutes. The helpline was able to freeze the scammer\'s account before they withdrew your money.'
    }
];

// Category metadata
const CATEGORIES = {
    UPI_PIN: { name: 'UPI PIN Safety', icon: '🔐', color: '#3b82f6' },
    QR_SCAM: { name: 'QR Code Scams', icon: '📱', color: '#8b5cf6' },
    OTP_FRAUD: { name: 'OTP Fraud', icon: '🔢', color: '#ef4444' },
    PHISHING: { name: 'Phishing Attacks', icon: '🎣', color: '#f59e0b' },
    VISHING: { name: 'Voice Phishing', icon: '📞', color: '#ec4899' },
    REMOTE_ACCESS: { name: 'Remote Access Scams', icon: '💻', color: '#14b8a6' },
    INVESTMENT_SCAM: { name: 'Investment Scams', icon: '📈', color: '#f97316' },
    JOB_SCAM: { name: 'Job Scams', icon: '💼', color: '#6366f1' },
    GENERAL: { name: 'General Safety', icon: '🛡️', color: '#10b981' }
};

/**
 * Get all safety tips, optionally filtered by category
 */
export function getTips(category = null) {
    let tips = SAFETY_TIPS;

    if (category) {
        tips = tips.filter(t => t.category === category.toUpperCase());
    }

    return {
        tips,
        categories: Object.entries(CATEGORIES).map(([key, val]) => ({
            key,
            ...val,
            count: SAFETY_TIPS.filter(t => t.category === key).length
        })),
        totalCount: tips.length
    };
}

/**
 * Get contextual tips based on fraud analysis result
 */
export async function getContextualTips(fraudResult) {
    const tips = [];

    // Match tips by fraud category
    if (fraudResult.fraudCategory) {
        const categoryName = fraudResult.fraudCategory.name || '';
        // Map known categories
        const categoryMap = {
            'phishing': 'PHISHING',
            'qr': 'QR_SCAM',
            'otp': 'OTP_FRAUD',
            'vishing': 'VISHING',
            'voice': 'VISHING',
            'lottery': 'GENERAL',
            'reward': 'GENERAL',
            'job': 'JOB_SCAM',
            'impersonation': 'VISHING',
            'remote': 'REMOTE_ACCESS',
            'investment': 'INVESTMENT_SCAM'
        };

        for (const [keyword, cat] of Object.entries(categoryMap)) {
            if (categoryName.toLowerCase().includes(keyword)) {
                tips.push(...SAFETY_TIPS.filter(t => t.category === cat));
            }
        }
    }

    // Match tips by indicators
    if (fraudResult.indicators) {
        for (const ind of fraudResult.indicators) {
            const label = (ind.label || '').toLowerCase();
            if (label.includes('qr')) tips.push(...SAFETY_TIPS.filter(t => t.category === 'QR_SCAM'));
            if (label.includes('pin') || label.includes('otp')) tips.push(...SAFETY_TIPS.filter(t => t.category === 'OTP_FRAUD'));
            if (label.includes('link') || label.includes('phish')) tips.push(...SAFETY_TIPS.filter(t => t.category === 'PHISHING'));
        }
    }

    // Always include general safety tips
    tips.push(...SAFETY_TIPS.filter(t => t.category === 'GENERAL'));

    // Deduplicate
    const unique = [...new Map(tips.map(t => [t.id, t])).values()];

    // Try AI-enhanced personalized advice
    let personalizedAdvice = null;
    initializeAI();
    if (gemini && fraudResult.riskScore >= 25) {
        try {
            const prompt = `As a UPI fraud prevention expert, give a brief personalized safety advice (2-3 sentences) for this situation:
Risk Score: ${fraudResult.riskScore}/100
Fraud Type: ${fraudResult.fraudCategory?.name || 'Suspicious Activity'}
Indicators: ${fraudResult.indicators?.map(i => i.label).join(', ') || 'Multiple risk factors'}

Keep it simple, actionable, and culturally appropriate for Indian users. Respond with plain text, no JSON.`;

            const response = await gemini.chat.completions.create({
                model: config.geminiModel,
                messages: [
                    { role: 'system', content: 'You are a friendly UPI safety advisor. Keep responses brief and actionable.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 200,
                temperature: 0.3
            });

            personalizedAdvice = response.choices[0]?.message?.content?.trim() || null;
        } catch (error) {
            console.error('AI personalized advice error:', error.message);
        }
    }

    return {
        tips: unique.slice(0, 6), // Return top 6 most relevant
        personalizedAdvice,
        totalAvailable: unique.length
    };
}

export default { getTips, getContextualTips };
