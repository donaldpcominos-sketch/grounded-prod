# Grounded — Project Brief & Status

Drop this file into a new chat to give Claude full context on the project.

---

## What this is

A premium personal wellness SPA called **Grounded**, built as a gift for Cicely. Mobile-first, calm, editorial aesthetic. Vanilla JS + Firebase + Tailwind + Vite. Deployed live on Netlify.

---

## Live deployment

- **Hosted on:** Netlify
- **GitHub repo:** `donaldpcominos-sketch/grounded-prod` (private)
- **Workflow:** Edit files in the local `GroundedApp` folder → commit in GitHub Desktop → push to main → Netlify auto-deploys
- **Firebase project:** `cicely-wellness-hub`
- **Auth domain:** must be added to Firebase Console → Authentication → Settings → Authorised domains whenever the Netlify URL changes

---

## Tech stack

- Vite + Vanilla JS (no framework)
- Firebase Auth (Google Sign-In) + Firestore
- Tailwind CSS (minimal utility use — most styling via CSS custom properties in style.css)
- Google Fonts: DM Sans + Playfair Display

---

## Design system

- Palette: taupe/stone/sand — CSS vars in style.css (--color-bg, --color-surface, --color-ink etc.)
- Typography: DM Sans (body), Playfair Display (headings/display)
- Radius: --radius-card: 24px, --radius-btn: 16px, --radius-sm: 12px
- Tone: calm, premium, editorial, non-clinical, emotionally warm

---

## File structure

```
GroundedApp/           ← root (also the GitHub Desktop repo folder)
  index.html
  main.js
  router.js
  shell.js
  utils.js
  skeletons.js
  style.css
  sw.js                ← service worker (PWA + FCM push handler)
  manifest.json
  netlify.toml
  _redirects           ← SPA redirect rule (/* /index.html 200)
  package.json
  vite.config.js       ← note: dot not underscore
  tailwind.config.js   ← note: dot not underscore
  postcss.config.js    ← note: dot not underscore
  _env.example         ← placeholder only, real keys never committed
  src/
    lib/
      firebase.js
    data/
      workouts.js
      nutrition.js
    services/
      auth.js
      wellness.js
      journal.js
      workouts.js
      nico.js
      nutrition.js
      notifications.js  ← FCM token + reminder prefs (Chunk 11)
    views/
      today.js
      workouts.js
      journal.js
      profile.js
      nico.js
      onboarding.js
  functions/
    scheduleDailyReminders.js  ← Firebase Cloud Function (not yet deployed)
```

---

## Netlify environment variables

All set in Netlify dashboard. Never hardcode these in any file:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_VAPID_KEY        ← needed for push notifications
NODE_ENV = development          ← ensures devDependencies install on Netlify
SECRETS_SCAN_ENABLED = false    ← Firebase client keys are public by design
```

---

## Firestore structure

```
users/{userId}
  .displayName
  .email
  .photoURL
  .onboarded (bool)
  .onboardedAt
  .bannedExercises[]
  .nicoAgeMonths (number | null)
  .lastActiveAt (timestamp)
  .reminderEnabled (bool)
  .reminderTime ('HH:MM')
  .fcmToken (string | null)

users/{userId}/wellnessCheckins/{date}
users/{userId}/journalEntries/{date}
users/{userId}/workoutSessions/{date}
users/{userId}/nicoLogs/{date}
  .naps[]                  ← [{ start: 'HH:MM', end: 'HH:MM' }]
  .completedActivities[]   ← ['activity-id', ...]
users/{userId}/nutritionLogs/{date}
  .nourished (bool)
  .note (string)
```

---

## Firestore security rules

```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

---

## Completed chunks

