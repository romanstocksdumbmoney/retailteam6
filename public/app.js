async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Request failed.');
  }

  return body;
}

const receiptForm = document.getElementById('receipt-form');
const receiptFileInput = document.getElementById('receipt-file');
const scanStatus = document.getElementById('scan-status');
const scanResult = document.getElementById('scan-result');

receiptForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  scanStatus.textContent = 'Scanning receipt...';
  scanStatus.className = '';

  try {
    const formData = new FormData();
    formData.append('receipt', receiptFileInput.files[0]);

    const result = await requestJson('/api/expenses/scan-receipt', {
      method: 'POST',
      body: formData,
    });

    scanStatus.textContent = 'Receipt scanned successfully.';
    scanResult.textContent = JSON.stringify(result, null, 2);
    receiptForm.reset();
  } catch (error) {
    scanStatus.textContent = error.message;
    scanStatus.className = 'error';
  }
});

const reportForm = document.getElementById('report-form');
const reportMonthInput = document.getElementById('report-month');
const reportStatus = document.getElementById('report-status');
const reportResult = document.getElementById('report-result');

reportMonthInput.value = new Date().toISOString().slice(0, 7);

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  reportStatus.textContent = 'Building monthly report...';
  reportStatus.className = '';

  try {
    const result = await requestJson(`/api/expenses/monthly-report?month=${reportMonthInput.value}`);
    reportStatus.textContent = 'Report generated.';
    reportResult.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    reportStatus.textContent = error.message;
    reportStatus.className = 'error';
  }
});
