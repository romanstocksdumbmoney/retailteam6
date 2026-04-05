const fs = require('fs/promises');
const path = require('path');

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'expenses.json');
const subscriptionsFile = path.join(dataDirectory, 'subscriptions.json');

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch (_error) {
    await fs.writeFile(dataFile, '[]', 'utf8');
  }
}

async function ensureSubscriptionsFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(subscriptionsFile);
  } catch (_error) {
    await fs.writeFile(subscriptionsFile, '{}', 'utf8');
  }
}

async function readExpenses() {
  await ensureDataFile();
  const fileContents = await fs.readFile(dataFile, 'utf8');

  try {
    const parsed = JSON.parse(fileContents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function writeExpenses(expenses) {
  await ensureDataFile();
  await fs.writeFile(dataFile, `${JSON.stringify(expenses, null, 2)}\n`, 'utf8');
}

async function addExpense(expense) {
  const expenses = await readExpenses();
  expenses.push(expense);
  await writeExpenses(expenses);
  return expense;
}

async function readSubscriptions() {
  await ensureSubscriptionsFile();
  const fileContents = await fs.readFile(subscriptionsFile, 'utf8');

  try {
    const parsed = JSON.parse(fileContents);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

async function writeSubscriptions(subscriptions) {
  await ensureSubscriptionsFile();
  await fs.writeFile(subscriptionsFile, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8');
}

async function upsertSubscription(subscription) {
  const subscriptions = await readSubscriptions();
  subscriptions[subscription.token] = subscription;
  await writeSubscriptions(subscriptions);
  return subscription;
}

async function getSubscriptionByToken(token) {
  if (!token) return null;
  const subscriptions = await readSubscriptions();
  return subscriptions[token] || null;
}

module.exports = {
  addExpense,
  readExpenses,
  upsertSubscription,
  getSubscriptionByToken,
};
