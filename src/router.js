/**
 * Minimal view router.
 * Views are plain objects: { init(container, user) }
 * The router owns a single container element and swaps views into it.
 */

const routes = {};
let currentView = null;
let currentUser = null;
let viewContainer = null;

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

  // Update active nav tab if shell is present
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('nav-active', el.dataset.nav === name);
  });

  currentView = name;
  viewContainer.innerHTML = '';
  await view.init(viewContainer, currentUser);
}

export function getCurrentView() {
  return currentView;
}
