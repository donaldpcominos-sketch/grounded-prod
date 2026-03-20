// src/views/profile.js

import { signOutUser } from '../services/auth.js';
import { getBannedExercises, getRecentWorkoutSessions, getWorkoutStreak } from '../services/workouts.js';
import { db } from '../lib/firebase.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { showToast } from '../utils.js';
import {
  notificationsSupported,
  getPermissionState,
  requestPermission,
  loadReminderPrefs,
  saveReminderEnabled,
  saveReminderTime,
} from '../services/notifications.js';

let state = {
  user: null,
  container: null,
  banned: [],
  sessions: [],
  streak: 0,
  nicoAgeMonths: null,
  reminderEnabled: false,
  reminderTime: '08:00',
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
    const isDone = completedKeys.has(dateKey);
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
      const y = Math.floor(m / 12);
      const rem = m % 12;
      if (rem === 0) label = `${y} year${y === 1 ? '' : 's'}`;
      else label = `${y}y ${rem}m`;
    }
    opts.push({ value: m, label });
  }
  return opts;
}

// ─── Notification card HTML ───────────────────────────────────────────────────

function renderNotificationCard() {
  const { reminderEnabled, reminderTime, notifPermission } = state;
  const supported = notificationsSupported();

  if (!supported) {
    return `
      <section class="card mt-3">
        <p class="card-label">Daily reminder</p>
        <p class="card-body mt-2">Push notifications aren&#39;t supported in this browser. Try adding Grounded to your home screen and opening it from there.</p>
      </section>
    `;
  }

  if (notifPermission === 'denied') {
    return `
      <section class="card mt-3">
        <p class="card-label">Daily reminder</p>
        <p class="card-body mt-2">Notifications are blocked. To enable them, open your browser settings and allow notifications for this site, then toggle back on here.</p>
        <div class="notif-row mt-3">
          <span class="notif-label">Reminders</span>
          <label class="notif-toggle notif-toggle--disabled" aria-label="Notifications blocked">
            <input type="checkbox" id="reminderToggle" disabled />
            <span class="notif-toggle-track"></span>
          </label>
        </div>
      </section>
    `;
  }

  return `
    <section class="card mt-3">
      <p class="card-label">Daily reminder</p>
      <p class="card-body mt-1">A gentle nudge to check in. Only sent if you haven&#39;t opened the app yet that day.</p>

      <div class="notif-row mt-3">
        <span class="notif-label">Reminders</span>
        <label class="notif-toggle" aria-label="Toggle daily reminder">
          <input type="checkbox" id="reminderToggle" ${reminderEnabled ? 'checked' : ''} />
          <span class="notif-toggle-track"></span>
        </label>
      </div>

      <div class="notif-time-row ${reminderEnabled ? '' : 'notif-time-row--hidden'}" id="notifTimeRow">
        <span class="notif-time-label">Reminder time</span>
        <input
          type="time"
          id="reminderTime"
          class="notif-time-input"
          value="${reminderTime}"
        />
      </div>

      ${notifPermission === 'default' && !reminderEnabled ? `
        <p class="notif-hint mt-2">Toggling on will ask for notification permission.</p>
      ` : ''}
    </section>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const { user, banned, sessions, streak, graceDayUsedOn, nicoAgeMonths } = state;
  const firstName = user.displayName?.split(' ')[0] || 'there';
  const completedCount = sessions.filter(s => s.status === 'complete').length;
  const dots = buildStreakDots(sessions, graceDayUsedOn);
  const streakCopy = getStreakCopy(streak);
  const ageOptions = getAgeOptions();

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
                  ${dot.isDone ? '<span class="streak-dot-check">\u2713</span>' : dot.isGrace ? '<span class="streak-dot-check streak-dot-check--grace">~</span>' : ''}
                </div>
                <p class="streak-dot-label">${dot.dayLabel}</p>
              </div>
            `).join('')}
          </div>
          ${graceDayUsedOn ? `
            <p class="streak-grace-note mt-2">~ Grace day \u2014 streak preserved</p>
          ` : ''}
        </section>

        <!-- Daily reminder -->
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
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await signOutUser();
  });

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

  // Nico age select
  document.getElementById('nicoAgeSelect')?.addEventListener('change', async (e) => {
    const raw = e.target.value;
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

  // Reminder toggle
  const reminderToggle = document.getElementById('reminderToggle');
  const timeRow = document.getElementById('notifTimeRow');

  reminderToggle?.addEventListener('change', async (e) => {
    const enabling = e.target.checked;

    if (enabling) {
      // Request permission first
      const permission = await requestPermission();
      state.notifPermission = permission;

      if (permission === 'denied') {
        showToast('Notifications are blocked. Enable them in browser settings.', 'error', 5000);
        e.target.checked = false;
        render(); // re-render to show denied state
        return;
      }

      if (permission !== 'granted') {
        showToast('Permission not granted.', 'error', 3000);
        e.target.checked = false;
        return;
      }
    }

    // Update state and show/hide time row
    state.reminderEnabled = enabling;
    if (timeRow) {
      if (enabling) {
        timeRow.classList.remove('notif-time-row--hidden');
      } else {
        timeRow.classList.add('notif-time-row--hidden');
      }
    }

    // Save to Firestore
    try {
      await saveReminderEnabled(state.user.uid, enabling, state.reminderTime);
      showToast(
        enabling ? 'Daily reminder on \u2713' : 'Reminder turned off',
        'success',
        2500
      );
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });

  // Reminder time input
  document.getElementById('reminderTime')?.addEventListener('change', async (e) => {
    const newTime = e.target.value;
    state.reminderTime = newTime;

    try {
      await saveReminderTime(state.user.uid, newTime, state.reminderEnabled);
      showToast('Reminder time updated \u2713', 'success', 2000);
    } catch {
      showToast('Couldn\'t save \u2014 check your connection', 'error', 4000);
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const ProfileView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading profile\u2026</p></div>';

    const [banned, sessions, streakResult, reminderPrefs] = await Promise.all([
      getBannedExercises(user.uid),
      getRecentWorkoutSessions(user.uid, 30),
      getWorkoutStreak(user.uid),
      loadReminderPrefs(user.uid),
    ]);

    const { streak, graceDayUsedOn } = streakResult;

    // Load user doc for nicoAgeMonths
    let nicoAgeMonths = null;
    try {
      const { getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        nicoAgeMonths = (d.nicoAgeMonths !== undefined && d.nicoAgeMonths !== null) ? Number(d.nicoAgeMonths) : null;
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
      reminderEnabled: reminderPrefs.enabled,
      reminderTime: reminderPrefs.time,
      notifPermission: getPermissionState(),
    };

    render();
  }
};
