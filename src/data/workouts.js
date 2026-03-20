/**
 * Grounded — Workout Data
 *
 * Weekly split:
 *   Mon → Lower Body (Glute Focus)
 *   Tue → Upper Body
 *   Wed → Full Body Conditioning
 *   Thu → Lower Body (Glute Focus)
 *   Fri → Incline Walk + Core
 *   Sat → Full Body Conditioning
 *   Sun → Recovery / Mobility
 *
 * Each day has a POOL of exercises larger than the session needs.
 * The day-seed rotates which subset is shown, keeping it fresh.
 */

// ─── Exercise pools ────────────────────────────────────────────────────────────

const LOWER_BODY_GLUTE = [
  {
    id: 'rdl',
    name: 'Romanian Deadlift',
    muscle: 'Glutes · Hamstrings',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12',
    tempo: '3-1-1',
    cue: 'Hinge at the hips, soft bend in knees. Feel the stretch in your hamstrings before driving through your glutes to stand.',
    intensity: 'medium'
  },
  {
    id: 'hip-thrust-db',
    name: 'Dumbbell Hip Thrust',
    muscle: 'Glutes',
    equipment: 'Dumbbells',
    sets: 4,
    reps: '12–15',
    tempo: '2-2-1',
    cue: 'Drive through your heels, squeeze at the top for a full second. Keep your chin tucked.',
    intensity: 'medium'
  },
  {
    id: 'sumo-squat',
    name: 'Sumo Squat',
    muscle: 'Glutes · Inner Thighs',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12–15',
    tempo: '3-1-1',
    cue: 'Wide stance, toes out. Sit deep, push knees out over toes.',
    intensity: 'medium'
  },
  {
    id: 'curtsy-lunge',
    name: 'Curtsy Lunge',
    muscle: 'Glutes · Outer Hip',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10 each side',
    tempo: '2-1-2',
    cue: 'Step back and across. Keep front knee tracking over toes.',
    intensity: 'medium'
  },
  {
    id: 'glute-bridge-band',
    name: 'Banded Glute Bridge',
    muscle: 'Glutes',
    equipment: 'Resistance band',
    sets: 3,
    reps: '15–20',
    tempo: '2-2-1',
    cue: 'Band just above knees. Press knees out against the band as you drive up.',
    intensity: 'low'
  },
  {
    id: 'single-leg-rdl',
    name: 'Single-Leg RDL',
    muscle: 'Glutes · Hamstrings · Balance',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '8 each side',
    tempo: '3-1-2',
    cue: 'Soft pivot at the hip. Keep hips square to the floor.',
    intensity: 'medium'
  },
  {
    id: 'step-up',
    name: 'Dumbbell Step-Up',
    muscle: 'Glutes · Quads',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10 each side',
    tempo: '2-1-2',
    cue: 'Drive through the heel of your front foot. Don\'t push off the back foot.',
    intensity: 'medium'
  },
  {
    id: 'fire-hydrant',
    name: 'Fire Hydrant',
    muscle: 'Glute Med · Outer Hip',
    equipment: 'Resistance band',
    sets: 3,
    reps: '15 each side',
    tempo: '2-1-2',
    cue: 'Keep hips stable. Lift from the hip, not the waist.',
    intensity: 'low'
  },
  {
    id: 'squat-band-pulse',
    name: 'Banded Squat Pulse',
    muscle: 'Glutes · Quads',
    equipment: 'Resistance band',
    sets: 3,
    reps: '20 pulses',
    tempo: 'Controlled',
    cue: 'Stay low in the squat. Small pulses at the bottom of the range.',
    intensity: 'low'
  },
  {
    id: 'reverse-lunge',
    name: 'Reverse Lunge',
    muscle: 'Glutes · Quads',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10 each side',
    tempo: '2-1-2',
    cue: 'Step back controlled. Front shin stays vertical. Drive through front heel to return.',
    intensity: 'medium'
  }
];

