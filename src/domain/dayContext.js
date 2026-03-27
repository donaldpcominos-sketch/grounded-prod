// src/domain/dayContext.js
// Shared interpretation layer for the Today screen.
// Summary uses this for tone.
// Recommendations use this for action priorities.

export function getDayContext(state) {
  if (!state) {
    return {
      needsCheckIn: true,
      gapBand: 'none',
      momentumBand: 'none',
      energyBand: 'unknown',
      workoutState: 'none',
      tone: 'gentle-reset'
    };
  }

  const mood = state.wellness?.mood || '';
  const energy = state.wellness?.energy || '';
  const gapHours = state.lastSeen?.gapHours ?? 0;

  const hasAnyProgress =
    state.progress?.activeHasAnyData ??
    state.progress?.hasAnyData ??
    false;

  const workoutsDone =
    state.progress?.activeWorkoutsDone ??
    state.progress?.workoutsDone ??
    0;

  const nourishedDays =
    state.progress?.activeNourishedDays ??
    state.progress?.nourishedDays ??
    0;

  const habitsDays =
    state.progress?.activeHabitsDays ??
    0;

  const checkInDays =
    state.progress?.activeCheckInDays ??
    0;

  const workoutDone = state.workout?.status === 'complete';
  const workoutPlanned = !!state.workout && state.workout?.status !== 'complete';

  let gapBand = 'none';
  if (gapHours >= 72) gapBand = 'long';
  else if (gapHours >= 24) gapBand = 'short';

  let momentumBand = 'none';
  if (hasAnyProgress) {
    const strongSignals =
      (workoutsDone >= 3) ||
      (nourishedDays >= 4) ||
      (habitsDays >= 4) ||
      (checkInDays >= 4);

    const lightSignals =
      (workoutsDone <= 1) &&
      (nourishedDays <= 2) &&
      (habitsDays <= 2) &&
      (checkInDays <= 2);

    if (strongSignals) {
      momentumBand = 'strong';
    } else if (lightSignals) {
      momentumBand = 'light';
    } else {
      momentumBand = 'steady';
    }
  }

  let energyBand = 'unknown';
  if (energy === 'low' || energy === 'medium' || energy === 'high') {
    energyBand = energy;
  }

  let workoutState = 'none';
  if (workoutDone) workoutState = 'complete';
  else if (workoutPlanned) workoutState = 'planned';

  const needsCheckIn = !mood || !energy;

  const tone = getTone({
    needsCheckIn,
    gapBand,
    momentumBand,
    energyBand,
    workoutState
  });

  return {
    needsCheckIn,
    gapBand,
    momentumBand,
    energyBand,
    workoutState,
    tone
  };
}

function getTone({ needsCheckIn, gapBand, momentumBand, energyBand, workoutState }) {
  if (needsCheckIn) {
    if (gapBand === 'long') return 'welcome-back';
    if (gapBand === 'short') return 'gentle-reset';
    return 'check-in-first';
  }

  if (gapBand === 'long') return 'welcome-back';
  if (gapBand === 'short') return 'gentle-reset';

  if (momentumBand === 'strong' && energyBand === 'low') return 'protect-momentum';
  if (momentumBand === 'strong') return 'build-momentum';

  if (momentumBand === 'light' && energyBand === 'low') return 'start-small';
  if (momentumBand === 'light') return 'reset-week';

  if (energyBand === 'low') return 'low-energy';
  if (energyBand === 'high' && workoutState !== 'complete') return 'high-energy-move';

  return 'steady-day';
}