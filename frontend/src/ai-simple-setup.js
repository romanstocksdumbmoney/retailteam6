async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: 'Unknown API error' };
    }
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

function getStoredToken() {
  return String(localStorage.getItem('dumbdollars_token') || '').trim();
}

function getAuthHeadersSafe() {
  if (typeof window.getAuthHeaders === 'function') {
    return window.getAuthHeaders();
  }
  const token = getStoredToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function tryRestoreSession() {
  if (typeof window.restoreSessionIfNeeded === 'function') {
    const restored = await window.restoreSessionIfNeeded();
    if (typeof restored === 'string') {
      return restored;
    }
    return String(restored?.token || '').trim();
  }
  return '';
}

async function requestWithAuthRetry(url, options = {}) {
  try {
    return await fetchJson(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...getAuthHeadersSafe()
      }
    });
  } catch (error) {
    if (Number(error?.status || 0) !== 401) {
      throw error;
    }
    const restored = await tryRestoreSession();
    if (!restored) {
      throw error;
    }
    return fetchJson(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...getAuthHeadersSafe()
      }
    });
  }
}

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-simple-setup-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function buildStepCard(step, index) {
  const statusLabel = step.completed ? 'DONE' : 'NEXT';
  return `
    <article class="simple-setup-step ${step.completed ? 'simple-setup-step--done' : 'simple-setup-step--pending'}">
      <p class="simple-setup-step-title">
        <strong>Step ${index + 1}:</strong> ${step.title}
      </p>
      <p class="small-note">${step.detail}</p>
      <p class="small-note"><strong>Status:</strong> ${statusLabel}</p>
    </article>
  `;
}

function renderSteps(steps = []) {
  const target = document.getElementById('ai-simple-setup-steps');
  if (!target) {
    return;
  }
  if (!steps.length) {
    target.innerHTML = '<div class="pro-lock">No setup steps available.</div>';
    return;
  }
  target.innerHTML = steps.map((step, index) => buildStepCard(step, index)).join('');
}

function findStepDoneByKey(allSteps, key) {
  const row = allSteps.find((step) => String(step?.key || '').trim().toLowerCase() === key);
  return Boolean(row?.completed);
}

function calculateSimpleFlow(accountView) {
  const rawSetupSteps = Array.isArray(accountView?.execution?.setup?.steps) ? accountView.execution.setup.steps : [];
  const configured = Boolean(accountView?.bot?.configured);
  const liveMode = String(accountView?.bot?.tradingMode || 'paper').trim().toLowerCase() === 'live';
  const funded = Number(accountView?.account?.fundedUsd || 0) > 0;
  const brokerConnected = Boolean(accountView?.execution?.brokerConnection?.isConnected);
  const testReady = findStepDoneByKey(rawSetupSteps, 'test-connection');
  const autopilotActive = Boolean(accountView?.execution?.autopilot?.active);

  const steps = [
    {
      key: 'bot',
      title: 'Save your AI bot setup',
      detail: 'Pick risk profile and save bot settings.',
      completed: configured,
      href: '/ai-bot-trader.html#ai-bot-quick-setup-title',
      actionLabel: 'Open AI Bot Setup'
    },
    {
      key: 'funding',
      title: 'Enable Live mode and fund account',
      detail: 'Switch to live funding mode and add capital.',
      completed: Boolean(liveMode && funded),
      href: '/ai-bot-funding.html#ai-funding-form',
      actionLabel: 'Open Funding Setup'
    },
    {
      key: 'broker',
      title: 'Connect broker + pass bridge test',
      detail: 'Save broker credentials and run connection test until green.',
      completed: Boolean(brokerConnected && testReady),
      href: '/brokerage-onboarding.html#broker-connect-form',
      actionLabel: 'Open Broker Connect'
    },
    {
      key: 'autopilot',
      title: 'Start hands-free AI trading',
      detail: 'Open AI account control and start autopilot.',
      completed: autopilotActive,
      href: '/ai-bot-account.html#ai-account-start-autopilot',
      actionLabel: 'Open Hands-Free Control'
    }
  ];

  const nextStep = steps.find((step) => !step.completed) || {
    key: 'done',
    title: 'Setup complete',
    detail: 'You are ready to control live hands-free AI trading.',
    completed: true,
    href: '/ai-bot-account.html',
    actionLabel: 'Open AI Account View'
  };

  return { steps, nextStep };
}

