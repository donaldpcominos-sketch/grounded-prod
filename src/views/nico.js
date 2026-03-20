// src/views/nico.js
import { getTodayNicoLog, saveNicoLog } from '../services/nico.js';
import { getTodayDisplay, showToast } from '../utils.js';
import { db } from '../lib/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

// ─── Activity data ────────────────────────────────────────────────────────────
// ageRange: [minMonths, maxMonths] — inclusive. null = no upper limit.
//   0  = newborn
//   6  = 6 months
//   12 = 1 year
//   18 = 18 months
//   24 = 2 years

const ACTIVITIES = [
  // ── Outdoor · Sydney / Greystanes context ──────────────────────────────────
  {
    id: 'bubble-blowing',
    label: 'Bubble blowing',
    type: 'outdoor',
    energy: 'low',
    emoji: '🫧',
    desc: 'Chasing and popping bubbles — magic for little ones. Calming for you too.',
    duration: '15–30 min',
    tags: ['calm', 'sensory', 'outdoor'],
    ageRange: [3, null]
  },
  {
    id: 'nature-walk',
    label: 'Neighbourhood nature walk',
    type: 'outdoor',
    energy: 'low',
    emoji: '🐛',
    desc: 'Collect leaves, look for bugs, notice things. Go slow and follow Nico\'s lead.',
    duration: '20–40 min',
    tags: ['calm', 'curiosity', 'local'],
    ageRange: [6, null]
  },
  {
    id: 'chalk-drawing',
    label: 'Chalk on the driveway',
    type: 'outdoor',
    energy: 'low',
    emoji: '🎨',
    desc: 'Big canvases, no mess inside. Draw together — let Nico direct.',
    duration: '20–45 min',
    tags: ['creative', 'calm', 'outdoor'],
    ageRange: [9, null]
  },
  {
    id: 'backyard-water',
    label: 'Backyard water play',
    type: 'outdoor',
    energy: 'active',
    emoji: '💦',
    desc: 'Hose, buckets, splash mat — a hot day\'s best activity.',
    duration: '30–60 min',
    tags: ['sensory', 'cooling', 'physical'],
    ageRange: [9, null]
  },
  {
    id: 'playground-greystanes',
    label: 'Local playground',
    type: 'outdoor',
    energy: 'active',
    emoji: '🛝',
    desc: 'Slides, swings, climbing. Greystanes and surrounds have good parks close by.',
    duration: '30–60 min',
    tags: ['physical', 'social', 'local'],
    ageRange: [9, null]
  },
  {
    id: 'parramatta-park',
    label: 'Parramatta Park run',
    type: 'outdoor',
    energy: 'active',
    emoji: '🌳',
    desc: 'Wide open grass, ducks at the river, room to run and yell freely.',
    duration: '45–90 min',
    tags: ['fresh air', 'physical', 'local'],
    ageRange: [12, null]
  },

  // ── Indoor · Active ────────────────────────────────────────────────────────
  {
    id: 'dance-party',
    label: 'Dance party',
    type: 'indoor',
    energy: 'active',
    emoji: '🕺',
    desc: 'Put on whatever bops and go. No rules, just movement and silliness.',
    duration: '15–30 min',
    tags: ['physical', 'fun', 'music'],
    ageRange: [6, null]
  },
  {
    id: 'balloon-games',
    label: 'Balloon keep-up',
    type: 'indoor',
    energy: 'active',
    emoji: '🎈',
    desc: "Don't let the balloon touch the floor. Simple, endlessly entertaining.",
    duration: '15–25 min',
    tags: ['physical', 'low-setup', 'fun'],
    ageRange: [12, null]
  },
  {
    id: 'obstacle-course',
    label: 'Living room obstacle course',
    type: 'indoor',
    energy: 'active',
    emoji: '🏡',
    desc: 'Pillows to jump over, tunnels of chairs and blankets, cushion landing pads.',
    duration: '20–40 min',
    tags: ['physical', 'imaginative', 'setup'],
    ageRange: [12, null]
  },

  // ── Indoor · Low energy / calm ─────────────────────────────────────────────
  {
    id: 'reading-pile',
    label: 'Big book pile read',
    type: 'indoor',
    energy: 'low',
    emoji: '📚',
    desc: 'Stack up 5–6 books. Let Nico choose which to read and in what order.',
    duration: '15–30 min',
    tags: ['language', 'calm', 'bonding'],
    ageRange: [3, null]
  },
  {
    id: 'sensory-tray',
    label: 'Sensory tray play',
    type: 'indoor',
    energy: 'low',
    emoji: '🌾',
    desc: 'Rice, pasta, oats, or sand in a tray with spoons and cups. Quiet and absorbing.',
    duration: '20–40 min',
    tags: ['sensory', 'calm', 'independent'],
    ageRange: [4, null]
  },
  {
    id: 'water-pouring',
    label: 'Water pouring (sink play)',
    type: 'indoor',
    energy: 'low',
    emoji: '🚿',
    desc: 'A few cups and containers at the kitchen sink. Absorbing and calming. Towel nearby.',
    duration: '15–30 min',
    tags: ['sensory', 'calm', 'independent'],
    ageRange: [4, null]
  },
  {
    id: 'playdough',
    label: 'Playdough',
    type: 'indoor',
    energy: 'low',
    emoji: '🟠',
    desc: 'Roll, squish, poke. Calm hands-on play — make things together or alongside.',
    duration: '20–40 min',
    tags: ['fine motor', 'calm', 'creative'],
    ageRange: [12, null]
  },
  {
    id: 'building-blocks',
    label: 'Block building',
    type: 'indoor',
    energy: 'low',
    emoji: '🧱',
    desc: 'Build tall towers and knock them down. Or build a whole town — Nico decides.',
    duration: '20–45 min',
    tags: ['spatial', 'creative', 'independent'],
    ageRange: [9, null]
  },
  {
    id: 'puzzle-time',
    label: 'Puzzle time',
    type: 'indoor',
    energy: 'low',
    emoji: '🧩',
    desc: "Work through a puzzle together. Let Nico lead — don't rush to help.",
    duration: '15–30 min',
    tags: ['cognitive', 'calm', 'focus'],
    ageRange: [12, null]
  },

  // ── Developmental ──────────────────────────────────────────────────────────
  {
    id: 'colour-mixing',
    label: 'Colour mixing',
    type: 'developmental',
    energy: 'low',
    emoji: '🔵',
    desc: 'Watercolours or food colouring in water. Watch what happens when you mix.',
    duration: '15–30 min',
    tags: ['science', 'creative', 'language'],
    ageRange: [6, null]
  },
  {
    id: 'cooking-together',
    label: 'Simple cooking together',
    type: 'developmental',
    energy: 'low',
    emoji: '🍳',
    desc: 'Stir, pour, tear, arrange. Involves Nico without big mess. Great for language too.',
    duration: '20–30 min',
    tags: ['life skills', 'language', 'bonding'],
    ageRange: [12, null]
  },
  {
    id: 'pretend-shop',
    label: 'Pretend shop',
    type: 'developmental',
    energy: 'low',
    emoji: '🛒',
    desc: 'Set up a little shop with toys or food packages. Take turns being the shopkeeper.',
    duration: '20–40 min',
    tags: ['language', 'social', 'imaginative'],
    ageRange: [15, null]
  },
  {
    id: 'scavenger-hunt',
    label: 'Indoor scavenger hunt',
    type: 'developmental',
    energy: 'active',
    emoji: '🔍',
    desc: 'Hide 5–6 objects and give clues. Builds language, listening, and problem-solving.',
    duration: '20–30 min',
    tags: ['language', 'cognitive', 'fun'],
    ageRange: [15, null]
  },
  {
    id: 'nature-sorting',
    label: 'Nature sorting',
    type: 'developmental',
    energy: 'low',
    emoji: '🍂',
    desc: 'Collect leaves, rocks, sticks on a walk then sort by colour, size, or type.',
    duration: '30–50 min',
    tags: ['science', 'outdoor', 'cognitive'],
    ageRange: [12, null]
  }
];

