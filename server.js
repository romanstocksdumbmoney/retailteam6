const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const newsRoutes = require('./routes/news');
const earningsRoutes = require('./routes/earnings');

const app = express();
const buildDir = path.join(__dirname, 'frontend', 'build');
const hasFrontendBuild = fs.existsSync(path.join(buildDir, 'index.html'));

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
    if (hasFrontendBuild) {
        return res.sendFile(path.join(buildDir, 'index.html'));
    }

    return res.json({
        name: 'A app',
        status: 'running',
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
    if (hasFrontendBuild) {
        console.log('Serving frontend from frontend/build');
    } else {
        console.log('Frontend build not found. API-only mode enabled.');
    }
});