const UPPER_BODY = [
  {
    id: 'db-row',
    name: 'Single-Arm Dumbbell Row',
    muscle: 'Back · Biceps',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12 each side',
    tempo: '2-1-2',
    cue: 'Elbow drives back and up. Squeeze at the top. Don\'t rotate your torso.',
    intensity: 'medium'
  },
  {
    id: 'shoulder-press',
    name: 'Overhead Shoulder Press',
    muscle: 'Shoulders',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12',
    tempo: '2-1-2',
    cue: 'Press straight up. Don\'t arch your lower back — brace your core throughout.',
    intensity: 'medium'
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    muscle: 'Shoulders · Delts',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12–15',
    tempo: '2-1-3',
    cue: 'Lead with your elbows, not your wrists. Slow lower. Slight forward lean.',
    intensity: 'low'
  },
  {
    id: 'chest-press',
    name: 'Dumbbell Chest Press',
    muscle: 'Chest · Triceps',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12',
    tempo: '3-1-2',
    cue: 'Lower slowly, feel the stretch. Press up and slightly in.',
    intensity: 'medium'
  },
  {
    id: 'bicep-curl',
    name: 'Bicep Curl',
    muscle: 'Biceps',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12–15',
    tempo: '2-1-3',
    cue: 'Keep elbows pinned to your sides. Squeeze at the top, slow lower.',
    intensity: 'low'
  },
  {
    id: 'tricep-kickback',
    name: 'Tricep Kickback',
    muscle: 'Triceps',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12–15',
    tempo: '2-1-3',
    cue: 'Hinge forward. Upper arm stays parallel to the floor. Full extension.',
    intensity: 'low'
  },
  {
    id: 'front-raise',
    name: 'Front Raise',
    muscle: 'Front Delts',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12',
    tempo: '2-1-3',
    cue: 'Controlled all the way up and down. Don\'t swing.',
    intensity: 'low'
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    muscle: 'Rear Delts · Upper Back',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '12–15',
    tempo: '2-1-3',
    cue: 'Hinge forward 45°. Lead with elbows, squeeze shoulder blades together.',
    intensity: 'low'
  }
];

const FULL_BODY_CONDITIONING = [
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    muscle: 'Glutes · Quads · Core',
    equipment: 'Dumbbell',
    sets: 3,
    reps: '12–15',
    tempo: '3-1-1',
    cue: 'Hold dumbbell at chest. Chest tall, elbows inside knees at the bottom.',
    intensity: 'medium'
  },
  {
    id: 'db-deadlift',
    name: 'Dumbbell Deadlift',
    muscle: 'Full Posterior Chain',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12',
    tempo: '3-1-2',
    cue: 'Push the floor away. Keep bar — dumbbells — close to your legs.',
    intensity: 'medium'
  },
  {
    id: 'push-up',
    name: 'Push-Up',
    muscle: 'Chest · Triceps · Core',
    equipment: 'Bodyweight',
    sets: 3,
    reps: '8–12',
    tempo: '3-1-1',
    cue: 'Body in a straight line. Lower to hover, don\'t collapse to the floor.',
    intensity: 'medium'
  },
  {
    id: 'renegade-row',
    name: 'Renegade Row',
    muscle: 'Back · Core · Shoulders',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '8 each side',
    tempo: '2-1-2',
    cue: 'High plank. Minimise hip rotation as you row. Core tight throughout.',
    intensity: 'high'
  },
  {
    id: 'squat-press',
    name: 'Squat to Press',
    muscle: 'Full Body',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '10–12',
    tempo: '2-1-2',
    cue: 'Sit deep in the squat. As you stand, press overhead in one fluid motion.',
    intensity: 'high'
  },
  {
    id: 'db-swing',
    name: 'Dumbbell Swing',
    muscle: 'Glutes · Hamstrings · Core',
    equipment: 'Dumbbell',
    sets: 3,
    reps: '15',
    tempo: 'Explosive',
    cue: 'Hip hinge, not a squat. Power comes from the glute drive, not the arms.',
    intensity: 'high'
  },
  {
    id: 'reverse-lunge-curl',
    name: 'Reverse Lunge to Curl',
    muscle: 'Glutes · Quads · Biceps',
    equipment: 'Dumbbells',
    sets: 3,
    reps: '8 each side',
    tempo: '2-1-2',
    cue: 'Step back, lower with control. Curl as you return to standing.',
    intensity: 'medium'
  },
  {
    id: 'plank-shoulder-tap',
    name: 'Plank Shoulder Tap',
    muscle: 'Core · Shoulders',
    equipment: 'Bodyweight',
    sets: 3,
    reps: '20 taps',
    tempo: 'Controlled',
    cue: 'Feet wide for stability. Keep hips as still as possible.',
    intensity: 'medium'
  }
];

