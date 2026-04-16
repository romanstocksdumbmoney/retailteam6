require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const newsRoutes = require('./routes/news');
const earningsRoutes = require('./routes/earnings');
const marketRoutes = require('./routes/market');
const authRoutes = require('./routes/auth');
const { runAutoTraderAutopilotSweep } = require('./services/autoTraderService');

const app = express();
const buildDir = path.join(__dirname, 'frontend', 'build');
const hasFrontendBuild = fs.existsSync(path.join(buildDir, 'index.html'));

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

function parseAllowedOrigins(rawOrigins) {
    return String(rawOrigins || '')
        .split(',')
        .map((origin) => String(origin || '').trim())
        .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
if (isProduction && allowedOrigins.length === 0) {
    throw new Error('In production, ALLOWED_ORIGINS must be set (comma-separated).');
}
app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }
        if (!isProduction) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS not allowed'));
    },
    credentials: true
}));
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many auth requests. Try again later.' }
});
const checkoutLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many checkout attempts. Try again later.' }
});
const complaintLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many complaint submissions. Try again later.' }
});

app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/oauth/signin', authLimiter);
app.use('/api/auth/session/restore', authLimiter);
app.use('/api/auth/session/revoke', authLimiter);
app.use('/api/auth/access-code/request', authLimiter);
app.use('/api/auth/access-code/verify', authLimiter);
app.use('/api/auth/stripe/create-checkout-session', checkoutLimiter);
app.use('/api/auth/stripe/confirm-checkout-session', checkoutLimiter);
app.use('/api/auth/stripe/create-customer-portal', checkoutLimiter);
app.use('/api/market/copilot/complaints', complaintLimiter);

app.use((req, res, next) => {
    if (req.path === '/api/auth/stripe/webhook') {
        return next();
    }
    return express.json({ limit: '8mb' })(req, res, next);
});

app.get('/', (_req, res) => {
    if (hasFrontendBuild) {
        return res.sendFile(path.join(buildDir, 'index.html'));
    }

    return res.json({
        name: 'DumbDollars',
        status: 'running',
        description: 'DumbDollars is a market intelligence dashboard for stock outlook probabilities, flow scanning, earnings signals, and pro-level options tools.',
        message: 'Frontend build not found. Run: cd frontend && npm run build'
    });
});

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok'
    });
});

app.use('/api/news', newsRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/auth', authRoutes);

let autopilotSweepRunning = false;
const autopilotEveryMs = Math.max(
    10_000,
    Number.parseInt(String(process.env.AI_AUTOPILOT_SWEEP_MS || '30000'), 10) || 30_000
);

async function runAutopilotSweepSafe() {
    if (autopilotSweepRunning) {
        return;
    }
    autopilotSweepRunning = true;
    try {
        await runAutoTraderAutopilotSweep();
    } catch (error) {
        console.error('Autopilot sweep failed:', error?.message || error);
    } finally {
        autopilotSweepRunning = false;
    }
}

if (hasFrontendBuild) {
    app.use(express.static(buildDir));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path === '/health') {
            return next();
        }

        return res.sendFile(path.join(buildDir, 'index.html'));
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`AI autopilot sweep interval: ${autopilotEveryMs}ms`);
    setInterval(() => {
        runAutopilotSweepSafe();
    }, autopilotEveryMs);
    if (hasFrontendBuild) {
        console.log('Serving frontend from frontend/build');
    } else {
        console.log('Frontend build not found. API-only mode enabled.');
    }
});