const TYPE_LABELS = { outdoor: 'Outdoor', indoor: 'Indoor', developmental: 'Developmental' };
const TYPE_COLORS = { outdoor: 'tag--green', indoor: 'tag--warm', developmental: 'tag--soft' };

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  user: null,
  container: null,
  filter: 'all',
  naps: [],
  completedActivities: [],
  napInProgress: false,
  napStartTime: null,
  overlay: null,
  nicoAgeMonths: null  // null = age not set; number = filter by age
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hr = +h;
  const ampm = hr >= 12 ? 'pm' : 'am';
  return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}:${m}${ampm}`;
}

function napDuration(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function totalNapMinutes(naps) {
  return naps.reduce((acc, n) => {
    if (!n.start || !n.end) return acc;
    const [sh, sm] = n.start.split(':').map(Number);
    const [eh, em] = n.end.split(':').map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    return acc + (d > 0 ? d : 0);
  }, 0);
}

function isActivityAgeAppropriate(activity) {
  const age = state.nicoAgeMonths;
  if (age === null || age === undefined) return true; // no filter if age not set
  const [min, max] = activity.ageRange;
  if (age < min) return false;
  if (max !== null && age > max) return false;
  return true;
}

function getFilteredActivities() {
  const { filter } = state;
  return ACTIVITIES.filter(a => {
    if (!isActivityAgeAppropriate(a)) return false;
    if (filter === 'all') return true;
    if (filter === 'active') return a.energy === 'active';
    if (filter === 'low') return a.energy === 'low';
    return a.type === filter;
  });
}

function getAgeLabel(months) {
  if (!months && months !== 0) return null;
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} old`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} year${years === 1 ? '' : 's'} old`;
  return `${years}y ${rem}m old`;
}

// ─── Save helper ──────────────────────────────────────────────────────────────

async function nicoSave(data) {
  try {
    await saveNicoLog(state.user.uid, data);
  } catch (err) {
    showToast('Couldn\'t save — check your connection', 'error', 4000);
    throw err;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderPastNapOverlay() {
  return `
    <div class="overlay-backdrop" id="overlayBackdrop">
      <div class="overlay-sheet">
        <p class="overlay-title">Log a past nap</p>
        <p class="overlay-subtitle">Enter the start and end time from memory.</p>
        <div class="nap-time-inputs mt-4">
          <div class="nap-time-field">
            <label class="nap-time-label">Started</label>
            <input type="time" id="pastNapStart" class="nap-time-input" />
          </div>
          <span class="nap-time-sep">→</span>
          <div class="nap-time-field">
            <label class="nap-time-label">Woke up</label>
            <input type="time" id="pastNapEnd" class="nap-time-input" />
          </div>
        </div>
        <p id="pastNapError" class="nap-error-text mt-2"></p>
        <button class="btn-primary w-full mt-4" id="savePastNapBtn">Save nap</button>
        <button class="btn-secondary w-full mt-2" id="overlayCancel">Cancel</button>
      </div>
    </div>
  `;
}

function renderView() {
  const { filter, naps, completedActivities, nicoAgeMonths } = state;
  const activities = getFilteredActivities();
  const activeNap = naps.find(n => !n.end);
  const completedNaps = naps.filter(n => n.end);
  const totalMins = totalNapMinutes(naps);
  const ageLabel = getAgeLabel(nicoAgeMonths);

  // Hidden activities count (for age banner context)
  const allFiltered = ACTIVITIES.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'active') return a.energy === 'active';
    if (filter === 'low') return a.energy === 'low';
    return a.type === filter;
  });
  const hiddenCount = nicoAgeMonths !== null
    ? allFiltered.filter(a => !isActivityAgeAppropriate(a)).length
    : 0;

  const filterBtns = [
    { key: 'all',           label: 'All' },
    { key: 'active',        label: 'Active' },
    { key: 'low',           label: 'Calm' },
    { key: 'outdoor',       label: 'Outdoor' },
    { key: 'indoor',        label: 'Indoor' },
    { key: 'developmental', label: 'Learn' }
  ];

  return `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Nico</h1>
          <p class="page-subtitle">${getTodayDisplay()}</p>
        </header>

        <!-- Nap tracker -->
        <section class="card card--nap mt-0">
          <div class="card-row">
            <div>
              <p class="card-label">Nap tracker</p>
              <p class="card-body mt-1">${
                completedNaps.length === 0 && !activeNap
                  ? 'No naps logged today.'
                  : activeNap
                    ? `Nap started at ${formatTime(activeNap.start)}`
                    : `${completedNaps.length} nap${completedNaps.length > 1 ? 's' : ''} today`
              }</p>
            </div>
            <div class="stat-block">
              ${totalMins > 0 ? `
                <p class="stat-number">${totalMins >= 60 ? Math.round(totalMins / 60 * 10) / 10 : totalMins}</p>
                <p class="stat-unit">${totalMins >= 60 ? 'hrs' : 'min'}</p>
              ` : `
                <p class="nap-moon">🌙</p>
              `}
            </div>
          </div>

          ${completedNaps.length > 0 ? `
            <div class="nap-history mt-3">
              ${completedNaps.map((n, i) => `
                <div class="nap-row">
                  <span class="nap-row-label">Nap ${i + 1}</span>
                  <span class="nap-row-time">${formatTime(n.start)} → ${formatTime(n.end)}</span>
                  <span class="nap-row-dur">${napDuration(n.start, n.end) || '—'}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${activeNap ? `
            <div class="nap-active-pill mt-3">
              <span class="nap-pulse"></span>
              <span class="nap-active-text">Napping now — started ${formatTime(activeNap.start)}</span>
            </div>
            <button class="btn-primary w-full mt-3" id="endNapBtn">Wake up 🌤</button>
          ` : `
            <button class="${completedNaps.length > 0 ? 'btn-secondary' : 'btn-primary'} w-full mt-3" id="startNapBtn">
              ${completedNaps.length > 0 ? '+ Log another nap' : 'Nap time 🌙'}
            </button>
          `}
          <button class="nap-past-btn mt-2" id="logPastNapBtn">+ Log a past nap</button>
        </section>

        ${state.overlay === 'past-nap' ? renderPastNapOverlay() : ''}

        <!-- Age banner (shown if age is set) -->
        ${ageLabel ? `
          <div class="nico-age-banner mt-4">
            <span class="nico-age-banner-text">Showing activities for Nico at ${ageLabel}</span>
            ${hiddenCount > 0 ? `<span class="nico-age-banner-note">${hiddenCount} not yet age-appropriate</span>` : ''}
          </div>
        ` : ''}

        <!-- Activity filter pills -->
        <div class="filter-row ${ageLabel ? '' : 'mt-4'}">
          ${filterBtns.map(f => `
            <button class="filter-pill ${filter === f.key ? 'filter-pill--active' : ''}" data-filter="${f.key}">
              ${f.label}
            </button>
          `).join('')}
        </div>

        <!-- Activity cards -->
        <div class="nico-activity-grid mt-3">
          ${activities.length === 0 ? `
            <div class="history-empty">
              <p>${nicoAgeMonths !== null ? 'No age-appropriate activities match this filter yet.' : 'No activities match this filter.'}</p>
            </div>
          ` : activities.map(a => {
            const done = completedActivities.includes(a.id);
            return `
              <div class="nico-activity-card ${done ? 'nico-activity-card--done' : ''}">
                <div class="nico-card-top">
                  <span class="nico-emoji">${a.emoji}</span>
                  <span class="tag ${TYPE_COLORS[a.type]}">${TYPE_LABELS[a.type]}</span>
                </div>
                <h3 class="nico-activity-name mt-2">${a.label}</h3>
                <p class="nico-activity-desc mt-1">${a.desc}</p>
                <div class="nico-card-footer mt-3">
                  <span class="nico-duration">⏱ ${a.duration}</span>
                  <button class="nico-done-btn ${done ? 'nico-done-btn--active' : ''}" data-activity-id="${a.id}">
                    ${done ? '✓ Done' : 'Mark done'}
                  </button>
                </div>
                <div class="nico-tags mt-2">
                  ${a.tags.map(t => `<span class="nico-tag">${t}</span>`).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Bottom breathing room -->
        <div style="height: 12px;"></div>

      </div>
    </main>
  `;
}

function render() {
  if (!state.container) return;
  state.container.innerHTML = renderView();
  bindEvents();
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  // Filter pills
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setState({ filter: btn.dataset.filter }));
  });

  // Nap: start
  document.getElementById('startNapBtn')?.addEventListener('click', async () => {
    const newNaps = [...state.naps, { start: nowTime(), end: null }];
    state.naps = newNaps;
    try {
      await nicoSave({ naps: newNaps, completedActivities: state.completedActivities });
    } catch (_) { /* toast already shown */ }
    render();
  });

  // Nap: end
  document.getElementById('endNapBtn')?.addEventListener('click', async () => {
    const newNaps = state.naps.map(n => n.end ? n : { ...n, end: nowTime() });
    state.naps = newNaps;
    try {
      await nicoSave({ naps: newNaps, completedActivities: state.completedActivities });
    } catch (_) { /* toast already shown */ }
    render();
  });

  // Nap: log past nap overlay
  document.getElementById('logPastNapBtn')?.addEventListener('click', () => {
    setState({ overlay: 'past-nap' });
  });

  if (state.overlay === 'past-nap') {
    document.getElementById('overlayCancel')?.addEventListener('click', () => setState({ overlay: null }));
    document.getElementById('overlayBackdrop')?.addEventListener('click', e => {
      if (e.target.id === 'overlayBackdrop') setState({ overlay: null });
    });

    document.getElementById('savePastNapBtn')?.addEventListener('click', async () => {
      const startVal = document.getElementById('pastNapStart')?.value;
      const endVal   = document.getElementById('pastNapEnd')?.value;
      const errorEl  = document.getElementById('pastNapError');

      if (!startVal || !endVal) {
        errorEl.textContent = 'Please enter both a start and end time.';
        return;
      }
      const [sh, sm] = startVal.split(':').map(Number);
      const [eh, em] = endVal.split(':').map(Number);
      if ((eh * 60 + em) <= (sh * 60 + sm)) {
        errorEl.textContent = 'End time must be after start time.';
        return;
      }

      const newNaps = [...state.naps, { start: startVal, end: endVal }];
      state.naps    = newNaps;
      state.overlay = null;
      try {
        await nicoSave({ naps: newNaps, completedActivities: state.completedActivities });
        showToast('Nap saved ✓', 'success', 2000);
      } catch (_) { /* toast already shown; nap preserved in state */ }
      render();
    });
  }

  // Activity: mark done / undone
  document.querySelectorAll('[data-activity-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id      = btn.dataset.activityId;
      const current = state.completedActivities;
      const updated = current.includes(id)
        ? current.filter(a => a !== id)
        : [...current, id];
      state.completedActivities = updated;
      try {
        await nicoSave({ naps: state.naps, completedActivities: updated });
      } catch (_) { /* toast already shown */ }
      render();
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const NicoView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading Nico…</p></div>';

    // Load nap/activity log and user profile (for nicoAgeMonths) in parallel
    const [log, userSnap] = await Promise.all([
      getTodayNicoLog(user.uid),
      getDoc(doc(db, 'users', user.uid))
    ]);

    const userData = userSnap.exists() ? userSnap.data() : {};
    const nicoAgeMonths = (userData.nicoAgeMonths !== undefined && userData.nicoAgeMonths !== null)
      ? Number(userData.nicoAgeMonths)
      : null;

    state = {
      user,
      container,
      filter: 'all',
      naps: log.naps || [],
      completedActivities: log.completedActivities || [],
      napInProgress: false,
      napStartTime: null,
      overlay: null,
      nicoAgeMonths
    };
    render();
  }
};
