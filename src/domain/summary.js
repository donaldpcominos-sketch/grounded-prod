// src/domain/summary.js
import { getDayContext } from './dayContext.js';

export function getTodaySummary(state) {
  if (!state) return '';

  const context = getDayContext(state);

  switch (context.tone) {
    case 'welcome-back':
      if (context.energyBand === 'low') {
        return 'Welcome back — low energy is okay. Keep things simple and aim for one small win.';
      }
      if (context.energyBand === 'high') {
        return 'Welcome back — there is good energy here. Ease back in and keep it steady.';
      }
      return 'Welcome back — ease into the day and let a couple of small wins be enough.';

    case 'gentle-reset':
      if (context.needsCheckIn) {
        return 'A quick check-in is a gentle way to reset today.';
      }
      if (context.energyBand === 'low') {
        return 'A softer day is okay — reset gently and keep expectations light.';
      }
      return 'A gentle reset still counts — keep the day simple and steady.';

    case 'check-in-first':
      return 'Start with a quick check-in to shape your day.';

    case 'protect-momentum':
      return 'You have already built good momentum this week — let today be lighter if you need it.';

    case 'build-momentum':
      if (context.workoutState === 'complete') {
        return 'You are in a good rhythm this week — nice work keeping that momentum going.';
      }
      return 'You are building a nice rhythm this week — today is a good chance to keep that momentum going.';

    case 'start-small':
      return 'It has been a quieter week, so keep today simple and start small.';

    case 'reset-week':
      if (context.workoutState !== 'complete') {
        return 'A small reset today could help shift the tone of the week.';
      }
      return 'Even a gentle day helps rebuild momentum.';

    case 'low-energy':
      if (context.workoutState === 'complete') {
        return 'You have already moved today — keep everything else light.';
      }
      return 'Low energy today — keep things simple and focus on one or two small wins.';

    case 'high-energy-move':
      return 'Good energy today — this could be a great time to move your body.';

    case 'steady-day':
    default:
      if (context.workoutState !== 'complete') {
        return 'A steady day — a bit of movement and a few habits will go a long way.';
      }
      return 'Nice balance today — keep your momentum going.';
  }
}