/**
 * today.js — Grounded Today View (Adaptive 3-State)
 *
 * Single emotional surface. No navigation. No choices. No reveal.
 * States: SURVIVAL | LOW_CAPACITY | STABLE
 * Default: LOW_CAPACITY. Works at 3AM. No user input required.
 *
 * Phase 2: state resolution delegated to stateEngine.js.
 *          Presence layer, usage signals, and weekly reflection
 *          are invoked fire-and-forget after render.
 *
 * Phase 3: continuityTag resolved from stateEngine and passed into renderToday.
 *          Copy varies deterministically by state × continuityTag.
 *          Layout, structure, and element count are unchanged.
 *          Daily history snapshot written fire-and-forget.
 *
 * Phase 4: Cache-first render — Today renders synchronously from sessionStorage
 *          cache on return visits. On cache miss, a safe deterministic placeholder
 *          renders immediately (LOW_CAPACITY × NEUTRAL × base); background
 *          resolution patches to the correct state once signals are read.
 *          No loading state at any point.
 */

import { getLastActiveGap, touchLastActive } from '../services/lastSeen.js';
import { getTodayWellnessCheckin }           from '../services/wellness.js';
import { getHabitLog, HABITS }               from '../services/habits.js';
import { getTodayWorkoutSession }            from '../services/workouts.js';
import { getTodayKey, getTodayDisplay }      from '../utils.js';
import { db }                                from '../lib/firebase.js';
import { doc, getDoc }                       from 'firebase/firestore';

// ─── Phase 2 services ─────────────────────────────────────────────────────────

import {
  resolveAndPersistState,
  isNightWindow,
  STATES,
} from '../services/stateEngine.js';

import { recordAppOpen, getDailySignals }    from '../services/usageSignals.js';
import { evaluatePresence }                  from '../services/presenceEngine.js';
import {
  sendPresenceNotification,
  maybeSendNightNotification,
}                                            from '../services/notificationService.js';
import { maybeGenerateWeeklyReflection }     from '../services/reflectionEngine.js';

// ─── Phase 3 services ─────────────────────────────────────────────────────────

import { writeDailySnapshot }                from '../services/historyStore.js';
import { CONTINUITY_TAGS }                   from '../services/patternEngine.js';

// ─── Phase 4 services ─────────────────────────────────────────────────────────

import {
  getCachedTodayPayload,
  setCachedTodayPayload,
  isCachedPayloadUsable,
  shouldPatchRenderedPayload,
}                                            from '../services/renderCache.js';

import {
  detectFlatDay,
  getFlatDayAdjustmentKey,
}                                            from '../services/flatDayEngine.js';

import { resolveTodayCopy, getFirstLineKey, resolveVariantBranch } from '../services/copyResolver.js';
import { trackEvent }                        from '../services/analytics.js';
import { startSession }                      from '../services/sessionTracker.js';
import { deriveAtRiskOfDrift }               from '../services/driftEngine.js';

// ─── Re-exports (backward compatibility) ─────────────────────────────────────

export const TODAY_STATES = STATES;
export { isNightWindow };

// ─── Payload builder ──────────────────────────────────────────────────────────

/**
 * Build the full Today payload from resolved context.
 * This is the canonical shape stored in renderCache and used for patching.
 *
 * @param {{
 *   state:           string,
 *   isNight:         boolean,
 *   continuityTag:   string,
 *   tone:            string,
 *   habitsDoneRatio: number,
 *   gapHours:        number,
 *   atRiskOfDrift:   boolean,
 * }} context
 * @returns {object}
 */
function buildTodayPayload(context) {
  const {
    state,
    isNight,
    continuityTag,
    tone,
    habitsDoneRatio = 0,
    gapHours        = 0,
    atRiskOfDrift   = false,
  } = context;

  const flatDayFlag        = detectFlatDay({ resolvedState: state, continuityTag, habitsDoneRatio, gapHours, isNight });
  const driftVariantApplied = atRiskOfDrift;
  const variantBranch      = resolveVariantBranch({ atRiskOfDrift, flatDayFlag });

  const copy = resolveTodayCopy({
    resolvedState: state,
    continuityTag,
    isNight,
    atRiskOfDrift,
    flatDayFlag,
  });

  const firstLineKey    = getFirstLineKey({ resolvedState: state, continuityTag, isNight }, variantBranch);
  const copyVariantBranch = variantBranch;

  return {
    dateKey:            getTodayKey(),
    resolvedState:      state,
    continuityTag,
    tone,
    firstLine:          copy.headline,
    reassurance:        copy.reassurance,
    status:             copy.status,
    isNight,
    driftVariantApplied,
    flatDayFlag,
    firstLineKey,
    copyVariantBranch,
  };
}

// ─── Render from payload ──────────────────────────────────────────────────────

/**
 * Render Today HTML from a resolved payload.
 * Same DOM structure as Phase 3 — no layout changes.
 *
 * @param {object} payload — from buildTodayPayload
 * @returns {string}
 */
