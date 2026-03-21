/**
 * content/todayCopyMap.js — Today Copy Map
 *
 * Phase 4 (Copy): Single source of truth for all Today surface copy.
 * Structure: state → continuityTag → variantBranch → { headline, reassurance, status }
 *
 * Variant branches:
 *   base     — default
 *   drift    — user at risk of drifting (internal signal; same emotional register)
 *   flatDay  — unremarkable LOW_CAPACITY day (slightly warmer phrasing)
 *
 * Rules:
 *   - No advice, no direction, no improvement language
 *   - No implied expectation
 *   - Fallback must remain safe and non-directive
 *   - Drift copy is not more urgent — it is equally soft
 *   - All variants read as: this is enough as it is
 */




// ─── Map ──────────────────────────────────────────────────────────────────────

export const TODAY_COPY_MAP = Object.freeze({

  // ── SURVIVAL ──────────────────────────────────────────────────────────────

  'SURVIVAL': {
    'SUSTAINED_HARD': {
      base: {
        headline:    'Today is a survival day',
        reassurance: 'There\'s nothing that needs doing right now.',
        status:      null,
      },
      drift: {
        headline:    'Today is a survival day',
        reassurance: 'There\'s nothing that needs doing right now.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is a survival day',
        reassurance: 'There\'s nothing that needs doing right now.',
        status:      null,
      },
    },
    'DECLINING': {
      base: {
        headline:    'Today is a hard day',
        reassurance: 'That\'s all this needs to be.',
        status:      null,
      },
      drift: {
        headline:    'Today is a hard day',
        reassurance: 'That\'s all this needs to be.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is a hard day',
        reassurance: 'That\'s all this needs to be.',
        status:      null,
      },
    },
    'NEUTRAL': {
      base: {
        headline:    'Today is a survival day',
        reassurance: 'This is enough.',
        status:      null,
      },
      drift: {
        headline:    'Today is a survival day',
        reassurance: 'This is enough.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is a survival day',
        reassurance: 'This is enough.',
        status:      null,
      },
    },
    'IMPROVING': {
      base: {
        headline:    'Today is harder',
        reassurance: 'That\'s allowed.',
        status:      null,
      },
      drift: {
        headline:    'Today is harder',
        reassurance: 'That\'s allowed.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is harder',
        reassurance: 'That\'s allowed.',
        status:      null,
      },
    },
    'SUSTAINED_STABLE': {
      base: {
        headline:    'Today is a harder day',
        reassurance: 'Even stable periods have hard days.',
        status:      null,
      },
      drift: {
        headline:    'Today is a harder day',
        reassurance: 'Even stable periods have hard days.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is a harder day',
        reassurance: 'Even stable periods have hard days.',
        status:      null,
      },
    },
  },

  // ── LOW_CAPACITY ──────────────────────────────────────────────────────────

  'LOW_CAPACITY': {
    'SUSTAINED_HARD': {
      base: {
        headline:    'Today is a low-capacity day',
        reassurance: 'Low capacity is still capacity.',
        status:      null,
      },
      drift: {
        headline:    'Today is a low-capacity day',
        reassurance: 'Low capacity is still capacity.',
        status:      null,
      },
      flatDay: {
        headline:    'A quiet kind of day',
        reassurance: 'Low capacity is still capacity.',
        status:      null,
      },
    },
    'DECLINING': {
      base: {
        headline:    'Today is a heavy day',
        reassurance: 'That\'s not a failure.',
        status:      null,
      },
      drift: {
        headline:    'Today is a heavy day',
        reassurance: 'That\'s not a failure.',
        status:      null,
      },
      flatDay: {
        headline:    'A low-capacity kind of day',
        reassurance: 'That\'s not a failure.',
        status:      null,
      },
    },
    'IMPROVING': {
      base: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough.',
        status:      null,
      },
      drift: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough.',
        status:      null,
      },
      flatDay: {
        headline:    'A quieter kind of day',
        reassurance: 'This is enough.',
        status:      null,
      },
    },
    'SUSTAINED_STABLE': {
      base: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
      drift: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
      flatDay: {
        headline:    'A still kind of day',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
    },
    'NEUTRAL': {
      base: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough.',
        status:      null,
      },
      drift: {
        headline:    'Today is a low-capacity day',
        reassurance: 'This is enough.',
        status:      null,
      },
      flatDay: {
        headline:    'A quiet kind of day',
        reassurance: 'That\'s fine.',
        status:      null,
      },
    },
  },

  // ── STABLE ────────────────────────────────────────────────────────────────

  'STABLE': {
    'SUSTAINED_STABLE': {
      base: {
        headline:    'Today feels like today',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
      drift: {
        headline:    'Today feels like today',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
      flatDay: {
        headline:    'A quiet kind of day',
        reassurance: 'This is enough as it is.',
        status:      null,
      },
    },
    'IMPROVING': {
      base: {
        headline:    'Today is a stable day',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
      drift: {
        headline:    'Today is a stable day',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
      flatDay: {
        headline:    'A quieter kind of day',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
    },
    'NEUTRAL': {
      base: {
        headline:    'Today is here',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
      drift: {
        headline:    'Today is here',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
      flatDay: {
        headline:    'A quieter kind of day',
        reassurance: 'There\'s capacity here.',
        status:      null,
      },
    },
    'DECLINING': {
      base: {
        headline:    'Today is what it is',
        reassurance: 'Capacity isn\'t constant.',
        status:      null,
      },
      drift: {
        headline:    'Today is what it is',
        reassurance: 'Capacity isn\'t constant.',
        status:      null,
      },
      flatDay: {
        headline:    'A quieter stable day',
        reassurance: 'Capacity isn\'t constant.',
        status:      null,
      },
    },
    'SUSTAINED_HARD': {
      base: {
        headline:    'Today is a stable day',
        reassurance: 'This is what today is.',
        status:      null,
      },
      drift: {
        headline:    'Today is a stable day',
        reassurance: 'This is what today is.',
        status:      null,
      },
      flatDay: {
        headline:    'Today is a stable day',
        reassurance: 'This is what today is.',
        status:      null,
      },
    },
  },
});

// ─── Night copy (state-independent) ──────────────────────────────────────────

export const NIGHT_COPY = Object.freeze({
  headline:    'Still here with you',
  reassurance: 'Nothing needs doing.',
  status:      null,
});

// ─── Safe fallback ────────────────────────────────────────────────────────────

export const FALLBACK_COPY = Object.freeze({
  headline:    'Today is what it is',
  reassurance: 'That\'s enough.',
  status:      null,
});
