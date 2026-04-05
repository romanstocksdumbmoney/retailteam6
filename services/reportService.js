function getExpenseMonth(expense) {
  const sourceDate = expense.expenseDate || expense.createdAt;
  if (!sourceDate) return null;
  return sourceDate.slice(0, 7);
}

function generateMonthlyReport(expenses, month) {
  const selectedMonth = month || new Date().toISOString().slice(0, 7);
  const monthlyExpenses = expenses.filter((expense) => getExpenseMonth(expense) === selectedMonth);

  const totalAmount = monthlyExpenses.reduce((sum, expense) => sum + (Number(expense.total) || 0), 0);

  const byCategory = monthlyExpenses.reduce((accumulator, expense) => {
    const key = expense.category || 'Other';
    accumulator[key] = (accumulator[key] || 0) + (Number(expense.total) || 0);
    return accumulator;
  }, {});

  const byVendor = monthlyExpenses.reduce((accumulator, expense) => {
    const key = expense.vendor || 'Unknown vendor';
    accumulator[key] = (accumulator[key] || 0) + (Number(expense.total) || 0);
    return accumulator;
  }, {});

  return {
    month: selectedMonth,
    expenseCount: monthlyExpenses.length,
    totalAmount: Number(totalAmount.toFixed(2)),
    averageExpense: Number((monthlyExpenses.length ? totalAmount / monthlyExpenses.length : 0).toFixed(2)),
    byCategory: Object.entries(byCategory)
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total),
    byVendor: Object.entries(byVendor)
      .map(([vendor, total]) => ({ vendor, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total),
    items: monthlyExpenses,
  };
}

module.exports = {
  generateMonthlyReport,
};
