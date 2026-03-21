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
      shopping.js       ← solo + shared shopping list
    views/
      today.js
      workouts.js
      journal.js
      profile.js
      nico.js
      onboarding.js
      shopping.js
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
  .nicoBirthday ('YYYY-MM-DD' | null)   ← added Chunk C
  .lastActiveAt (timestamp)
  .reminderEnabled (bool)
  .reminderTime ('HH:MM')               ← default '20:00'
  .fcmToken (string | null)
  .sharedListId (string | null)         ← 6-char code of linked shared list

users/{userId}/wellnessCheckins/{date}
users/{userId}/journalEntries/{date}
users/{userId}/workoutSessions/{date}
users/{userId}/nicoLogs/{date}
  .naps[]                  ← [{ start: 'HH:MM', end: 'HH:MM' }]
  .completedActivities[]   ← ['activity-id', ...]
users/{userId}/nutritionLogs/{date}
  .nourished (bool)
  .note (string)
users/{userId}/shoppingList/{itemId}
  .text, .ticked, .createdAt

sharedLists/{listId}
  .members[]               ← [uid1, uid2]
  .createdAt
sharedLists/{listId}/items/{itemId}
  .text, .ticked, .createdAt
```

---

## Firestore security rules

**Current rules (updated Chunk A — paste these into Firebase Console):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Per-user data — only the owner can read/write
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Shared shopping lists
    match /sharedLists/{listId} {

      // Any signed-in user can read a single list doc (needed to validate a join code)
      allow get: if request.auth != null;

      // Only members can query the collection
      allow list: if request.auth != null
        && request.auth.uid in resource.data.members;

      // Members can update or delete
      allow update, delete: if request.auth != null
        && request.auth.uid in resource.data.members;

      // Allow creating a new list
      allow create: if request.auth != null
        && request.auth.uid in request.resource.data.members;

      // Allow a non-member to join — they can only add their own UID to members,
      // the list must have fewer than 2 members, and nothing else changes
      allow update: if request.auth != null
        && resource.data.members.size() < 2
        && request.resource.data.members.hasAll(resource.data.members)
        && request.resource.data.members.size() == resource.data.members.size() + 1
        && request.auth.uid in request.resource.data.members;

      // Items subcollection — members only
      match /items/{itemId} {
        allow read, write: if request.auth != null
          && exists(/databases/$(database)/documents/sharedLists/$(listId))
          && request.auth.uid in get(/databases/$(database)/documents/sharedLists/$(listId)).data.members;
      }
    }

  }
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
| 12 | Production readiness pass + polish | ✅ DONE |
| A | Fix shared shopping list (Firestore rules) | ✅ DONE — Firebase Console only, no code change |

---

## Upcoming chunks

| Chunk | What | Size |
|---|---|---|
| B | Habits overhaul + 8pm reminder default | Medium |
| C | Nico improvements (nap stats, birthday picker, solids guide) | Medium |
| D | Workout fixes (push-day bug, week preview, day-swap) | Medium-Large |
| E | Today page audit (safe walking times, wellness suggestion) | Small-Medium |
| F | Book tracker (new module) | Large |
| G | Nutrition overhaul — session 1: macro onboarding + foods | Large |
| G2 | Nutrition overhaul — session 2: meal plan + swap + feedback | Large |
| H | Structural / multi-user refactor (baby tracker toggle, etc.) | Large |

---

## Chunk A notes — Shared shopping list fix

**Root cause:** `sharedLists` is a top-level Firestore collection with no security rule. Firestore blocks all reads/writes by default, causing "could not create list" error.

**Fix:** Updated Firestore rules in Firebase Console (see rules section above). No code changes required.
(NOTE THIS HAS BEEN FIXED)
---

## Chunk B scope (next session)

- Remove habits: "10min outside", "20min to myself"
- Rename: "Screen free wind down" → "1hr no phone time"
- Rename: "Call or text a friend" → "Send Love 📱"
- Add habits: No alcohol, 10k steps, 3L water
- Animated gold crown inline when all habits complete for the day
- Set default reminder time to 8pm (in profile/notifications setup)

---

## Chunk C scope

- Nico nap summary: total nap time for last 5 days shown as mini-stat row
- Replace `nicoAgeMonths` manual input with birthday picker — age auto-calculated
- Solids introduction guide: age-appropriate foods + guidance starting at 6 months, progresses as Nico ages

---

## Chunk D scope

- Fix "push training to next day" — button does nothing (silent failure, likely async throw or missing element bind)
- Week plan preview: see upcoming workout days from the workouts view
- Day-swap: ability to swap two days in the weekly schedule

---

## Chunk E scope

- Restore safe walking times widget on Today page (disappeared after back-to-back deploys — regression to diagnose in `today.js` / `weather.js`)
- Add daily wellness/mental health/mood booster suggestion to Today page

---

## Chunk F scope (Book tracker — new module)

New `views/books.js` + `services/books.js`. Features:
- Statuses: Currently reading / Not yet started / Finished / Chose not to finish
- Start + finish dates, reading goals with deadline prompts
- Multiple books in progress at once
- Finished book history (clean, elegant)
- Stats: books per year, streak, pages
- Star/love/dislike rating after finishing
- Wishlist of books to read next
- AI suggestions based on finished books (uses Claude API, same pattern as Nico)
- New nav entry; new Firestore subcollection `users/{userId}/books/{bookId}`

---

## Chunk G scope (Nutrition overhaul — 2 sessions)

Session 1: AI nutritionist onboarding (runs every 4 weeks), preferred foods list (up to 50), 10 food-goal questions, non-negotiable meal entry with macros + meal slot.
Session 2: AI-generated weekly meal plan view, swap individual meals, end-of-week feedback loop, focus foods management in profile.

---

## Chunk H scope (Future — structural)

- Nico / baby tracker module becomes optional toggle in profile
- Remove Cicely-specific hardcoding (Greystanes, Woolworths) → move to user preferences
- Garmin sync research (requires OAuth, separate investigation)

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

## Chunk 12 notes — Production readiness + polish

**Polish delivered:**
- Nap list now sorts by start time (not log order)
- Profile "Your progress" → "Workout progress", "Current streak" → "Workout streak"
- Exercise card: rest time stat added (derived from intensity), intensity dots added inline
- Substitute overlay enriched: intensity dots + equipment shown per option

**Still manual / operational:**
- Deploy Cloud Function (see Chunk 11 notes)
- Run Lighthouse on mobile
- Test on real iOS + Android devices
- Confirm Netlify env vars and Firestore rules are live

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
- Age-band filtering via `nicoAgeMonths` set in Profile (to be replaced by birthday picker in Chunk C)
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
