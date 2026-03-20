function placeholderView(title, subtitle, emoji) {
  return {
    async init(container) {
      container.innerHTML = `
        <main class="view-scroll">
          <div class="view-inner">
            <div class="placeholder-view">
              <p class="placeholder-emoji">${emoji}</p>
              <h2 class="placeholder-title">${title}</h2>
              <p class="placeholder-subtitle">${subtitle}</p>
            </div>
          </div>
        </main>
      `;
    }
  };
}

export const WorkoutsView = placeholderView(
  'Workouts',
  'Your training plan is on its way.',
  '🏋️'
);

export const JournalView = placeholderView(
  'Journal',
  'Your full journal history will live here.',
  '📖'
);

export const NicoView = placeholderView(
  'Nico',
  'Activities and ideas for Nico, coming soon.',
  '🌿'
);

export const ProfileView = placeholderView(
  'Profile',
  'Your profile and preferences.',
  '✨'
);
