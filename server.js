const path = require('path');
const express = require('express');
const cors = require('cors');
const expenseRoutes = require('./routes/expenses');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhooks');

const app = express();

app.use(cors());
app.use('/api/webhooks', webhookRoutes);
app.use(express.json());

app.use('/api/expenses', expenseRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Expense reporting app is running on port ${PORT}`);
  });
}

module.exports = app;