| Chunk | What | Status |
|---|---|---|
| 1 | PWA + home screen | ✅ DONE |
| 2 | Offline + save reliability | ✅ DONE |
| 3 | Return path + welcome back messaging | ✅ DONE |
| 4 | Quick check-in widget | ✅ DONE |
| 5 | Nutrition MVP | ✅ DONE |
| 6 | Weekly progress summary | ✅ DONE |
| 7 | Workout session history | ✅ DONE |
| 8 | Journal prompt curation | ✅ DONE |
| 9 | Streak grace day + motivational copy | ✅ DONE |
| 10 | Nico age-awareness + activity filtering | ✅ DONE |
| 11 | Push notifications (daily reminder) | ✅ DONE (Cloud Function not yet deployed) |
| 12 | Production readiness pass | ⬜ NEXT |

---

## Chunk 11 notes — Push notifications

Code is complete and deployed to Netlify. One outstanding step:

**Firebase Cloud Function not yet deployed.** The function exists at `functions/scheduleDailyReminders.js` but has not been pushed to Firebase. Until it is, the Profile toggle and permission flow work, but no actual push notifications will be sent.

To deploy the Cloud Function when ready:
1. `npm install -g firebase-tools`
2. `firebase login`
3. `cd functions && npm init -y && npm install firebase-admin firebase-functions`
4. Copy `scheduleDailyReminders.js` content into `functions/index.js`
5. `firebase deploy --only functions`

---

## Chunk 12 — Production readiness pass (NEXT)

**What to do:**

**Manual test checklist:**
- [ ] Full auth flow on real iOS device (Safari)
- [ ] Full auth flow on real Android device (Chrome)
- [ ] Install to home screen on both devices
- [ ] Journal: write and save on slow connection
- [ ] Journal: attempt save in airplane mode — confirm error shows and retry works
- [ ] Workout: complete a full session including skip, substitute, and finish
- [ ] Nico: log a nap, end a nap, log a past nap
- [ ] Onboarding: clear all app data and run through as a new user
- [ ] All empty states — check every view on a fresh account
- [ ] Profile: unban an exercise, confirm it reappears in workouts
- [ ] Return message: manually set `lastActiveAt` to 3 days ago in Firestore, confirm card shows
- [ ] Push notification: toggle on in Profile, confirm permission prompt appears

**Code review:**
- [ ] Remove all `console.log` statements
- [ ] Confirm all environment variables are set in Netlify
- [ ] Confirm Firestore security rules are deployed
- [ ] Confirm `manifest.json` icons exist at all declared sizes

**Performance:**
- [ ] Run Lighthouse on mobile — target 90+ performance, 100 accessibility
- [ ] Confirm fonts load with `font-display: swap`

---

## Workout system

- Weekly split: Mon/Thu = Lower (glutes), Tue = Upper, Wed/Sat = Full Body, Fri = Cardio+Core, Sun = Recovery
- Day-seed rotation keeps exercises fresh daily
- Session modes: Quick (20 min) / Standard (35–45 min)
- Skip: once or never-again (banned, saved to Firestore)
- Substitute: shows alternatives from same muscle group
- Banned exercises filtered from all future sessions

---

## Nico module

- 20 activities across Outdoor / Indoor / Developmental types
- Energy filter: Active or Calm
- Filter pills: All / Active / Calm / Outdoor / Indoor / Learn
- Age-band filtering via `nicoAgeMonths` set in Profile
- Nap tracker: live start/end logging + retrospective past nap entry via overlay
- All persisted to `nicoLogs/{date}`
- Sydney/Greystanes local context in outdoor activities

---

## Coding standards

- Each view: self-contained `init(container, user)` pattern
- Services layer handles all Firestore ops
- CSS classes over inline styles — all CSS in `style.css` using custom property system
- No framework switches without explicit approval
- Always check strings for unescaped apostrophes inside single quotes
- `showToast(message, type, duration)` in `utils.js` is the standard status pattern
- No `console.log` in production code
- Do not break existing working features

---

## When files are changed

Always provide a table showing exactly which file to overwrite and where it lives in the folder structure. The developer is non-technical and needs precise placement instructions.

Update this brief file at the end of each chunk so it stays current for the next session.
