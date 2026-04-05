const fs = require('fs/promises');
const path = require('path');

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'expenses.json');

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch (_error) {
    await fs.writeFile(dataFile, '[]', 'utf8');
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

module.exports = {
  addExpense,
  readExpenses,
};