const CORE_EXERCISES = [
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    muscle: 'Deep Core',
    equipment: 'Bodyweight',
    sets: 3,
    reps: '8 each side',
    tempo: '3-1-3',
    cue: 'Lower back pressed into the floor throughout. Move slowly and breathe out as you extend.',
    intensity: 'low'
  },
  {
    id: 'hollow-hold',
    name: 'Hollow Hold',
    muscle: 'Core',
    equipment: 'Bodyweight',
    sets: 3,
    reps: '20–30 sec',
    tempo: 'Hold',
    cue: 'Lower back into the floor. Arms and legs long. Think about pulling your belly button to your spine.',
    intensity: 'medium'
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    muscle: 'Obliques · Core',
    equipment: 'Dumbbell',
    sets: 3,
    reps: '20 total',
    tempo: 'Controlled',
    cue: 'Feet off the floor for more challenge. Rotate from the ribcage, not the arms.',
    intensity: 'medium'
  },
  {
    id: 'pallof-press',
    name: 'Pallof Press',
    muscle: 'Anti-Rotation Core',
    equipment: 'Resistance band',
    sets: 3,
    reps: '10 each side',
    tempo: '2-2-2',
    cue: 'Anchor band at chest height. Press out and resist the pull. Core stays braced.',
    intensity: 'low'
  },
  {
    id: 'leg-lower',
    name: 'Leg Lower',
    muscle: 'Lower Abs',
    equipment: 'Bodyweight',
    sets: 3,
    reps: '10',
    tempo: '4-1-1',
    cue: 'Lower back stays flat. Lower both legs slowly, stop before you arch.',
    intensity: 'medium'
  },
  {
    id: 'side-plank',
    name: 'Side Plank',
    muscle: 'Obliques · Glute Med',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '30 sec each side',
    tempo: 'Hold',
    cue: 'Stack feet or stagger for balance. Drive hips up — don\'t sag.',
    intensity: 'medium'
  }
];

const MOBILITY_EXERCISES = [
  {
    id: 'hip-flexor-stretch',
    name: 'Hip Flexor Stretch',
    muscle: 'Hip Flexors',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '45 sec each side',
    tempo: 'Hold',
    cue: 'Low lunge. Tuck pelvis slightly and feel the stretch through the front of the back hip.',
    intensity: 'low'
  },
  {
    id: 'pigeon-pose',
    name: 'Pigeon Pose',
    muscle: 'Glutes · Piriformis',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '60 sec each side',
    tempo: 'Hold',
    cue: 'Let the hip completely relax. Breathe into the tension.',
    intensity: 'low'
  },
  {
    id: 'worlds-greatest',
    name: "World's Greatest Stretch",
    muscle: 'Full Body Mobility',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '5 each side',
    tempo: 'Slow flow',
    cue: 'Lunge, hand inside foot, rotate and reach up. Move through your full range.',
    intensity: 'low'
  },
  {
    id: 'cat-cow',
    name: 'Cat-Cow',
    muscle: 'Spine · Core',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '10 slow breaths',
    tempo: 'Breath',
    cue: 'Inhale to arch (cow), exhale to round (cat). Let your breath drive the movement.',
    intensity: 'low'
  },
  {
    id: 'thread-needle',
    name: 'Thread the Needle',
    muscle: 'Upper Back · Shoulders',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '8 each side',
    tempo: 'Slow',
    cue: 'From all-fours. Thread one arm under your body. Let your shoulder open to the floor.',
    intensity: 'low'
  },
  {
    id: 'glute-stretch',
    name: 'Figure Four Glute Stretch',
    muscle: 'Glutes',
    equipment: 'Bodyweight',
    sets: 2,
    reps: '45 sec each side',
    tempo: 'Hold',
    cue: 'On your back. Cross ankle over opposite knee. Pull both legs toward your chest.',
    intensity: 'low'
  }
];

// ─── Weekly split definition ───────────────────────────────────────────────────

