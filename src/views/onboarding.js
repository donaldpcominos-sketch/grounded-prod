// src/views/onboarding.js
import { db } from '../lib/firebase.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const STEPS = [
  {
    id: 'welcome',
    emoji: '✦',
    title: (name) => `Welcome, ${name}.`,
    body: 'Grounded is your quiet space — a daily companion for your body, mind, and the little one who keeps life moving.'
  },
  {
    id: 'today',
    emoji: '🌿',
    title: () => 'Check in daily',
    body: 'Your Today tab is a soft landing. Track how you\'re feeling, log water, and write a little — even two lines is enough.'
  },
  {
    id: 'workouts',
    emoji: '🏋️',
    title: () => 'Workouts built for you',
    body: 'A weekly split focused on glute growth and a strong core. Quick or standard — choose what fits your day.'
  },
  {
    id: 'nico',
    emoji: '🧸',
    title: () => 'Nico\'s tab',
    body: 'Activity ideas for the days you\'re wondering what to do next — plus a nap tracker so nothing slips through the cracks.'
  },
  {
    id: 'ready',
    emoji: '🌸',
    title: () => 'You\'re all set.',
    body: 'This is your space. No pressure, no streaks to chase. Just a gentle prompt to show up for yourself each day.'
  },
  {
    id: 'install',
    emoji: '📲',
    title: () => 'Keep it close.',
    body: 'Add Grounded to your home screen so it\'s always one tap away — no browser, no fuss.',
    isInstallStep: true
  }
];

let currentStep = 0;
let userId = null;

function getFirstName(user) {
  return user.displayName?.split(' ')[0] || 'there';
}

// Detect whether the install prompt is available, and whether we're already
// installed (running in standalone / fullscreen mode).
function isAlreadyInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function hasInstallPrompt() {
  return Boolean(window.__pwaInstallPrompt);
}

// Filter out the install step if it's not relevant
function getVisibleSteps() {
  if (isAlreadyInstalled() || !hasInstallPrompt()) {
    return STEPS.filter((s) => !s.isInstallStep);
  }
  return STEPS;
}

function renderStep(user) {
  const steps = getVisibleSteps();
  const step = steps[currentStep];
  const total = steps.length;
  const isLast = currentStep === total - 1;

  const primaryLabel = step.isInstallStep
    ? 'Add to Home Screen'
    : isLast
    ? 'Start using Grounded'
    : 'Next';

  const showSkip = step.isInstallStep;

  return `
    <div class="ob-overlay" id="obOverlay">
      <div class="ob-sheet" id="obSheet">
        <div class="ob-dots">
          ${steps.map((_, i) => `<span class="ob-dot ${i === currentStep ? 'ob-dot--active' : i < currentStep ? 'ob-dot--done' : ''}"></span>`).join('')}
        </div>

        <div class="ob-content">
          <div class="ob-emoji">${step.emoji}</div>
          <h2 class="ob-title">${step.title(getFirstName(user))}</h2>
          <p class="ob-body">${step.body}</p>
        </div>

        <div class="ob-actions">
          <button class="btn-primary w-full" id="obNextBtn">
            ${primaryLabel}
          </button>
          ${showSkip ? `<button class="ob-back-btn" id="obSkipInstallBtn">Maybe later</button>` : ''}
          ${!showSkip && currentStep > 0 ? `<button class="ob-back-btn" id="obBackBtn">Back</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function mount(user) {
  // Remove any existing instance
  document.getElementById('obOverlay')?.remove();

  const el = document.createElement('div');
  el.innerHTML = renderStep(user);
  document.body.appendChild(el.firstElementChild);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    document.getElementById('obSheet')?.classList.add('ob-sheet--visible');
  });

  const steps = getVisibleSteps();
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  document.getElementById('obNextBtn')?.addEventListener('click', async () => {
    if (step.isInstallStep) {
      // Attempt the native install prompt
      await triggerInstall();
      // Regardless of the user's choice in the native dialog, finish onboarding
      await dismiss(user);
    } else if (!isLast) {
      currentStep++;
      mount(user);
    } else {
      await dismiss(user);
    }
  });

  document.getElementById('obSkipInstallBtn')?.addEventListener('click', async () => {
    await dismiss(user);
  });

  document.getElementById('obBackBtn')?.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      mount(user);
    }
  });
}

async function triggerInstall() {
  const prompt = window.__pwaInstallPrompt;
  if (!prompt) return;

  try {
    prompt.prompt();
    await prompt.userChoice;
  } catch (_) {
    // If the prompt was already used or the browser rejects it, continue silently
  }

  // Clear the stored prompt — it can only be used once
  window.__pwaInstallPrompt = null;
}

async function dismiss(user) {
  const sheet = document.getElementById('obSheet');
  const overlay = document.getElementById('obOverlay');
  sheet?.classList.add('ob-sheet--exit');
  setTimeout(() => overlay?.remove(), 320);

  // Mark onboarded in Firestore
  await setDoc(doc(db, 'users', user.uid), {
    onboarded: true,
    onboardedAt: serverTimestamp()
  }, { merge: true });
}

export function showOnboardingIfNeeded(user) {
  currentStep = 0;
  userId = user.uid;
  mount(user);
}
