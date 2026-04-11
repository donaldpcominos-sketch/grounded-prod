/**
 * Minimal view router.
 * Views are plain objects: { init(container, user) }
 * The router owns a single container element and swaps views into it.
 */

const routes = {};
let currentView = null;
let currentUser = null;
let viewContainer = null;

// Maps route name → nav position index for directional slide transitions.
// Navigating to a higher index slides in from the right; lower from the left.
const NAV_ORDER = {
  'today':    0,
  'habits':   1,
  'workouts': 2,
  'nico':     3,
  'profile':  4,
};

export function registerRoute(name, view) {
  routes[name] = view;
}

export function setViewContainer(el) {
  viewContainer = el;
}

export function setUser(user) {
  currentUser = user;
}

export async function navigateTo(name) {
  const view = routes[name];
  if (!view) {
    console.error(`[Router] No route registered for "${name}"`);
    return;
  }

  // Set slide direction on container before clearing — CSS picks it up on the
  // new .view-scroll element that init() renders inside.
  const prevIdx = NAV_ORDER[currentView] ?? -1;
  const nextIdx = NAV_ORDER[name]        ?? -1;

  if (prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx) {
    viewContainer.dataset.slideDir = nextIdx > prevIdx ? 'right' : 'left';
  } else {
    delete viewContainer.dataset.slideDir;
  }

  // Update active nav tab if shell is present
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('nav-active', el.dataset.nav === name);
  });

  currentView = name;
  if (typeof viewContainer._groundedCleanup === 'function') {
    viewContainer._groundedCleanup();
    viewContainer._groundedCleanup = null;
  }
  viewContainer.innerHTML = '';
  await view.init(viewContainer, currentUser);
}

export function getCurrentView() {
  return currentView;
}
