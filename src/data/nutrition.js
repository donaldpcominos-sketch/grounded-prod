// src/data/nutrition.js
// Suggestion pools keyed by energy level.
// Each suggestion: { id, label, desc, tags[] }

export const NUTRITION_SUGGESTIONS = {

  low: [
    {
      id: 'salmon-rice',
      label: 'Salmon on rice',
      desc: 'Soft, nourishing — omega-3s to support your body when energy is low.',
      tags: ['fish', 'warm', 'easy']
    },
    {
      id: 'soft-boiled-eggs-toast',
      label: 'Soft-boiled eggs with toast',
      desc: 'Quick protein hit with slow-burn carbs. No fuss.',
      tags: ['eggs', 'easy', 'warm']
    },
    {
      id: 'poke-bowl',
      label: 'Poke bowl',
      desc: 'Fresh white fish or salmon over rice — cool, light, restorative.',
      tags: ['fish', 'fresh', 'no-cook']
    },
    {
      id: 'chicken-soup',
      label: 'Chicken soup or broth',
      desc: 'Warming and gentle. Easier to digest when you\'re running low.',
      tags: ['chicken', 'warm', 'gentle']
    },
    {
      id: 'yoghurt-berries',
      label: 'Greek yoghurt + berries',
      desc: 'Cool, creamy, quick. Protein and antioxidants in under two minutes.',
      tags: ['dairy', 'cold', 'fast']
    },
    {
      id: 'banana-nut-butter',
      label: 'Banana + nut butter',
      desc: 'Natural sugars with healthy fat — a gentle lift when you need it.',
      tags: ['fruit', 'fast', 'no-cook']
    }
  ],

  medium: [
    {
      id: 'chicken-greens',
      label: 'Chicken and greens',
      desc: 'Grilled chicken with spinach or broccolini. Simple and sustaining.',
      tags: ['chicken', 'warm', 'balanced']
    },
    {
      id: 'fish-tacos',
      label: 'White fish tacos',
      desc: 'Light and fresh — a little avocado, some slaw, good energy.',
      tags: ['fish', 'fresh', 'flavourful']
    },
    {
      id: 'grain-bowl',
      label: 'Grain bowl',
      desc: 'Farro or quinoa, roasted veg, a soft egg. Satisfying without heavy.',
      tags: ['grains', 'balanced', 'warm']
    },
    {
      id: 'stir-fry-rice',
      label: 'Stir-fry with rice',
      desc: 'Quick, flexible — whatever veg and protein you have on hand.',
      tags: ['flexible', 'warm', 'fast']
    },
    {
      id: 'avocado-toast-eggs',
      label: 'Avocado toast + eggs',
      desc: 'Healthy fat, protein, whole grain. A solid mid-energy base.',
      tags: ['eggs', 'easy', 'balanced']
    },
    {
      id: 'poke-bowl',
      label: 'Poke bowl',
      desc: 'Salmon or tuna over rice — fresh, no-cook, nourishing.',
      tags: ['fish', 'fresh', 'no-cook']
    }
  ],

  high: [
    {
      id: 'chicken-greens-extra',
      label: 'Chicken and greens (larger portion)',
      desc: 'More protein, more greens — fuel for an active day.',
      tags: ['chicken', 'warm', 'fuel']
    },
    {
      id: 'stir-fry-rice',
      label: 'Stir-fry with rice',
      desc: 'Fast to make, satisfying — good pre- or post-activity.',
      tags: ['flexible', 'warm', 'fuel']
    },
    {
      id: 'grain-bowl-loaded',
      label: 'Loaded grain bowl',
      desc: 'Add extra protein — chicken, egg, or salmon on top of grains and roasted veg.',
      tags: ['grains', 'balanced', 'fuel']
    },
    {
      id: 'salmon-sweet-potato',
      label: 'Salmon + sweet potato',
      desc: 'Complex carbs and omega-3s — pre-workout favourite.',
      tags: ['fish', 'warm', 'fuel']
    },
    {
      id: 'fish-tacos',
      label: 'Fish tacos',
      desc: 'Light but sustaining — good for an active afternoon.',
      tags: ['fish', 'fresh', 'flavourful']
    }
  ]

};

/**
 * Get 2–3 suggestions for a given energy level.
 * Falls back to medium if energy is unset or unrecognised.
 * Uses a daily seed so suggestions feel fresh each day.
 */
export function getSuggestionsForEnergy(energy = 'medium', count = 3) {
  const pool = NUTRITION_SUGGESTIONS[energy] || NUTRITION_SUGGESTIONS.medium;

  // Day-based seed for gentle daily rotation
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const start = seed % pool.length;

  const result = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    result.push(pool[(start + i) % pool.length]);
  }
  return result;
}
