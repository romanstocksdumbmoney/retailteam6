async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function renderNews(items) {
  const list = document.getElementById('news-list');
  list.innerHTML = '';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.title}</strong><br /><span>${item.summary}</span>`;
    list.appendChild(li);
  });
}

function renderEarnings(items) {
  const list = document.getElementById('earnings-list');
  list.innerHTML = '';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.ticker} ${item.quarter}: EPS ${item.eps}`;
    list.appendChild(li);
  });
}

async function init() {
  const status = document.getElementById('status');
  try {
    const [health, news, earnings] = await Promise.all([
      fetchJson('/health'),
      fetchJson('/api/news'),
      fetchJson('/api/earnings')
    ]);

    status.textContent = `API status: ${health.status}`;
    renderNews(news.items || []);
    renderEarnings(earnings.data || []);
  } catch (error) {
    status.textContent = 'Failed to load data from API.';
    console.error(error);
  }
}

init();