export const WEEKLY_SPLIT = {
  1: { // Monday
    type: 'lower',
    label: 'Lower Body',
    focus: 'Glute Focus',
    color: 'warm',
    pool: LOWER_BODY_GLUTE,
    corePool: CORE_EXERCISES,
    sessionCount: { short: 5, standard: 7 }, // exercises from pool
    includeCoreCount: { short: 1, standard: 2 }
  },
  2: { // Tuesday
    type: 'upper',
    label: 'Upper Body',
    focus: 'Tone + Strength',
    color: 'cool',
    pool: UPPER_BODY,
    corePool: CORE_EXERCISES,
    sessionCount: { short: 4, standard: 6 },
    includeCoreCount: { short: 1, standard: 1 }
  },
  3: { // Wednesday
    type: 'full',
    label: 'Full Body',
    focus: 'Conditioning',
    color: 'neutral',
    pool: FULL_BODY_CONDITIONING,
    corePool: CORE_EXERCISES,
    sessionCount: { short: 4, standard: 6 },
    includeCoreCount: { short: 1, standard: 2 }
  },
  4: { // Thursday
    type: 'lower',
    label: 'Lower Body',
    focus: 'Glute Focus',
    color: 'warm',
    pool: LOWER_BODY_GLUTE,
    corePool: CORE_EXERCISES,
    sessionCount: { short: 5, standard: 7 },
    includeCoreCount: { short: 1, standard: 2 }
  },
  5: { // Friday
    type: 'cardio-core',
    label: 'Cardio + Core',
    focus: 'Incline Walk',
    color: 'green',
    pool: CORE_EXERCISES,
    corePool: [],
    sessionCount: { short: 3, standard: 5 },
    includeCoreCount: { short: 0, standard: 0 }
  },
  6: { // Saturday
    type: 'full',
    label: 'Full Body',
    focus: 'Conditioning',
    color: 'neutral',
    pool: FULL_BODY_CONDITIONING,
    corePool: CORE_EXERCISES,
    sessionCount: { short: 4, standard: 6 },
    includeCoreCount: { short: 1, standard: 2 }
  },
  0: { // Sunday
    type: 'recovery',
    label: 'Recovery',
    focus: 'Mobility',
    color: 'soft',
    pool: MOBILITY_EXERCISES,
    corePool: [],
    sessionCount: { short: 4, standard: 6 },
    includeCoreCount: { short: 0, standard: 0 }
  }
};

// ─── Treadmill block (Friday) ─────────────────────────────────────────────────

export const INCLINE_WALK_BLOCK = {
  label: 'Incline Treadmill Walk',
  duration: { short: '20 min', standard: '30 min' },
  protocol: [
    { time: '0–3 min', incline: '4%', speed: '5.5 km/h', note: 'Warm up, find your stride' },
    { time: '3–8 min', incline: '8%', speed: '5.5 km/h', note: 'Build into it' },
    { time: '8–15 min', incline: '10–12%', speed: '5.5–6 km/h', note: 'Working zone — stay tall' },
    { time: '15–18 min', incline: '6%', speed: '5.5 km/h', note: 'Ease off' },
    { time: '18–20 min', incline: '2%', speed: '5 km/h', note: 'Cool down' }
  ]
};

// ─── Session builder ───────────────────────────────────────────────────────────

/**
 * Returns a seeded-random selection from an array.
 * Same seed = same result. Changes daily.
 */
function seededSelect(arr, count, seed) {
  if (count >= arr.length) return [...arr];
  const shuffled = [...arr].sort((a, b) => {
    const ha = Math.sin(seed + a.id.charCodeAt(0)) * 10000;
    const hb = Math.sin(seed + b.id.charCodeAt(0)) * 10000;
    return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
  });
  return shuffled.slice(0, count);
}

export function buildSession(dayOfWeek, mode, daySeed) {
  const split = WEEKLY_SPLIT[dayOfWeek];
  if (!split) return null;

  const length = mode === 'quick' ? 'short' : 'standard';
  const exerciseCount = split.sessionCount[length];
  const coreCount = split.includeCoreCount[length];

  const mainExercises = seededSelect(split.pool, exerciseCount, daySeed);
  const coreExercises = coreCount > 0
    ? seededSelect(split.corePool, coreCount, daySeed + 999)
    : [];

  return {
    dayOfWeek,
    type: split.type,
    label: split.label,
    focus: split.focus,
    mode,
    exercises: [...mainExercises, ...coreExercises],
    estimatedTime: mode === 'quick' ? '20–25 min' : '35–45 min',
    inclineBlock: split.type === 'cardio-core' ? INCLINE_WALK_BLOCK : null
  };
}

// ─── Week plan overview (for the plan tab) ────────────────────────────────────

export function getWeekPlan() {
  const today = new Date().getDay(); // 0 = Sun
  return [1, 2, 3, 4, 5, 6, 0].map(day => {
    const split = WEEKLY_SPLIT[day];
    return {
      day,
      ...split,
      isToday: day === today
    };
  });
}

export const DAY_NAMES = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday'
};

export const DAY_SHORT = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed',
  4: 'Thu', 5: 'Fri', 6: 'Sat'
};

export const TYPE_LABELS = {
  lower: 'Lower Body',
  upper: 'Upper Body',
  full: 'Full Body',
  'cardio-core': 'Cardio + Core',
  recovery: 'Recovery'
};
