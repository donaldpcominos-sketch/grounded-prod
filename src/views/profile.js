// src/views/profile.js

import { signOutUser } from '../services/auth.js';
import { getBannedExercises, getRecentWorkoutSessions, getWorkoutStreak } from '../services/workouts.js';
import { db } from '../lib/firebase.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { showToast } from '../utils.js';
import {
  notificationsSupported,
  getPermissionState,
  requestPermission,
  loadNotificationPrefs,
  saveMasterEnabled,
  saveReminderEnabled,
  saveReminderTime,
  saveReminderWindow,
  saveQuietHours,
  saveNudgesEnabled,
} from '../services/notifications.js';

let state = {
  user:            null,
  container:       null,
  banned:          [],
  sessions:        [],
  streak:          0,
  graceDayUsedOn:  null,
  nicoAgeMonths:   null,
  notifPrefs:      null,
  notifPermission: 'default',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExerciseId(id) {
  return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDateKey(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildStreakDots(sessions, graceDayUsedOn) {
  const completedKeys = new Set(
    sessions.filter(s => s.status === 'complete').map(s => s.date || s.dateKey).filter(Boolean)
  );
  const todayKey = getDateKey(0);

  return Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const dateKey = getDateKey(daysAgo);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const dayLabel = date.toLocaleDateString('en-AU', { weekday: 'short' }).slice(0, 1);
    const isDone  = completedKeys.has(dateKey);
    const isToday = dateKey === todayKey;
    const isGrace = !isDone && dateKey === graceDayUsedOn;
    return { dayLabel, dateKey, isDone, isToday, isGrace };
  });
}

function getStreakCopy(streak) {
  if (streak <= 0) return null;
  if (streak === 1) return 'First session done.';
  if (streak < 7)  return 'Building momentum.';
  return 'One week strong.';
}

function getAgeOptions() {
  const opts = [{ value: '', label: 'Not set' }];
  for (let m = 1; m <= 36; m++) {
    let label;
    if (m < 12) {
      label = `${m} month${m === 1 ? '' : 's'}`;
    } else {
      const y   = Math.floor(m / 12);
      const rem = m % 12;
      if (rem === 0) label = `${y} year${y === 1 ? '' : 's'}`;
      else           label = `${y}y ${rem}m`;
    }
    opts.push({ value: m, label });
  }
  return opts;
}

// ─── Notification card HTML ───────────────────────────────────────────────────

function renderNotificationCard() {
  const { notifPrefs, notifPermission } = state;
  const supported = notificationsSupported();

  if (!supported) {
    return `
      <section class="card mt-3">
        <p class="card-label">Notifications</p>
        <p class="card-body mt-2">Push notifications aren&#39;t supported in this browser. Try adding Grounded to your home screen and opening it from there.</p>
      </section>
    `;
  }

  if (notifPermission === 'denied') {
    return `
      <section class="card mt-3">
        <p class="card-label">Notifications</p>
        <p class="card-body mt-2">Notifications are blocked. To enable them, open your browser settings and allow notifications for this site, then toggle back on here.</p>
        <div class="notif-row mt-3">
          <span class="notif-label">Enable notifications</span>
          <label class="notif-toggle notif-toggle--disabled" aria-label="Notifications blocked">
            <input type="checkbox" id="masterToggle" disabled />
            <span class="notif-toggle-track"></span>
          </label>
        </div>
      </section>
    `;
  }

  const {
    masterEnabled,
    reminderEnabled,
    reminderTime,
    reminderWindowStart,
    reminderWindowEnd,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    nudgesEnabled,
  } = notifPrefs;

  return `
    <section class="card mt-3">
      <p class="card-label">Notifications</p>
      <p class="card-body mt-1">A calm nudge when it&#39;s useful — never noisy.</p>

      <!-- Master toggle -->
      <div class="notif-row mt-3">
        <span class="notif-label">Enable notifications</span>
        <label class="notif-toggle" aria-label="Toggle notifications">
          <input type="checkbox" id="masterToggle" ${masterEnabled ? 'checked' : ''} />
          <span class="notif-toggle-track"></span>
        </label>
      </div>

      ${notifPermission === 'default' && !masterEnabled ? `
        <p class="notif-hint mt-2">Toggling on will ask for permission.</p>
      ` : ''}

      <!-- Expandable detail — only visible when master is on -->
      <div id="notifDetail" class="notif-detail ${masterEnabled ? '' : 'notif-detail--hidden'}">

        <!-- Daily reminder -->
        <div class="notif-section-divider mt-3"></div>
        <p class="notif-section-label mt-3">Daily reminder</p>

        <div class="notif-row mt-2">
          <span class="notif-label">Send a reminder</span>
          <label class="notif-toggle" aria-label="Toggle daily reminder">
            <input type="checkbox" id="reminderToggle" ${reminderEnabled ? 'checked' : ''} />
            <span class="notif-toggle-track"></span>
          </label>
        </div>

        <div id="reminderTimeRow" class="notif-time-row ${reminderEnabled ? '' : 'notif-time-row--hidden'}">
          <span class="notif-time-label">Reminder time</span>
          <input type="time" id="reminderTime" class="notif-time-input" value="${reminderTime}" />
        </div>

        <!-- Reminder window -->
        <div class="notif-section-divider mt-3"></div>
        <p class="notif-section-label mt-3">Reminder window</p>
        <p class="notif-hint mt-1">Only send reminders within this window.</p>

        <div class="notif-time-pair mt-2">
          <div class="notif-time-item">
            <span class="notif-time-label">From</span>
            <input type="time" id="reminderWindowStart" class="notif-time-input" value="${reminderWindowStart}" />
          </div>
          <div class="notif-time-item">
            <span class="notif-time-label">Until</span>
            <input type="time" id="reminderWindowEnd" class="notif-time-input" value="${reminderWindowEnd}" />
          </div>
        </div>

        <!-- Quiet hours -->
        <div class="notif-section-divider mt-3"></div>
        <p class="notif-section-label mt-3">Quiet hours</p>
        <p class="notif-hint mt-1">No notifications during these hours.</p>

        <div class="notif-row mt-2">
          <span class="notif-label">Quiet hours</span>
          <label class="notif-toggle" aria-label="Toggle quiet hours">
            <input type="checkbox" id="quietHoursToggle" ${quietHoursEnabled ? 'checked' : ''} />
            <span class="notif-toggle-track"></span>
          </label>
        </div>

        <div id="quietHoursTimeRow" class="notif-time-pair ${quietHoursEnabled ? '' : 'notif-time-row--hidden'}">
          <div class="notif-time-item">
            <span class="notif-time-label">From</span>
            <input type="time" id="quietHoursStart" class="notif-time-input" value="${quietHoursStart}" />
          </div>
          <div class="notif-time-item">
            <span class="notif-time-label">Until</span>
            <input type="time" id="quietHoursEnd" class="notif-time-input" value="${quietHoursEnd}" />
          </div>
        </div>

        <!-- Nudges -->
        <div class="notif-section-divider mt-3"></div>
        <p class="notif-section-label mt-3">Nudges</p>
        <p class="notif-hint mt-1">Occasional check-ins based on how your day is going. Coming soon.</p>

        <div class="notif-row mt-2">
          <span class="notif-label">Behaviour nudges</span>
          <label class="notif-toggle" aria-label="Toggle behaviour nudges">
            <input type="checkbox" id="nudgesToggle" ${nudgesEnabled ? 'checked' : ''} />
            <span class="notif-toggle-track"></span>
          </label>
        </div>

      </div>
    </section>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const { user, banned, sessions, streak, graceDayUsedOn, nicoAgeMonths } = state;
  const firstName    = user.displayName?.split(' ')[0] || 'there';
  const completedCount = sessions.filter(s => s.status === 'complete').length;
  const dots         = buildStreakDots(sessions, graceDayUsedOn);
  const streakCopy   = getStreakCopy(streak);
  const ageOptions   = getAgeOptions();

  state.container.innerHTML = `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Profile</h1>
        </header>

        <!-- Identity card -->
        <section class="card profile-identity-card">
          ${user.photoURL ? `
            <img src="${user.photoURL}" alt="${user.displayName || ''}" class="profile-avatar" />
          ` : `
            <div class="profile-avatar-placeholder">${firstName[0]}</div>
          `}
          <div class="profile-identity-text">
            <p class="profile-name">${user.displayName || 'Grounded user'}</p>
            <p class="profile-email">${user.email || ''}</p>
          </div>
        </section>

        <!-- Stats -->
        <section class="card mt-3">
          <p class="card-label">Workout progress</p>
          <div class="profile-stats mt-3">
            <div class="profile-stat">
              <p class="profile-stat-value">${completedCount}</p>
              <p class="profile-stat-label">Sessions done</p>
            </div>
            <div class="complete-stat-divider"></div>
            <div class="profile-stat">
              <p class="profile-stat-value">${streak > 0 ? streak + ' \uD83D\uDD25' : '\u2014'}</p>
              <p class="profile-stat-label">Workout streak</p>
            </div>
            <div class="complete-stat-divider"></div>
            <div class="profile-stat">
              <p class="profile-stat-value">${banned.length}</p>
              <p class="profile-stat-label">Exercises banned</p>
            </div>
          </div>
        </section>

        <!-- 7-day streak graph -->
        <section class="card mt-3">
          <div class="streak-graph-header">
            <p class="card-label">Last 7 days</p>
            ${streakCopy ? `<p class="streak-graph-copy">${streakCopy}</p>` : ''}
          </div>
          <div class="streak-dots mt-3">
            ${dots.map(dot => `
              <div class="streak-dot-col ${dot.isToday ? 'streak-dot-col--today' : ''}">
                <div class="streak-dot ${dot.isDone ? 'streak-dot--done' : dot.isGrace ? 'streak-dot--grace' : dot.isToday ? 'streak-dot--today' : 'streak-dot--empty'}">
                  ${dot.isDone  ? '<span class="streak-dot-check">\u2713</span>'
                  : dot.isGrace ? '<span class="streak-dot-check streak-dot-check--grace">~</span>'
                  : ''}
                </div>
                <p class="streak-dot-label">${dot.dayLabel}</p>
              </div>
            `).join('')}
          </div>
          ${graceDayUsedOn ? `
            <p class="streak-grace-note mt-2">~ Grace day \u2014 streak preserved</p>
          ` : ''}
        </section>

        <!-- Notifications -->
        ${renderNotificationCard()}

        <!-- Nico settings -->
        <section class="card mt-3">
          <p class="card-label">Nico</p>
          <p class="card-body mt-1">Set Nico\'s age to see activities suited to where he is right now.</p>
          <div class="nico-settings-row mt-3">
            <label class="nico-settings-label" for="nicoAgeSelect">Age</label>
            <div class="nico-age-select-wrap">
              <select id="nicoAgeSelect" class="nico-age-select">
                ${ageOptions.map(opt => `
                  <option value="${opt.value}" ${(nicoAgeMonths === opt.value || (opt.value === '' && nicoAgeMonths === null)) ? 'selected' : ''}>
                    ${opt.label}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
          <p class="nico-settings-hint mt-2">Activities in the Nico tab will adjust as he grows.</p>
        </section>

        <!-- Banned exercises -->
        ${banned.length > 0 ? `
          <section class="card mt-3">
            <p class="card-label">Banned exercises</p>
            <p class="card-body mt-1">These won&#39;t appear in your workouts.</p>
            <div class="banned-list mt-3">
              ${banned.map(id => `
                <div class="banned-row">
                  <span class="banned-name">${formatExerciseId(id)}</span>
                  <button class="banned-remove" data-unban-id="${id}">Remove</button>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- App info -->
        <section class="card mt-3">
          <p class="card-label">About</p>
          <div class="about-list mt-3">
            <div class="about-row">
              <span class="about-key">App</span>
              <span class="about-val">Grounded</span>
            </div>
            <div class="about-row">
              <span class="about-key">Made with</span>
              <span class="about-val">Love \u2746</span>
            </div>
          </div>
        </section>

        <!-- Sign out -->
        <div class="mt-5">
          <button class="btn-secondary w-full" id="signOutBtn">Sign out</button>
        </div>

      </div>
    </main>
  `;

  bindEvents();
}

// ─── Bind events ──────────────────────────────────────────────────────────────

function bindEvents() {

  // ── Sign out ──
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await signOutUser();
  });

  // ── Unban exercises ──
  document.querySelectorAll('[data-unban-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.unbanId;
      state.banned = state.banned.filter(b => b !== id);
      await setDoc(doc(db, 'users', state.user.uid), {
        bannedExercises: state.banned,
        updatedAt: serverTimestamp()
      }, { merge: true });
      render();
    });
  });

  // ── Nico age ──
  document.getElementById('nicoAgeSelect')?.addEventListener('change', async (e) => {
    const raw    = e.target.value;
    const newAge = raw === '' ? null : Number(raw);
    state.nicoAgeMonths = newAge;
    try {
      await setDoc(doc(db, 'users', state.user.uid), {
        nicoAgeMonths: newAge,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Nico\'s age saved \u2713', 'success', 2000);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // ── DOM helpers ──
  function setVisible(el, visible) {
    if (!el) return;
    if (visible) el.classList.remove('notif-detail--hidden', 'notif-time-row--hidden');
    else         el.classList.add(el.id === 'notifDetail' ? 'notif-detail--hidden' : 'notif-time-row--hidden');
  }

  // ── Master toggle ──
  document.getElementById('masterToggle')?.addEventListener('change', async (e) => {
    const enabling = e.target.checked;

    if (enabling) {
      const current = Notification.permission;

      // Already denied at the OS/browser level — cannot request again.
      if (current === 'denied') {
        showToast(
          'Notifications are blocked in your browser. You can enable them in browser settings.',
          'error',
          6000,
        );
        e.target.checked = false;
        // Re-render so the card switches to the blocked state.
        state.notifPermission = 'denied';
        render();
        return;
      }

      // Not yet decided — ask the user now (only triggered by this interaction).
      if (current === 'default') {
        const result = await requestPermission();
        state.notifPermission = result;

        if (result === 'granted') {
          // Permission granted — fall through to save below.
        } else if (result === 'denied') {
          showToast(
            'Notifications are blocked in your browser. You can enable them in browser settings.',
            'error',
            6000,
          );
          e.target.checked = false;
          render();
          return;
        } else {
          // User dismissed the prompt without choosing ('default' returned again).
          showToast('Notifications weren\'t enabled — you can try again any time.', 'error', 4000);
          e.target.checked = false;
          return;
        }
      }

      // current === 'granted' falls straight through here with no prompt needed.
    }

    state.notifPrefs.masterEnabled = enabling;
    setVisible(document.getElementById('notifDetail'), enabling);

    try {
      await saveMasterEnabled(state.user.uid, enabling);
      showToast(enabling ? 'Notifications on \u2713' : 'Notifications off', 'success', 2500);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // ── Reminder toggle ──
  document.getElementById('reminderToggle')?.addEventListener('change', async (e) => {
    const enabling = e.target.checked;
    state.notifPrefs.reminderEnabled = enabling;
    setVisible(document.getElementById('reminderTimeRow'), enabling);
    try {
      await saveReminderEnabled(state.user.uid, enabling);
      showToast(enabling ? 'Daily reminder on \u2713' : 'Reminder off', 'success', 2500);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // ── Reminder time ──
  document.getElementById('reminderTime')?.addEventListener('change', async (e) => {
    const time = e.target.value;
    state.notifPrefs.reminderTime = time;
    try {
      await saveReminderTime(state.user.uid, time);
      showToast('Reminder time updated \u2713', 'success', 2000);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // ── Reminder window ──
  function bindPairChange(startId, endId, onSave) {
    const save = async () => {
      const start = document.getElementById(startId)?.value;
      const end   = document.getElementById(endId)?.value;
      if (!start || !end) return;
      try {
        await onSave(start, end);
        showToast('Saved \u2713', 'success', 2000);
      } catch {
        showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
      }
    };
    document.getElementById(startId)?.addEventListener('change', save);
    document.getElementById(endId)?.addEventListener('change', save);
  }

  bindPairChange('reminderWindowStart', 'reminderWindowEnd', async (start, end) => {
    state.notifPrefs.reminderWindowStart = start;
    state.notifPrefs.reminderWindowEnd   = end;
    await saveReminderWindow(state.user.uid, start, end);
  });

  // ── Quiet hours toggle ──
  document.getElementById('quietHoursToggle')?.addEventListener('change', async (e) => {
    const enabling = e.target.checked;
    state.notifPrefs.quietHoursEnabled = enabling;
    setVisible(document.getElementById('quietHoursTimeRow'), enabling);
    try {
      await saveQuietHours(
        state.user.uid,
        enabling,
        state.notifPrefs.quietHoursStart,
        state.notifPrefs.quietHoursEnd,
      );
      showToast(enabling ? 'Quiet hours on \u2713' : 'Quiet hours off', 'success', 2000);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // ── Quiet hours times ──
  bindPairChange('quietHoursStart', 'quietHoursEnd', async (start, end) => {
    state.notifPrefs.quietHoursStart = start;
    state.notifPrefs.quietHoursEnd   = end;
    await saveQuietHours(state.user.uid, state.notifPrefs.quietHoursEnabled, start, end);
  });

  // ── Nudges toggle ──
  document.getElementById('nudgesToggle')?.addEventListener('change', async (e) => {
    const enabling = e.target.checked;
    state.notifPrefs.nudgesEnabled = enabling;
    try {
      await saveNudgesEnabled(state.user.uid, enabling);
      showToast(enabling ? 'Nudges on \u2713' : 'Nudges off', 'success', 2000);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const ProfileView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading profile\u2026</p></div>';

    const [banned, sessions, streakResult, notifPrefs] = await Promise.all([
      getBannedExercises(user.uid),
      getRecentWorkoutSessions(user.uid, 30),
      getWorkoutStreak(user.uid),
      loadNotificationPrefs(user.uid),
    ]);

    const { streak, graceDayUsedOn } = streakResult;

    let nicoAgeMonths = null;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        nicoAgeMonths = (d.nicoAgeMonths !== undefined && d.nicoAgeMonths !== null)
          ? Number(d.nicoAgeMonths)
          : null;
      }
    } catch (_) {}

    state = {
      user,
      container,
      banned,
      sessions,
      streak,
      graceDayUsedOn,
      nicoAgeMonths,
      notifPrefs,
      notifPermission: getPermissionState(),
    };

    render();
  }
};
