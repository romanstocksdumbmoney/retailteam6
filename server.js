const express = require('express');
const cors = require('cors');
const newsRoutes = require('./routes/news');
const earningsRoutes = require('./routes/earnings');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
    res.json({
        name: 'A app',
        status: 'running'
    });
});

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok'
    });
});

app.use('/api/news', newsRoutes);
app.use('/api/earnings', earningsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});