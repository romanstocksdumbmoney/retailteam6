const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const newsRoutes = require('./routes/news');
const earningsRoutes = require('./routes/earnings');
const marketRoutes = require('./routes/market');
const botRoutes = require('./routes/bot');
const brokerRoutes = require('./routes/broker');
const userRoutes = require('./routes/user');
const { authV2Router, bootstrapAuthV2 } = require('./routes/auth-v2');
const { maybeProtectPageRoute } = require('./services/routeAuth');
const { startScheduler } = require('./services/schedulerService');
const userStoreService = require('./services/userStore');
const { runAutoTraderAutopilotSweep } = require('./services/autoTraderService');
const { warmTickerUniverseCache } = require('./services/stockAnalyzerService');
const { assertEncryptionReady } = require('./utils/encryption');

function readRequiredEnv(name, options = {}) {
    const value = String(process.env[name] || '').trim();
    if (!value) {
        if (options.allowEmpty) {
            return value;
        }
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function validateAuthEmailEnv() {
    readRequiredEnv('APP_URL');
    readRequiredEnv('SECRET_KEY');
    readRequiredEnv('BCRYPT_ROUNDS');
    readRequiredEnv('SENDER_EMAIL');
    const hasSendGrid = String(process.env.SENDGRID_API_KEY || '').trim().length > 0;
    const hasSmtp = (
        String(process.env.SMTP_HOST || '').trim().length > 0
        && String(process.env.SMTP_USER || '').trim().length > 0
        && String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim().length > 0
    );
    if (!hasSendGrid && !hasSmtp) {
        throw new Error('Email delivery not configured. Set SENDGRID_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASSWORD.');
    }
}

function validateEncryptionEnv() {
    assertEncryptionReady();
}

const app = express();
app.set('trust proxy', 1);
const buildDir = path.join(__dirname, 'frontend', 'build');
const frontendSrcDir = path.join(__dirname, 'frontend', 'src');
const frontendBuildScript = path.join(__dirname, 'frontend', 'scripts', 'build.js');

function safeMtimeMs(filePath) {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch (_error) {
        return 0;
    }
}

function shouldRebuildFrontend() {
    const sourceFiles = [
        path.join(frontendSrcDir, 'index.html'),
        path.join(frontendSrcDir, 'app.js'),
        path.join(frontendSrcDir, 'styles.css')
    ];
    const buildFiles = [
        path.join(buildDir, 'index.html'),
        path.join(buildDir, 'app.js'),
        path.join(buildDir, 'styles.css')
    ];

    const hasAllBuildFiles = buildFiles.every((filePath) => fs.existsSync(filePath));
    if (!hasAllBuildFiles) {
        return true;
    }

    const latestSourceMtime = Math.max(...sourceFiles.map((filePath) => safeMtimeMs(filePath)));
    const earliestBuildMtime = Math.min(...buildFiles.map((filePath) => safeMtimeMs(filePath)));
    return latestSourceMtime > earliestBuildMtime;
}

function ensureFrontendBuildFresh() {
    if (!shouldRebuildFrontend()) {
        return;
    }
    console.log('Frontend build missing or stale. Rebuilding from frontend/src...');
    execFileSync(process.execPath, [frontendBuildScript], {
        cwd: __dirname,
        stdio: 'inherit'
    });
}

try {
    ensureFrontendBuildFresh();
} catch (error) {
    console.error('Frontend build refresh failed. Falling back to API-only mode.');
    console.error(error?.message || error);
}

validateAuthEmailEnv();
validateEncryptionEnv();

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
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
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
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many login attempts. Try again later.' }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many registration attempts. Try again later.' }
});
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many password reset requests. Try again later.' }
});
const resendVerificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many verification email requests. Try again later.' }
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
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/signup', registerLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/oauth/signin', authLimiter);
app.use('/api/auth/session/restore', authLimiter);
app.use('/api/auth/session/revoke', authLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth/reset-password', forgotPasswordLimiter);
app.use('/api/auth/resend-verification', resendVerificationLimiter);
app.use('/api/auth/verify-email', resendVerificationLimiter);
app.use('/api/auth/access-code/request', authLimiter);
app.use('/api/auth/access-code/verify', authLimiter);
app.use('/api/auth/email-automation/settings', authLimiter);
app.use('/api/auth/email-automation/send', authLimiter);
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

app.use(maybeProtectPageRoute);

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
app.use('/api/bot', botRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/auth', authV2Router);
app.use('/api/user', userRoutes);

void warmTickerUniverseCache();

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
    /**
     * ROUTING RULES — DO NOT CHANGE WITHOUT REVIEW
     * / or /dashboard → Dashboard/home page (module list)
     * /stock/:ticker  → Stock analysis results page
     *
     * The Analyze Stock button ALWAYS navigates to /stock/:ticker
     * It NEVER navigates to / or /dashboard
     * The StockAnalysisPage fetches its own data from URL params
     * Do not pass stock data via navigation state — use URL params only
     */
    app.get('/stock/:ticker', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'stock-analysis.html'));
    });
    app.get('/dashboard', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'index.html'));
    });
    app.get('/ai-trader', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'ai-bot-trader.html'));
    });
    app.get('/settings', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'settings.html'));
    });
    app.get('/settings/broker', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'settings-broker.html'));
    });
    app.get('/login', (_req, res) => {
        return res.redirect('/ai-trade-access.html?mode=login');
    });
    app.get('/register', (_req, res) => {
        return res.redirect('/ai-trade-access.html?mode=signup');
    });
    app.get('/forgot-password', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'forgot-password.html'));
    });
    app.get('/reset-password', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'reset-password.html'));
    });
    app.get('/verify-email', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'verify-email.html'));
    });
    app.get('/unsubscribe.html', (_req, res) => {
        return res.sendFile(path.join(buildDir, 'unsubscribe.html'));
    });
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
    void bootstrapAuthV2({ userStoreService });
    startScheduler();
    void warmTickerUniverseCache();
    setInterval(() => {
        runAutopilotSweepSafe();
    }, autopilotEveryMs);
    if (hasFrontendBuild) {
        console.log('Serving frontend from frontend/build');
    } else {
        console.log('Frontend build not found. API-only mode enabled.');
    }
});