function setNextButton(nextStep) {
  const button = document.getElementById('ai-simple-next-button');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.dataset.nextHref = String(nextStep?.href || '/ai-bot-account.html');
  button.dataset.nextLabel = String(nextStep?.actionLabel || 'Open Next Step');
  button.textContent = nextStep?.completed
    ? 'Open Hands-Free AI Control'
    : `${nextStep?.actionLabel || 'Open Next Step'} (Recommended)`;
}

function openCopilotGuide(nextStep, statusText) {
  const route = {
    href: String(nextStep?.href || '/ai-bot-account.html'),
    label: String(nextStep?.actionLabel || 'Open Next Step'),
    wantsRedirect: false
  };
  try {
    window.dispatchEvent(new CustomEvent('dumbdollars:copilot-open', {
      detail: {
        prompt: `Guide me through this step: ${nextStep?.title || 'next setup step'}`,
        message: statusText,
        route
      }
    }));
  } catch (_error) {
    window.location.href = route.href;
  }
}

function wantsAutoGuideFromQuery() {
  const raw = String(new URLSearchParams(window.location.search).get('guide') || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

async function loadSimpleProgress() {
  const token = getStoredToken() || await tryRestoreSession();
  if (!token) {
    const signInStep = {
      href: '/ai-trade-access.html?next=%2Fai-simple-setup.html',
      actionLabel: 'Sign in to continue',
      title: 'Sign in first'
    };
    renderSteps([
      {
        title: 'Sign in',
        detail: 'Create account or sign in so setup can be saved.',
        completed: false
      },
      {
        title: 'Live Funding',
        detail: 'Enable live mode and add funding.',
        completed: false
      },
      {
        title: 'Broker Connect',
        detail: 'Connect broker and pass bridge test.',
        completed: false
      },
      {
        title: 'Start Hands-Free',
        detail: 'Start AI autopilot from account control.',
        completed: false
      }
    ]);
    setNextButton(signInStep);
    setStatus('Sign in first. Then this page will guide each next step automatically.');
    return signInStep;
  }

  const accountView = await requestWithAuthRetry('/api/market/auto-trader/account-view', {
    method: 'GET'
  });
  const flow = calculateSimpleFlow(accountView);
  renderSteps(flow.steps);
  setNextButton(flow.nextStep);
  if (flow.nextStep.key === 'done') {
    setStatus('Setup complete. You can now control hands-free AI trading.');
  } else {
    setStatus(`Next recommended step: ${flow.nextStep.title}`);
  }
  return flow.nextStep;
}

function setupActions() {
  const nextButton = document.getElementById('ai-simple-next-button');
  const refreshButton = document.getElementById('ai-simple-refresh-button');
  const guideButton = document.getElementById('ai-simple-guide-button');
  let activeNextStep = null;
  const autoGuideRequested = wantsAutoGuideFromQuery();
  let autoGuideHandled = false;

  const refresh = async () => {
    try {
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = true;
      }
      setStatus('Checking your setup progress...');
      activeNextStep = await loadSimpleProgress();
      if (autoGuideRequested && !autoGuideHandled) {
        const next = activeNextStep || {
          href: '/ai-simple-setup.html',
          actionLabel: 'Reload easy setup',
          title: 'Easy setup'
        };
        const message = `AI Guide: your next step is "${next.title}". Click the action link to continue.`;
        openCopilotGuide(next, message);
        setStatus('AI guide opened automatically. Follow the action in Copilot.');
        autoGuideHandled = true;
      }
    } catch (error) {
      setStatus(error.message || 'Could not load setup progress. Opening guided setup page.', true);
      activeNextStep = {
        href: '/ai-simple-setup.html',
        actionLabel: 'Reload easy setup',
        title: 'Easy setup'
      };
      setNextButton(activeNextStep);
    } finally {
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = false;
      }
    }
  };

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.addEventListener('click', () => {
      const href = String(nextButton.dataset.nextHref || activeNextStep?.href || '/ai-bot-account.html').trim();
      window.location.href = href || '/ai-bot-account.html';
    });
  }

  if (guideButton instanceof HTMLButtonElement) {
    guideButton.addEventListener('click', () => {
      const next = activeNextStep || {
        href: '/ai-simple-setup.html',
        actionLabel: 'Reload easy setup',
        title: 'Easy setup'
      };
      const message = `AI Guide: your next step is "${next.title}". Click the action link to continue.`;
      openCopilotGuide(next, message);
      setStatus('AI guide opened. Follow the action shown in Copilot.');
    });
  }

  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener('click', async () => {
      await refresh();
    });
  }

  refresh().catch(() => {});
}

setupActions();