export function renderTodayFromPayload(payload) {
  const { resolvedState, isNight, firstLine, reassurance, status } = payload;

  const showDate = !isNight && resolvedState !== STATES.SURVIVAL;

  return `
    <main class="view-scroll today-surface${isNight ? ' today-surface--night' : ''}">
      <div class="view-inner today-inner">

        <header class="today-header">
          ${showDate ? `<p class="today-eyebrow">${getTodayDisplay()}</p>` : ''}
          <h1 class="today-headline">${firstLine}</h1>
          <p class="today-reassurance">${reassurance}</p>
          ${status ? `<p class="today-status">${status}</p>` : ''}
        </header>

      </div>
    </main>
  `;
}

// ─── Backward-compatible renderToday ─────────────────────────────────────────

/**
 * Kept for backward compatibility with any external callers.
 * Internally delegates to renderTodayFromPayload.
 *
 * @param {{ state: string, isNight: boolean, continuityTag?: string, atRiskOfDrift?: boolean, flatDayFlag?: boolean }} opts
 * @returns {string}
 */
export function renderToday({ state, isNight, continuityTag = CONTINUITY_TAGS.NEUTRAL, atRiskOfDrift = false, flatDayFlag = false }) {
  const copy = resolveTodayCopy({ resolvedState: state, continuityTag, isNight, atRiskOfDrift, flatDayFlag });
  const showDate = !isNight && state !== STATES.SURVIVAL;

  return `
    <main class="view-scroll today-surface${isNight ? ' today-surface--night' : ''}">
      <div class="view-inner today-inner">

        <header class="today-header">
          ${showDate ? `<p class="today-eyebrow">${getTodayDisplay()}</p>` : ''}
          <h1 class="today-headline">${copy.headline}</h1>
          <p class="today-reassurance">${copy.reassurance}</p>
          ${copy.status ? `<p class="today-status">${copy.status}</p>` : ''}
        </header>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    const now      = new Date();
    const todayKey = getTodayKey();

    // ── Phase 4: cache-first render ────────────────────────────────────────────
    // Attempt to render synchronously from cached payload.
    // No loading spinner — if cache is valid, render is immediate.

    const cachedPayload = getCachedTodayPayload();
    const cacheUsable   = isCachedPayloadUsable(cachedPayload, todayKey);

    if (cacheUsable) {
      // Synchronous render from cache — no async, no visible loading state
      container.innerHTML = renderTodayFromPayload(cachedPayload);
    } else {
      // Cache miss (first visit or new day) — render a safe deterministic
      // placeholder payload immediately. No loading state, no spinner.
      // Uses LOW_CAPACITY × NEUTRAL × base — the correct conservative default
      // for any unknown context. Not emotionally tuned to the user's actual
      // state on first load; the background resolve will patch it once signals
      // are read. Emotionally neutral and non-directive until then.
      const fallbackPayload = buildTodayPayload({
        state:           STATES.LOW_CAPACITY,
        isNight:         isNightWindow(now),
        continuityTag:   CONTINUITY_TAGS.NEUTRAL,
        tone:            'STEADY',
        habitsDoneRatio: 0,
        gapHours:        0,
        atRiskOfDrift:   false,
      });
      container.innerHTML = renderTodayFromPayload(fallbackPayload);
    }

    // ── Phase 4: session tracking ──────────────────────────────────────────────
    startSession(user.uid);

    // ── Signal reads ───────────────────────────────────────────────────────────

    // Critical path — needed for state resolution
    const [
      { gapHours },
      todayHabits,
    ] = await Promise.all([
      getLastActiveGap(user.uid),
      getHabitLog(user.uid, todayKey).catch(() => ({})),
    ]);

    // Fire-and-forget reads — warm caches without blocking render
    getTodayWellnessCheckin(user.uid).catch(() => null);
    getTodayWorkoutSession(user.uid).catch(() => null);

    // Touch lastActive (once per session, debounced inside)
    touchLastActive(user.uid);

    // Phase 2: record passive usage signal (once per session)
    recordAppOpen(user.uid).catch(() => null);

    // Phase 4: track app_open event (fire-and-forget)
    trackEvent(user.uid, 'app_open', { hour: now.getHours() }, { dedupeKey: `app_open_${todayKey}` }).catch(() => null);

    // Compute habits ratio for state engine
    const habitsDoneRatio = HABITS.length > 0
      ? HABITS.filter(h => todayHabits[h.id] === true).length / HABITS.length
      : 0;

    // ── Phase 4: resolveTodayPayloadAsync ─────────────────────────────────────
    // Resolve state in background regardless of cache hit.
    // Patch the DOM only if something meaningful changed.

    const { state, isNight, continuityTag, tone } = await resolveAndPersistState(
      user.uid,
      { gapHours, habitsDoneRatio },
      now
    );

    // Phase 4: derive drift inputs.
    //
    // Three conditions (from driftEngine spec):
    //   1. gapHours > 18                    — gap-based, always available
    //   2. openCountDeclining2Days          — today vs yesterday appOpenCount
    //   3. lowUnpromptedOpenRate2Days       — sum of unpromptedOpenCount across
    //                                         today + yesterday from dailyHistory
    //                                         NOTE: this is a 2-day rolling proxy,
    //                                         not a true 48h timestamp window.
    //                                         Renamed from noUnpromptedOpenIn48h
    //                                         to reflect what is actually measured.
    //
    // On any read failure the outer catch falls back to condition 1 only.
    // This is documented degradation — not silent breakage.
    // driftEngine.deriveAtRiskOfDrift treats each condition as an OR,
    // so gap-only fallback remains meaningful.
    const atRiskOfDrift = await (async () => {
      try {
        const signals = await getDailySignals(user.uid);

        // ── Condition 2: open count declining over last 2 days ────────────────
        let openCountDeclining2Days = false;
        const todayCount   = signals.appOpenCount ?? 1;
        const yesterdayKey = (() => {
          const d = new Date(now);
          d.setDate(d.getDate() - 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        // Read yesterday's open count from dailyHistory (already written by snapshot)
        try {
          const ySnap = await getDoc(doc(db, 'users', user.uid, 'dailyHistory', yesterdayKey));
          if (ySnap.exists()) {
            const yesterdayCount = ySnap.data().appOpenCount ?? 0;
            openCountDeclining2Days = todayCount < yesterdayCount;
          }
        } catch { /* non-critical — condition defaults false */ }

        // ── Condition 3: low unprompted open rate over 2 days ────────────────
        // Derived from unpromptedOpenCount in today + yesterday dailyHistory.
        // A rolling proxy — not a true 48h timestamp window. Named accordingly.
        let lowUnpromptedOpenRate2Days = false;
        try {
          const todayUnprompted = signals.unpromptedOpenCount ?? 0;
          let   yesterdayUnprompted = 0;
          const ySnap2 = await getDoc(doc(db, 'users', user.uid, 'dailyHistory', yesterdayKey));
          if (ySnap2.exists()) {
            yesterdayUnprompted = ySnap2.data().unpromptedOpenCount ?? 0;
          }
          lowUnpromptedOpenRate2Days = (todayUnprompted + yesterdayUnprompted) === 0;
        } catch { /* non-critical — condition defaults false */ }

        return deriveAtRiskOfDrift({
          gapHours,
          openCountDeclining2Days,
          // Pass under the canonical param name so driftEngine stays unchanged
          noUnpromptedOpenIn48h: lowUnpromptedOpenRate2Days,
        });
      } catch {
        // Documented degradation: outer failure falls back to condition 1 only.
        // Drift sensitivity is reduced but not broken — gapHours > 18 still fires.
        return deriveAtRiskOfDrift({ gapHours });
      }
    })();

    // Build fresh payload
    const freshPayload = buildTodayPayload({
      state,
      isNight,
      continuityTag,
      tone,
      habitsDoneRatio,
      gapHours,
      atRiskOfDrift,
    });

    // ── Patch or render ────────────────────────────────────────────────────────

    if (cacheUsable && !shouldPatchRenderedPayload(cachedPayload, freshPayload)) {
      // Cache was good and nothing changed — no DOM update, no layout shift
    } else {
      // Render fresh payload
      container.innerHTML = renderTodayFromPayload(freshPayload);
    }

    // Update cache for next visit
    setCachedTodayPayload(freshPayload);

    // Phase 4: track today_rendered event
    trackEvent(user.uid, 'today_rendered', {
      state,
      isNight,
      continuityTag,
      firstLineKey: freshPayload.firstLineKey,
      copyVariantBranch: freshPayload.copyVariantBranch,
    }).catch(() => null);

    // ── Phase 3: write daily history snapshot ─────────────────────────────────
    (async () => {
      try {
        const signals = await getDailySignals(user.uid);
        await writeDailySnapshot(user.uid, {
          resolvedState:      state,
          continuityTag,
          habitsDoneRatio,
          gapHours,
          nightOpen:          isNight,
          appOpenCount:        signals.appOpenCount        ?? 1,
          unpromptedOpenCount: signals.unpromptedOpenCount ?? 0,
          // Phase 4 additions
          tone,
          firstLineKey:        freshPayload.firstLineKey,
          copyVariantBranch:   freshPayload.copyVariantBranch,
          flatDayFlag:         freshPayload.flatDayFlag,
          atRiskOfDrift:       freshPayload.driftVariantApplied,
        });
      } catch {
        // Non-critical
      }
    })();

    // ── Phase 2: presence layer — all fire-and-forget, never re-renders ───────

    if (isNight) {
      maybeSendNightNotification(user.uid).catch(() => null);
    } else {
      evaluatePresence(
        user.uid,
        { gapHours, state, nightOpen: false, continuityTag, tone },
        now
      )
        .then(trigger => {
          if (trigger) {
            sendPresenceNotification(user.uid, trigger, state, { continuityTag, tone }).catch(() => null);
          }
        })
        .catch(() => null);
    }

    // Weekly reflection — runs Sundays only, once per week
    maybeGenerateWeeklyReflection(user.uid, { continuityTag, tone }).catch(() => null);
  },
};
