// src/skeletons.js
// Drop-in skeleton HTML for each view's loading state.
// Usage: container.innerHTML = Skeletons.today();

export const Skeletons = {

  today() {
    return `
      <main class="view-scroll">
        <div class="view-inner">

          <!-- Hero ring skeleton -->
          <header style="display:flex;flex-direction:column;align-items:center;padding:4px 0 24px">
            <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <div class="skeleton skeleton-line" style="width:64px;height:10px;border-radius:4px"></div>
              <div class="skeleton skeleton-avatar" style="width:36px;height:36px"></div>
            </div>
            <!-- Ring placeholder -->
            <div class="skeleton" style="width:130px;height:130px;border-radius:50%;margin-bottom:18px"></div>
            <!-- Greeting -->
            <div class="skeleton" style="width:190px;height:22px;border-radius:6px;margin-bottom:6px"></div>
            <!-- Date -->
            <div class="skeleton skeleton-line" style="width:120px;height:12px;border-radius:4px"></div>
          </header>

          <!-- Summary line -->
          <div class="skeleton skeleton-line skeleton-line--mid" style="margin-bottom:20px"></div>

          <!-- Weather card skeleton -->
          <div class="skeleton-card" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="skeleton" style="width:36px;height:36px;border-radius:50%"></div>
                <div>
                  <div class="skeleton" style="width:60px;height:20px;border-radius:5px"></div>
                  <div class="skeleton skeleton-line" style="width:90px;height:11px;margin-top:5px"></div>
                </div>
              </div>
              <div class="skeleton" style="width:44px;height:22px;border-radius:999px"></div>
            </div>
            <div class="skeleton skeleton-btn" style="margin-top:14px;height:34px"></div>
          </div>

          <!-- QCI skeleton -->
          <div class="skeleton-card" style="margin-bottom:12px;padding:18px 20px">
            <div class="skeleton" style="width:160px;height:18px;border-radius:5px;margin-bottom:16px"></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              ${[1,2,3,4].map(() => `<div class="skeleton" style="height:64px;border-radius:12px"></div>`).join('')}
            </div>
          </div>

          <!-- Card stack: workout + habits -->
          <div class="card-stack">
            <div class="skeleton-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div class="skeleton skeleton-line" style="width:100px;height:10px"></div>
                  <div class="skeleton" style="width:160px;height:18px;border-radius:5px;margin-top:8px"></div>
                  <div class="skeleton skeleton-line" style="width:200px;height:11px;margin-top:6px"></div>
                </div>
                <div class="skeleton" style="width:56px;height:24px;border-radius:999px"></div>
              </div>
            </div>
            <div class="skeleton-card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div>
                  <div class="skeleton skeleton-line" style="width:80px;height:10px"></div>
                  <div class="skeleton" style="width:60px;height:20px;border-radius:5px;margin-top:6px"></div>
                </div>
                <div class="skeleton skeleton-line" style="width:20px;height:20px;border-radius:4px"></div>
              </div>
              <div class="skeleton" style="width:100%;height:4px;border-radius:2px"></div>
            </div>
          </div>

        </div>
      </main>
    `;
  },

  habits() {
    return `
      <main class="view-scroll">
        <div class="view-inner">
          <header class="page-header">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="header-row" style="margin-top:10px">
              <div>
                <div class="skeleton" style="height:28px;width:120px;border-radius:8px"></div>
                <div class="skeleton skeleton-line skeleton-line--mid" style="margin-top:8px"></div>
              </div>
              <div style="display:flex;gap:8px">
                <div class="skeleton" style="width:48px;height:32px;border-radius:var(--radius-btn)"></div>
                <div class="skeleton" style="width:70px;height:32px;border-radius:var(--radius-btn)"></div>
              </div>
            </div>
          </header>

          <!-- Pills section skeleton -->
          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line" style="width:40px;height:11px;margin-bottom:12px"></div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${[1,2,3,4,5].map(() => `
                <div class="skeleton" style="width:100%;height:50px;border-radius:var(--radius-btn)"></div>
              `).join('')}
            </div>
          </div>

          <!-- Calendar skeleton -->
          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short" style="width:80px;margin-bottom:14px"></div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
              ${Array.from({length:28}).map(() => `
                <div class="skeleton" style="width:100%;aspect-ratio:1;border-radius:50%"></div>
              `).join('')}
            </div>
          </div>

          <!-- Streaks skeleton -->
          <div class="skeleton-card">
            <div class="skeleton skeleton-line skeleton-line--short" style="width:60px;margin-bottom:14px"></div>
            ${[1,2,3].map(() => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border-soft)">
                <div class="skeleton" style="width:28px;height:28px;border-radius:50%"></div>
                <div class="skeleton skeleton-line" style="width:120px;height:13px"></div>
                <div class="skeleton" style="width:48px;height:22px;border-radius:999px;margin-left:auto"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </main>
    `;
  },

  workouts() {
    return `
      <main class="view-scroll">
        <div class="view-inner">
          <header class="page-header">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="header-row" style="margin-top:10px">
              <div>
                <div class="skeleton" style="height:28px;width:140px;border-radius:8px"></div>
                <div class="skeleton skeleton-line skeleton-line--mid" style="margin-top:8px"></div>
              </div>
            </div>
          </header>

          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton" style="height:22px;width:160px;border-radius:6px;margin-top:8px"></div>
            <div class="skeleton skeleton-btn"></div>
            <div class="skeleton skeleton-btn" style="margin-top:8px;opacity:0.5"></div>
          </div>

          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div style="display:flex;gap:8px;margin-top:12px">
              ${[1,2,3,4,5,6,7].map(() => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
                  <div class="skeleton" style="height:10px;width:24px;border-radius:4px"></div>
                  <div class="skeleton" style="width:8px;height:8px;border-radius:50%"></div>
                  <div class="skeleton" style="height:9px;width:20px;border-radius:4px"></div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            ${[1,2,3].map(() => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border-soft)">
                <div>
                  <div class="skeleton skeleton-line" style="width:120px"></div>
                  <div class="skeleton skeleton-line" style="width:80px;margin-top:4px;height:11px"></div>
                </div>
                <div style="display:flex;gap:3px">
                  ${[1,2,3].map(() => `<div class="skeleton" style="width:6px;height:6px;border-radius:50%"></div>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Past sessions skeleton -->
          <div class="skeleton-card">
            <div class="skeleton skeleton-line skeleton-line--short" style="width:90px;margin-bottom:14px"></div>
            ${[1,2,3].map(() => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--color-border-soft)">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="skeleton" style="width:56px;height:22px;border-radius:999px"></div>
                  <div>
                    <div class="skeleton skeleton-line" style="width:110px;height:13px"></div>
                    <div class="skeleton skeleton-line" style="width:80px;height:10px;margin-top:4px"></div>
                  </div>
                </div>
                <div class="skeleton skeleton-line" style="width:50px;height:11px"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </main>
    `;
  },

  journal() {
    return `
      <main class="view-scroll">
        <div class="view-inner">
          <header class="page-header">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton" style="height:28px;width:120px;border-radius:8px;margin-top:10px"></div>
            <div class="skeleton skeleton-line skeleton-line--mid" style="margin-top:8px"></div>
          </header>

          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton" style="height:60px;width:100%;border-radius:var(--radius-sm);margin-top:14px"></div>
            <div class="skeleton" style="height:120px;width:100%;border-radius:var(--radius-sm);margin-top:12px"></div>
            <div class="skeleton skeleton-btn"></div>
          </div>

          <div class="skeleton-card">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            ${[1,2,3].map(() => `
              <div style="padding:12px 0;border-bottom:1px solid var(--color-border-soft)">
                <div class="skeleton skeleton-line" style="width:100px"></div>
                <div class="skeleton skeleton-line skeleton-line--full" style="margin-top:6px;height:11px"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </main>
    `;
  },

  nico() {
    return `
      <main class="view-scroll">
        <div class="view-inner">
          <header class="page-header">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton" style="height:28px;width:100px;border-radius:8px;margin-top:10px"></div>
            <div class="skeleton skeleton-line skeleton-line--mid" style="margin-top:8px"></div>
          </header>

          <div class="skeleton-card" style="margin-bottom:16px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton skeleton-btn"></div>
          </div>

          <div style="display:flex;gap:7px;margin-bottom:14px">
            ${[1,2,3,4,5,6].map(() => `
              <div class="skeleton" style="height:30px;width:56px;border-radius:999px;flex-shrink:0"></div>
            `).join('')}
          </div>

          <div style="display:flex;flex-direction:column;gap:10px">
            ${[1,2,3,4].map(() => `
              <div class="skeleton-card">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div class="skeleton" style="width:32px;height:32px;border-radius:8px"></div>
                  <div class="skeleton" style="width:70px;height:22px;border-radius:999px"></div>
                </div>
                <div class="skeleton skeleton-line" style="width:140px;height:15px;margin-top:12px"></div>
                <div class="skeleton skeleton-line skeleton-line--full" style="margin-top:6px;height:11px"></div>
                <div class="skeleton skeleton-line skeleton-line--mid" style="height:11px"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </main>
    `;
  },

  profile() {
    return `
      <main class="view-scroll">
        <div class="view-inner">
          <header class="page-header">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton" style="height:28px;width:120px;border-radius:8px;margin-top:10px"></div>
          </header>

          <div class="skeleton-card" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:16px">
              <div class="skeleton skeleton-avatar" style="width:56px;height:56px"></div>
              <div>
                <div class="skeleton skeleton-line" style="width:120px;height:15px"></div>
                <div class="skeleton skeleton-line" style="width:160px;height:11px;margin-top:6px"></div>
              </div>
            </div>
          </div>

          <!-- Stats card -->
          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div style="display:flex;gap:24px;margin-top:14px">
              ${[1,2,3].map(() => `
                <div style="flex:1;text-align:center">
                  <div class="skeleton skeleton-stat" style="margin:0 auto"></div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Streak dots skeleton -->
          <div class="skeleton-card" style="margin-bottom:12px">
            <div class="skeleton skeleton-line skeleton-line--short" style="width:70px;margin-bottom:14px"></div>
            <div style="display:flex;justify-content:space-between">
              ${[1,2,3,4,5,6,7].map(() => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
                  <div class="skeleton" style="width:32px;height:32px;border-radius:50%"></div>
                  <div class="skeleton" style="width:14px;height:10px;border-radius:3px"></div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="skeleton skeleton-btn" style="margin-top:8px"></div>
        </div>
      </main>
    `;
  }

};
