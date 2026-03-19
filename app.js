// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let currentTab = 'dashboard';
let lastTaskTimestamp = 0;    // ms timestamp of last logged quest, 0 = none
let undoTimerInterval = null; // countdown interval id
let tavernCountdownInterval = null; // countdown interval id for tavern reset timers

// Unique accent colour per NPC — used for card borders and accents
const NPC_COLOURS = {
  gary:   '#ef4444',
  mei:    '#8b5cf6',
  derek:  '#84cc16',
  brenda: '#ec4899',
  quill:  '#06b6d4',
  rico:   '#f97316',
  steel:  '#94a3b8',
  luna:   '#a78bfa',
};

// Duration labels vary by category. Keyed by category id; falls back to 'default'.
const DURATION_LABELS_BY_CAT = {
  body_health:          ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈45m)', 'Long (≈1h)',  'Extended (≈2h+)'],
  mind_learning:        ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  career_growth:        ['', 'Brief (≈30m)', 'Short (≈1h)',  'Medium (≈3h)',  'Long (≈5h)',  'Extended (≈8h+)'],
  social_relationships: ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  life_admin:           ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  creative:             ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  finance:              ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  hobbies:              ['', 'Brief (≈15m)', 'Short (≈30m)', 'Medium (≈1h)',  'Long (≈2h)',  'Extended (≈3h+)'],
  default:              ['', 'Brief',        'Short',        'Medium',        'Long',         'Extended'],
};

function getDurationLabels(categoryId) {
  return DURATION_LABELS_BY_CAT[categoryId] || DURATION_LABELS_BY_CAT['default'];
}

const SLIDER_DIFF_LABELS   = ['', 'Trivial', 'Easy', 'Moderate', 'Hard', 'Brutal'];
const SLIDER_UNCOMF_LABELS = ['', 'Comfortable', 'Slightly uneasy', 'Uncomfortable', 'Very uncomfortable', 'Pure dread'];
const SLIDER_IMP_LABELS    = ['', 'Trivial (1.0×)', 'Minor (1.075×)', 'Normal (1.15×)', 'Important (1.225×)', 'Critical (1.3×)'];

// ─────────────────────────────────────────
// Boot
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  renderDashboard();
});

// ─────────────────────────────────────────
// Tab Navigation
// ─────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === currentTab) return;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  // update buttons
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // update screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === `screen-${tab}`);
  });
  currentTab = tab;

  // Clear tavern countdown when leaving the tavern
  if (tab !== 'tavern') {
    clearInterval(tavernCountdownInterval);
    tavernCountdownInterval = null;
  }

  // render the newly active screen
  switch (tab) {
    case 'dashboard': renderDashboard(); break;
    case 'log':       renderLogTask();   break;
    case 'tavern':    renderTavern();    break;
    case 'history':   renderHistory();   break;
    case 'identity':  renderIdentity();  break;
    case 'settings':  renderSettings();  break;
  }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function getCategoryById(categories, id) {
  return categories.find(c => c.id === id) || { name: id, colour: '#6b7280' };
}

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (isoDate === today)     return 'Today';
  if (isoDate === yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function taskCardHTML(task, categories) {
  const cat    = getCategoryById(categories, task.category);
  const colour = cat.colour;
  return `
    <div class="task-card" style="border-left-color:${colour}">
      <div class="task-card-body">
        <div class="task-card-name">${esc(task.name)}</div>
        <div class="task-card-meta">
          <span class="cat-badge" style="color:${colour};border-color:${colour}">${esc(cat.name)}</span>
          <span>D${task.difficulty} · U${task.uncomfortability}</span>
        </div>
      </div>
      <div class="task-xp">${task.xpAwarded} XP</div>
    </div>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────
function getWeeklyXP(tasks) {
  const today      = new Date();
  const todayISO   = today.toISOString().slice(0, 10);
  const dow        = today.getDay();                    // 0=Sun
  const monday     = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));   // roll back to Monday
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: 7 }, (_, i) => {
    const d   = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const xp  = tasks
      .filter(t => t.date === iso)
      .reduce((sum, t) => sum + t.xpAwarded, 0);
    return { iso, xp, label: DAY_LABELS[i], isToday: iso === todayISO, isFuture: iso > todayISO };
  });
}

function renderDashboard() {
  const data      = loadData();
  const { player, tasks, categories } = data;

  const PRESTIGE_LEVEL  = 20;
  const isFinalStretch  = player.level === PRESTIGE_LEVEL - 1;

  const bracketSize = getXPForNextLevel(player.level);
  const remaining   = bracketSize - player.currentXP;
  const pct         = Math.min(100, Math.round((player.currentXP / bracketSize) * 100));

  // Weekly XP chart data
  const weekDays  = getWeeklyXP(tasks);
  const maxXP     = Math.max(...weekDays.map(d => d.xp), 1);
  const weekTotal = weekDays.reduce((s, d) => s + d.xp, 0);
  const chartBarsHTML = weekDays.map((d, i) => {
    const pctH = Math.round((d.xp / maxXP) * 100);
    return `
      <div class="chart-col${d.isToday ? ' chart-col--today' : ''}${d.isFuture ? ' chart-col--future' : ''}">
        <div class="chart-xp-label">${d.xp > 0 ? d.xp : ''}</div>
        <div class="chart-bar-wrap">
          <div class="chart-bar" data-pct="${pctH}" style="height:0%"></div>
        </div>
        <div class="chart-day-label">${d.label}</div>
      </div>`;
  }).join('');

  // Undo bar — visible for 60s after last quest submission
  const undoSecsLeft = Math.ceil((60000 - (Date.now() - lastTaskTimestamp)) / 1000);
  const showUndo     = lastTaskTimestamp > 0 && undoSecsLeft > 0 && tasks.length > 0;
  const undoBarHTML  = showUndo ? `
    <div class="undo-bar" id="undo-bar">
      <div class="undo-bar-info">
        <span class="undo-bar-name">${esc(tasks[tasks.length - 1].name)}</span>
        <span class="undo-bar-xp">+${tasks[tasks.length - 1].xpAwarded} XP</span>
      </div>
      <button class="btn-undo" id="btn-undo-quest">
        ↩ Undo
        <span class="undo-countdown" id="undo-countdown">${undoSecsLeft}</span>
      </button>
    </div>` : '';

  const recent  = [...tasks].reverse().slice(0, 5);
  const recentHTML = recent.length
    ? recent.map(t => taskCardHTML(t, categories)).join('')
    : `<div class="empty-state"><div class="empty-icon">⚔️</div>No quests logged yet.<br>Venture forth and begin your journey.</div>`;

  const multiplierHTML = player.xpMultiplier > 1.0
    ? `<span class="multiplier-chip">✦ ${player.xpMultiplier.toFixed(1)}×</span>`
    : '';

  document.getElementById('screen-dashboard').innerHTML = `
    <div class="dashboard-hero${isFinalStretch ? ' dashboard-hero--final-stretch' : ''}">
      <div class="player-greeting">Welcome, Adventurer</div>
      <div class="player-name">${esc(player.name)}${multiplierHTML}</div>
      <div class="level-badge${isFinalStretch ? ' level-badge--final-stretch' : ''}">
        <span class="level-label">Level</span>
        <span class="level-number">${player.level}</span>
      </div>
      <div class="xp-bar-wrap">
        <div class="xp-bar-labels">
          <span><strong>${player.currentXP.toLocaleString()}</strong> XP</span>
          <span>${remaining.toLocaleString()} to next level</span>
        </div>
        <div class="xp-bar-track">
          <div class="xp-bar-fill${isFinalStretch ? ' xp-bar-fill--final-stretch' : ''}" id="xp-bar-fill" style="width:0%"></div>
        </div>
      </div>
      ${isFinalStretch ? `
      <div class="final-stretch-banner" aria-label="Final stretch to prestige">
        <span class="final-stretch-icon">⚡</span>
        <div class="final-stretch-body">
          <div class="final-stretch-title">FINAL STRETCH</div>
          <div class="final-stretch-sub">One level until Prestige — keep pushing</div>
        </div>
        <span class="final-stretch-badge">LVL ${PRESTIGE_LEVEL}</span>
      </div>` : ''}
    </div>

    ${undoBarHTML}

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-icon">🔥</div>
        <div class="stat-value ${player.streak > 0 ? 'streak-active' : ''}">${player.streak}</div>
        <div class="stat-label">Day Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-value">${tasks.length}</div>
        <div class="stat-label">Quests Done</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">${player.totalXP.toLocaleString()}</div>
        <div class="stat-label">Total XP</div>
      </div>
    </div>

    <div class="section-heading">This Week</div>
    <div class="weekly-chart">
      <div class="weekly-chart-bars">${chartBarsHTML}</div>
      <div class="weekly-chart-footer">
        <span class="weekly-total-label">Week Total</span>
        <span class="weekly-total-value">${weekTotal.toLocaleString()} XP</span>
      </div>
    </div>

    <div class="section-heading">Recent Quests</div>
    <div class="task-list">${recentHTML}</div>
  `;

  // Animate XP bar + chart bars after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = document.getElementById('xp-bar-fill');
      if (fill) fill.style.width = `${pct}%`;

      document.querySelectorAll('.chart-bar').forEach((bar, i) => {
        setTimeout(() => {
          bar.style.height = bar.dataset.pct + '%';
        }, i * 60);
      });
    });
  });

  // Clear any previous undo countdown then start a fresh one
  clearInterval(undoTimerInterval);
  if (showUndo) {
    document.getElementById('btn-undo-quest').addEventListener('click', undoLastTask);

    undoTimerInterval = setInterval(() => {
      const secs = Math.ceil((60000 - (Date.now() - lastTaskTimestamp)) / 1000);
      const el   = document.getElementById('undo-countdown');
      const bar  = document.getElementById('undo-bar');
      if (!el || !bar) { clearInterval(undoTimerInterval); return; }
      if (secs <= 0) {
        clearInterval(undoTimerInterval);
        bar.classList.add('undo-bar--expire');
        setTimeout(() => { if (bar.parentNode) bar.remove(); }, 400);
      } else {
        el.textContent = secs;
      }
    }, 1000);
  }
}

// ─────────────────────────────────────────
// Log Task
// ─────────────────────────────────────────
function renderLogTask() {
  const data       = loadData();
  const categories = data.categories;
  const recent     = data.recentQuests || [];

  const catOptions = categories
    .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
    .join('');

  const quickLogHTML = recent.length ? `
    <div class="quick-log-wrap">
      <div class="quick-log-label">Quick Log</div>
      <div class="quick-log-chips" id="quick-log-chips">
        ${recent.map((q, i) => `
          <button type="button" class="quick-chip" data-idx="${i}">${esc(q.name)}</button>
        `).join('')}
      </div>
    </div>` : '';

  document.getElementById('screen-log').innerHTML = `
    <div class="screen-header">
      <h1>Log <span class="header-accent">Quest</span></h1>
    </div>
    ${quickLogHTML}
    <form class="log-form" id="log-form" autocomplete="off">

      <div class="form-group">
        <label class="form-label" for="task-name">Quest Name</label>
        <input class="form-input" id="task-name" type="text" placeholder="Describe your quest…" maxlength="80" />
      </div>

      <div class="form-group">
        <label class="form-label" for="task-category">Category</label>
        <select class="form-select" id="task-category">${catOptions}</select>
      </div>

      <div class="slider-group">
        <div class="slider-row">
          <div class="slider-header">
            <span class="slider-label">Duration</span>
            <span class="slider-value" id="val-duration">3</span>
          </div>
          <input type="range" id="slider-duration" min="1" max="5" value="3" step="1" />
          <div class="slider-desc" id="desc-duration">${getDurationLabels(categories[0] && categories[0].id)[3]}</div>
        </div>

        <div class="slider-row">
          <div class="slider-header">
            <span class="slider-label">Difficulty</span>
            <span class="slider-value" id="val-difficulty">3</span>
          </div>
          <input type="range" id="slider-difficulty" min="1" max="5" value="3" step="1" />
          <div class="slider-desc" id="desc-difficulty">${SLIDER_DIFF_LABELS[3]}</div>
        </div>

        <div class="slider-row">
          <div class="slider-header">
            <span class="slider-label">Uncomfortability</span>
            <span class="slider-value" id="val-uncomfort">3</span>
          </div>
          <input type="range" id="slider-uncomfort" min="1" max="5" value="3" step="1" />
          <div class="slider-desc" id="desc-uncomfort">${SLIDER_UNCOMF_LABELS[3]}</div>
        </div>

        <div class="slider-row slider-row--importance">
          <div class="slider-header">
            <span class="slider-label">Importance</span>
            <span class="slider-value" id="val-importance">3</span>
          </div>
          <input type="range" id="slider-importance" min="1" max="5" value="3" step="1" />
          <div class="slider-desc" id="desc-importance">${SLIDER_IMP_LABELS[3]}</div>
        </div>
      </div>

      <div class="xp-preview">
        <div class="xp-preview-label">XP Preview</div>
        <div class="xp-preview-value" id="xp-preview-value">0</div>
        <div class="xp-preview-unit">experience points</div>
      </div>

      <div style="position:relative">
        <button type="submit" class="btn-complete" id="btn-complete">Complete Quest</button>
      </div>

    </form>
  `;

  setupLogForm();
}

function setupLogForm() {
  const form       = document.getElementById('log-form');
  const nameInput  = document.getElementById('task-name');
  const sliderDur  = document.getElementById('slider-duration');
  const sliderDiff = document.getElementById('slider-difficulty');
  const sliderUnc  = document.getElementById('slider-uncomfort');
  const sliderImp  = document.getElementById('slider-importance');
  const xpDisplay  = document.getElementById('xp-preview-value');
  const btnComplete = document.getElementById('btn-complete');

  function refreshXP() {
    const data    = loadData();
    const dur     = +sliderDur.value;
    const diff    = +sliderDiff.value;
    const unc     = +sliderUnc.value;
    const imp     = +sliderImp.value;
    const catId   = document.getElementById('task-category').value;
    const xp      = calculateXP(dur, diff, unc, data.player.xpMultiplier, imp);
    const durLabels = getDurationLabels(catId);

    // Update value labels
    document.getElementById('val-duration').textContent   = dur;
    document.getElementById('val-difficulty').textContent = diff;
    document.getElementById('val-uncomfort').textContent  = unc;
    document.getElementById('val-importance').textContent = imp;

    // Update desc labels
    document.getElementById('desc-duration').textContent   = durLabels[dur];
    document.getElementById('desc-difficulty').textContent = SLIDER_DIFF_LABELS[diff];
    document.getElementById('desc-uncomfort').textContent  = SLIDER_UNCOMF_LABELS[unc];
    document.getElementById('desc-importance').textContent = SLIDER_IMP_LABELS[imp];

    // Pop animation on XP number
    xpDisplay.textContent = xp;
    xpDisplay.classList.remove('pop');
    void xpDisplay.offsetWidth;
    xpDisplay.classList.add('pop');
    setTimeout(() => xpDisplay.classList.remove('pop'), 200);

    // Update slider fill gradient
    // Importance slider uses amber to signal "stakes"
    [
      [sliderDur,  dur,  'var(--accent)'],
      [sliderDiff, diff, 'var(--accent)'],
      [sliderUnc,  unc,  'var(--accent)'],
      [sliderImp,  imp,  imp >= 4 ? '#e07030' : 'var(--accent)']
    ].forEach(([el, val, colour]) => {
      const pct = ((val - 1) / 4) * 100;
      el.style.background = `linear-gradient(to right, ${colour} ${pct}%, var(--border) ${pct}%)`;
    });

    // Enable button only if name filled
    btnComplete.disabled = nameInput.value.trim() === '';
  }

  // Initial render
  refreshXP();

  // Quick Log chip clicks — pre-fill the form
  const chipsWrap = document.getElementById('quick-log-chips');
  if (chipsWrap) {
    chipsWrap.addEventListener('click', e => {
      const chip = e.target.closest('.quick-chip');
      if (!chip) return;
      const recent = (loadData().recentQuests || []);
      const q = recent[+chip.dataset.idx];
      if (!q) return;

      nameInput.value                                             = q.name;
      document.getElementById('task-category').value             = q.category;
      document.getElementById('slider-duration').value           = q.duration;
      document.getElementById('slider-difficulty').value         = q.difficulty;
      document.getElementById('slider-uncomfort').value          = q.uncomfortability;
      document.getElementById('slider-importance').value         = q.importance;

      // Flash the active chip
      chipsWrap.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('quick-chip--active'));
      chip.classList.add('quick-chip--active');

      refreshXP();
    });
  }

  nameInput.addEventListener('input', refreshXP);
  document.getElementById('task-category').addEventListener('change', refreshXP);
  sliderDur.addEventListener('input',  refreshXP);
  sliderDiff.addEventListener('input', refreshXP);
  sliderUnc.addEventListener('input',  refreshXP);
  sliderImp.addEventListener('input',  refreshXP);

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const name = nameInput.value.trim();
    if (!name) return;

    btnComplete.disabled = true;

    const result = addTask({
      name,
      category:         document.getElementById('task-category').value,
      duration:         +sliderDur.value,
      difficulty:       +sliderDiff.value,
      uncomfortability: +sliderUnc.value,
      importance:       +sliderImp.value,
      score:            3
    });

    // Mark undo window
    lastTaskTimestamp = Date.now();

    // Ripple + XP fly-up + sound
    spawnRipple(btnComplete);
    playXPSound();
    showXPFlyup(result.xpGained);

    if (result.leveledUp) {
      await delay(700);
      await showLevelUpOverlay(result.newLevel);
      await delay(250);
    } else {
      await delay(1400);
    }

    // Go back to dashboard
    switchTab('dashboard');
  });
}

// ─────────────────────────────────────────
// Tavern
// ─────────────────────────────────────────
function getMsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'resetting…';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderTavern() {
  const daily          = getDailyNPCQuests();
  const completedCount = daily.filter(d => d.completed).length;
  const progressPct    = Math.round((completedCount / 8) * 100);

  const cardsHTML = daily.map(({ npc, quest, xpPreview, completed, xpAwarded }) => {
    const colour = NPC_COLOURS[npc.id] || 'var(--accent)';

    const footerHTML = completed
      ? `<div class="npc-footer">
           <span class="completed-badge">✓ Completed · ${xpAwarded} XP</span>
           <span class="reset-countdown">Resets in ${formatCountdown(getMsUntilMidnight())}</span>
         </div>`
      : `<button class="btn-accept" data-npc-id="${esc(npc.id)}"
              data-quest-title="${esc(quest.title)}"
              data-xp-preview="${xpPreview}"
              data-npc-avatar="${esc(npc.avatar)}"
              data-npc-name="${esc(npc.name)}">
           Accept &amp; Complete
         </button>`;

    return `
      <div class="npc-card${completed ? ' npc-card--done' : ''}" style="--npc-colour:${colour}">
        <div class="npc-card-main">
          <div class="npc-avatar">${npc.avatar}</div>
          <div class="npc-info">
            <div class="npc-name">${esc(npc.name)}</div>
            <div class="npc-tagline">${esc(npc.tagline)}</div>
          </div>
        </div>
        <div class="npc-quest-section">
          <div class="npc-quest-label">Today's Quest</div>
          <div class="npc-quest-title">${esc(quest.title)}</div>
          <div class="npc-quest-desc">${esc(quest.description)}</div>
          ${!completed ? `<div class="npc-xp-reward">⚡ ${xpPreview} XP</div>` : ''}
        </div>
        ${footerHTML}
      </div>`;
  }).join('');

  document.getElementById('screen-tavern').innerHTML = `
    <div class="tavern-header">
      <div class="tavern-title">⚔️ The <span class="header-accent">Tavern</span></div>
      <div class="tavern-progress-row">
        <span class="tavern-progress-count">${completedCount} / 8</span>
        <span class="tavern-progress-label">quests complete today</span>
      </div>
      <div class="tavern-bar-track">
        <div class="tavern-bar-fill" id="tavern-bar-fill" style="width:0%" data-pct="${progressPct}"></div>
      </div>
    </div>
    <div class="npc-list">${cardsHTML}</div>
  `;

  // Animate progress bar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = document.getElementById('tavern-bar-fill');
    if (fill) fill.style.width = fill.dataset.pct + '%';
  }));

  // Accept buttons
  document.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', () => {
      showTavernConfirm(
        btn.dataset.npcAvatar,
        btn.dataset.npcName,
        btn.dataset.questTitle,
        +btn.dataset.xpPreview,
        async () => {
          const result = completeNPCQuest(btn.dataset.npcId);
          if (!result.ok) { showXPToast(result.error); return; }
          playXPSound();
          showXPFlyup(result.xpGained);
          if (result.leveledUp) {
            await delay(700);
            await showLevelUpOverlay(result.newLevel);
            await delay(250);
          } else {
            await delay(400);
          }
          renderTavern();
        }
      );
    });
  });

  // Start the midnight countdown ticking
  startTavernCountdowns();
}

function showTavernConfirm(avatar, npcName, questTitle, xpPreview, onConfirm) {
  const overlay = document.getElementById('tavern-confirm');
  document.getElementById('tavern-confirm-npc').textContent   = `${avatar} ${npcName}`;
  document.getElementById('tavern-confirm-quest').textContent = `"${questTitle}"`;
  document.getElementById('tavern-confirm-xp').textContent    = `⚡ +${xpPreview} XP`;

  overlay.classList.add('tavern-confirm--open');

  const cancel  = document.getElementById('btn-confirm-cancel');
  const confirm = document.getElementById('btn-confirm-ok');

  const close = () => {
    overlay.classList.remove('tavern-confirm--open');
    confirm.removeEventListener('click', handleConfirm);
    cancel.removeEventListener('click', close);
    overlay.removeEventListener('click', handleBackdrop);
  };
  const handleConfirm = () => { close(); onConfirm(); };
  const handleBackdrop = e => { if (e.target === overlay) close(); };

  confirm.addEventListener('click', handleConfirm);
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', handleBackdrop);
}

function startTavernCountdowns() {
  clearInterval(tavernCountdownInterval);
  tavernCountdownInterval = setInterval(() => {
    const ms   = getMsUntilMidnight();
    const text = 'Resets in ' + formatCountdown(ms);
    document.querySelectorAll('.reset-countdown').forEach(el => { el.textContent = text; });
    if (ms <= 0) {
      clearInterval(tavernCountdownInterval);
      renderTavern(); // midnight — re-render with fresh quests
    }
  }, 1000);
}

// ─────────────────────────────────────────
// History
// ─────────────────────────────────────────
function renderHistory(filterCat = '') {
  const data       = loadData();
  const { tasks, categories } = data;

  const catOptions = [
    `<option value="">All Categories</option>`,
    ...categories.map(c => `<option value="${esc(c.id)}" ${filterCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`)
  ].join('');

  const filtered = filterCat
    ? tasks.filter(t => t.category === filterCat)
    : tasks;

  // Group by date descending
  const byDate = {};
  [...filtered].reverse().forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });

  const groupsHTML = Object.keys(byDate).length === 0
    ? `<div class="empty-state" style="margin-top:40px">
         <div class="empty-icon">📜</div>No quests found in the records.
       </div>`
    : Object.entries(byDate).map(([date, dayTasks]) => `
        <div class="date-group">
          <div class="date-group-label">${formatDate(date)}</div>
          <div class="task-list" style="padding:0">
            ${dayTasks.map(t => taskCardHTML(t, categories)).join('')}
          </div>
        </div>
      `).join('');

  document.getElementById('screen-history').innerHTML = `
    <div class="screen-header">
      <h1>Quest <span class="header-accent">History</span></h1>
    </div>
    <div class="history-filter">
      <select class="form-select" id="history-filter">${catOptions}</select>
    </div>
    <div id="history-list" style="padding:0 0 8px">${groupsHTML}</div>
  `;

  document.getElementById('history-filter').addEventListener('change', e => {
    renderHistory(e.target.value);
  });
}

// ─────────────────────────────────────────
// Settings
// ─────────────────────────────────────────
function renderSettings() {
  const data     = loadData();
  const { player, categories } = data;

  const catListHTML = categories.map(c => `
    <div class="category-row" data-id="${esc(c.id)}">
      <div class="cat-colour-swatch" style="background:${c.colour}"></div>
      <div class="cat-row-name">${esc(c.name)}</div>
      <button class="btn-remove-cat" data-id="${esc(c.id)}" title="Remove">×</button>
    </div>`).join('');

  const shopItemsHTML = data.shopItems.map(item => `
    <div class="shop-price-row" data-item-id="${esc(item.id)}">
      <span class="shop-price-icon">${item.icon}</span>
      <span class="shop-price-name">${esc(item.name)}</span>
      <div class="shop-price-input-wrap">
        <span class="shop-price-prefix">🪙</span>
        <input
          class="form-input shop-price-input"
          type="number"
          min="1"
          step="1"
          value="${item.price}"
          data-item-id="${esc(item.id)}"
        />
      </div>
    </div>`).join('');

  const prestigeLevel = 20;
  const canPrestige   = player.level >= prestigeLevel;

  document.getElementById('screen-settings').innerHTML = `
    <div class="screen-header">
      <h1><span class="header-accent">Settings</span></h1>
    </div>

    <!-- Player Name -->
    <div class="settings-section">
      <div class="settings-section-title">Player</div>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label" for="setting-name">Display Name</label>
        <input class="form-input" id="setting-name" type="text" value="${esc(player.name)}" maxlength="30" />
      </div>
      <button class="btn-save" id="btn-save-name">Save Name</button>
    </div>

    <!-- Categories -->
    <div class="settings-section">
      <div class="settings-section-title">Categories</div>
      <div class="category-list" id="category-list">${catListHTML}</div>
      <div class="add-cat-row">
        <input class="form-input" id="new-cat-name" type="text" placeholder="New category name" maxlength="30" />
        <input class="colour-input" id="new-cat-colour" type="color" value="#8b5cf6" />
        <button class="btn-add-cat" id="btn-add-cat" title="Add category">+</button>
      </div>
    </div>

    <!-- Shop Item Prices -->
    <div class="settings-section">
      <div class="settings-section-title">Shop Item Prices</div>
      <p class="settings-hint">Edit the coin cost of any shop item.</p>
      <div class="shop-price-list" id="shop-price-list">
        ${shopItemsHTML}
      </div>
      <button class="btn-save" id="btn-save-prices" style="margin-top:14px">Save Prices</button>
    </div>

    <!-- Prestige -->
    <div class="settings-section">
      <div class="settings-section-title">Prestige</div>
      <div class="prestige-card">
        <div class="prestige-title">⚡ Prestige</div>
        <div class="prestige-desc">
          Reset your level and XP to zero in exchange for a permanent
          <strong>+0.1× XP multiplier</strong>. For those who hunger for more.
        </div>
        <div class="prestige-stat">
          Current: <span>${player.prestigeCount} prestige${player.prestigeCount !== 1 ? 's' : ''}</span>
          &nbsp;·&nbsp;
          Multiplier: <span>${player.xpMultiplier.toFixed(1)}×</span>
        </div>
        <button class="btn-prestige" id="btn-prestige" ${canPrestige ? '' : 'disabled'}>
          Prestige Now
        </button>
        ${!canPrestige ? `<div class="prestige-locked-msg">Reach level ${prestigeLevel} to unlock (currently level ${player.level})</div>` : ''}
      </div>
    </div>

    <!-- Save Data -->
    <div class="settings-section">
      <div class="settings-section-title">Save Data</div>
      <p class="settings-hint">Export your save before clearing your browser cache, then import it to restore your progress.</p>
      <div class="save-data-row">
        <button class="btn-save" id="btn-export-save">⬇ Export Save</button>
        <label class="btn-save btn-import-label" for="import-save-input">⬆ Import Save</label>
        <input type="file" id="import-save-input" accept=".json" style="display:none" />
      </div>
    </div>
  `;

  // Save name
  document.getElementById('btn-save-name').addEventListener('click', () => {
    const newName = document.getElementById('setting-name').value.trim();
    if (!newName) return;
    const d = loadData();
    d.player.name = newName;
    saveData(d);
    showXPToast('Name saved');
  });

  // Remove category
  document.getElementById('category-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove-cat');
    if (!btn) return;
    const id = btn.dataset.id;
    const d  = loadData();
    if (d.categories.length <= 1) return;
    d.categories = d.categories.filter(c => c.id !== id);
    saveData(d);
    renderSettings();
  });

  // Add category
  document.getElementById('btn-add-cat').addEventListener('click', () => {
    const nameEl   = document.getElementById('new-cat-name');
    const colourEl = document.getElementById('new-cat-colour');
    const name     = nameEl.value.trim();
    if (!name) return;
    const d = loadData();
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
    d.categories.push({ id, name, colour: colourEl.value });
    saveData(d);
    nameEl.value = '';
    renderSettings();
  });

  // Save shop prices
  document.getElementById('btn-save-prices').addEventListener('click', () => {
    const d = loadData();
    let changed = 0;
    document.querySelectorAll('.shop-price-input').forEach(input => {
      const itemId  = input.dataset.itemId;
      const newPrice = parseInt(input.value, 10);
      if (isNaN(newPrice) || newPrice < 1) return;
      const item = d.shopItems.find(i => i.id === itemId);
      if (item && item.price !== newPrice) {
        item.price = newPrice;
        changed++;
      }
    });
    saveData(d);
    showXPToast(changed > 0 ? `${changed} price${changed !== 1 ? 's' : ''} updated` : 'No changes');
  });

  // Prestige
  document.getElementById('btn-prestige').addEventListener('click', () => {
    if (!canPrestige) return;
    const confirmed = confirm(
      `Are you sure? Your level and XP will reset to 0.\n` +
      `You will gain a permanent +0.1× XP multiplier.\n\n` +
      `This cannot be undone.`
    );
    if (!confirmed) return;
    const d = loadData();
    d.player.prestigeCount += 1;
    d.player.xpMultiplier   = Math.round((d.player.xpMultiplier + 0.1) * 100) / 100;
    d.player.level           = 1;
    d.player.totalXP         = 0;
    d.player.currentXP       = 0;
    saveData(d);
    showLevelUpOverlay('✦').then(() => renderSettings());
  });

  // Export save
  document.getElementById('btn-export-save').addEventListener('click', () => {
    const json     = localStorage.getItem('rpg_life_data') || '{}';
    const filename = `life-rpg-save-${new Date().toISOString().slice(0,10)}.json`;

    // Use Web Share API on mobile if available, otherwise download
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      const file = new File([json], filename, { type: 'application/json' });
      navigator.share({ files: [file], title: 'Life RPG Save' }).catch(() => triggerDownload(json, filename));
    } else {
      triggerDownload(json, filename);
    }
  });

  // Import save
  document.getElementById('import-save-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Basic sanity check
        if (!parsed.player || !parsed.tasks) throw new Error('Invalid save file');
        localStorage.setItem('rpg_life_data', JSON.stringify(parsed));
        showXPToast('Save restored!');
        setTimeout(() => switchTab('dashboard'), 800);
      } catch {
        alert('Could not load save — file appears invalid or corrupted.');
      }
    };
    reader.readAsText(file);
  });
}

function triggerDownload(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────
// Identity
// ─────────────────────────────────────────
function renderIdentity() {
  const data     = loadData();
  const identity = data.player.identity || {};
  const skills   = computeAllSkills(data);
  const coins    = computeCoins(data);
  const spent    = computeTotalSpent(data);

  // ── Skill ring helpers ──────────────────
  const CIRC = 226.2; // 2π × 36

  function skillCardHTML(skill) {
    const pct    = skill.level >= 99 ? 1 : skill.progressXP / skill.bracketXP;
    const barPct = Math.round(pct * 100);
    const isMax  = skill.level >= 99;
    return `
      <div class="skill-card skill-card--tappable" style="--skill-colour:${skill.colour}"
           data-skill-id="${esc(skill.id)}" role="button" tabindex="0" title="View ${skill.name} history">
        <div class="skill-card-tap-hint">Details ›</div>
        <div class="skill-ring-wrap">
          <svg class="skill-ring" viewBox="0 0 88 88">
            <circle class="skill-ring-bg" cx="44" cy="44" r="36"/>
            <circle class="skill-ring-fill" cx="44" cy="44" r="36"
              style="stroke:${skill.colour};stroke-dashoffset:${CIRC};filter:drop-shadow(0 0 6px ${skill.colour}88)"
              data-target-offset="${(CIRC*(1-skill.level/99)).toFixed(2)}"/>
          </svg>
          <div class="skill-ring-inner">
            <span class="skill-icon">${skill.icon}</span>
            <span class="skill-level-num" style="color:${skill.colour}">${skill.level}</span>
          </div>
        </div>
        <div class="skill-name">${esc(skill.name)}</div>
        ${isMax
          ? '<div class="skill-max-badge">MAX</div>'
          : `<div class="skill-xp-bar-wrap">
               <div class="skill-xp-label">
                 <span>${skill.progressXP} XP</span><span>${skill.bracketXP} to next</span>
               </div>
               <div class="skill-xp-track">
                 <div class="skill-xp-fill" style="width:0%;background:${skill.colour}" data-target-pct="${barPct}"></div>
               </div>
             </div>`
        }
      </div>`;
  }

  // ── Shop item card ──────────────────────
  function shopItemHTML(item) {
    const canAfford = coins >= item.price;
    return `
      <div class="shop-card ${canAfford ? '' : 'shop-card-locked'}">
        <div class="shop-item-icon">${item.icon}</div>
        <div class="shop-item-name">${esc(item.name)}</div>
        <div class="shop-item-price">🪙 ${item.price}</div>
        <button class="btn-buy ${canAfford ? '' : 'btn-buy-disabled'}"
          data-item-id="${esc(item.id)}"
          ${canAfford ? '' : 'disabled'}>
          ${canAfford ? 'Buy' : 'Need ' + item.price}
        </button>
      </div>`;
  }

  // ── Purchase history ────────────────────
  const recentPurchases = [...(data.purchases || [])].reverse().slice(0, 20);
  const purchasesHTML = recentPurchases.length
    ? recentPurchases.map(p => `
        <div class="purchase-row">
          <span class="purchase-icon">${p.icon}</span>
          <span class="purchase-name">${esc(p.itemName)}</span>
          <span class="purchase-date">${formatDate(p.date)}</span>
          <span class="purchase-price">🪙 −${p.price}</span>
        </div>`).join('')
    : `<div class="empty-state" style="padding:20px 0;font-size:13px">
         No purchases yet — treat yourself!
       </div>`;

  // ── Render ──────────────────────────────
  document.getElementById('screen-identity').innerHTML = `
    <div class="screen-header">
      <h1>My <span class="header-accent">Identity</span></h1>
    </div>

    <!-- Character -->
    <div class="identity-section">
      <div class="identity-section-title">Character</div>
      <div class="char-field master">
        <label class="char-label" for="id-master">Master Objective</label>
        <textarea class="char-textarea" id="id-master" rows="2"
          placeholder="Your ultimate life purpose…">${esc(identity.masterObjective || '')}</textarea>
      </div>
      <div class="char-field minor">
        <label class="char-label" for="id-minor">Current Quest</label>
        <textarea class="char-textarea" id="id-minor" rows="2"
          placeholder="What are you working on right now…">${esc(identity.minorObjective || '')}</textarea>
      </div>
      <div class="char-field">
        <label class="char-label" for="id-strengths">Strengths</label>
        <textarea class="char-textarea" id="id-strengths" rows="2"
          placeholder="Traits and abilities that serve you…">${esc(identity.strengths || '')}</textarea>
      </div>
      <div class="char-field">
        <label class="char-label" for="id-weaknesses">Weaknesses</label>
        <textarea class="char-textarea" id="id-weaknesses" rows="2"
          placeholder="Areas to overcome and improve…">${esc(identity.weaknesses || '')}</textarea>
      </div>
      <button class="btn-save" id="btn-save-identity" style="margin-top:14px">Save</button>
    </div>

    <!-- Skills -->
    <div class="identity-section" style="border-bottom:none">
      <div class="identity-section-title">Skills</div>
    </div>
    <div class="skills-grid">${skills.map(skillCardHTML).join('')}</div>

    <!-- ── Coin Wallet ── -->
    <div class="identity-section" style="border-top:1px solid var(--border);margin-top:8px">
      <div class="identity-section-title">Coin Wallet</div>
      <div class="coin-wallet">
        <div class="coin-balance-wrap">
          <div class="coin-balance-icon">🪙</div>
          <div>
            <div class="coin-balance-amount">${coins.toLocaleString()}</div>
            <div class="coin-balance-label">coins available</div>
          </div>
        </div>
        <div class="coin-stats">
          <div class="coin-stat">
            <span class="coin-stat-label">Real Savings</span>
            <span class="coin-stat-value">£${(data.player.savings || 0).toLocaleString()}</span>
          </div>
          <div class="coin-stat">
            <span class="coin-stat-label">Total Spent</span>
            <span class="coin-stat-value spent">🪙 ${spent.toLocaleString()}</span>
          </div>
        </div>
        <div class="savings-update-row">
          <label class="char-label" style="margin-bottom:6px;display:block">Update Real Savings (£)</label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="savings-input" type="number" min="0" step="1"
              value="${data.player.savings || 0}" placeholder="0" style="flex:1"/>
            <button class="btn-save" id="btn-update-savings">Update</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Shop ── -->
    <div class="identity-section">
      <div class="identity-section-title">Coin Shop</div>
      <div class="shop-grid" id="shop-grid">
        ${data.shopItems.map(shopItemHTML).join('')}
      </div>
      <!-- Add custom item -->
      <div class="add-shop-item-row">
        <input class="form-input" id="new-item-name"  type="text"   placeholder="Item name" style="flex:2" maxlength="30"/>
        <input class="form-input" id="new-item-icon"  type="text"   placeholder="🎁" style="flex:0 0 52px;text-align:center" maxlength="2"/>
        <input class="form-input" id="new-item-price" type="number" placeholder="£" min="1" style="flex:1"/>
        <button class="btn-add-cat" id="btn-add-shop-item" title="Add item">+</button>
      </div>
    </div>

    <!-- ── Purchase History ── -->
    <div class="identity-section" style="border-bottom:none">
      <div class="identity-section-title">Purchase History</div>
      <div id="purchase-history">${purchasesHTML}</div>
    </div>
  `;

  // ── Animate rings & bars ────────────────
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.skill-ring-fill').forEach(el => {
        el.style.strokeDashoffset = el.dataset.targetOffset;
      });
      document.querySelectorAll('.skill-xp-fill').forEach(el => {
        el.style.width = el.dataset.targetPct + '%';
      });
    });
  });

  // ── Skill card → drawer ─────────────────
  document.querySelectorAll('.skill-card--tappable').forEach(card => {
    const handler = () => showSkillDrawer(card.dataset.skillId);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // ── Save identity ───────────────────────
  document.getElementById('btn-save-identity').addEventListener('click', () => {
    const d = loadData();
    d.player.identity = {
      masterObjective: document.getElementById('id-master').value,
      minorObjective:  document.getElementById('id-minor').value,
      strengths:       document.getElementById('id-strengths').value,
      weaknesses:      document.getElementById('id-weaknesses').value
    };
    saveData(d);
    showXPToast('Identity saved');
  });

  // ── Update savings ──────────────────────
  document.getElementById('btn-update-savings').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('savings-input').value);
    if (isNaN(val) || val < 0) return;
    const d = loadData();
    d.player.savings = Math.round(val);
    saveData(d);
    renderIdentity(); // re-render to reflect new coin balance
  });

  // ── Buy item ────────────────────────────
  document.getElementById('shop-grid').addEventListener('click', e => {
    const btn = e.target.closest('.btn-buy:not(.btn-buy-disabled)');
    if (!btn) return;
    const itemId = btn.dataset.itemId;
    const result = purchaseItem(itemId);
    if (!result.ok) {
      showXPToast('Not enough coins!');
      return;
    }
    showCoinToast(`−${result.item.price} 🪙  ${result.item.icon} ${result.item.name}`);
    renderIdentity();
  });

  // ── Add custom shop item ────────────────
  document.getElementById('btn-add-shop-item').addEventListener('click', () => {
    const name  = document.getElementById('new-item-name').value.trim();
    const icon  = document.getElementById('new-item-icon').value.trim() || '🎁';
    const price = parseInt(document.getElementById('new-item-price').value, 10);
    if (!name || isNaN(price) || price < 1) return;
    const d = loadData();
    d.shopItems.push({
      id:    'custom_' + Date.now(),
      name:  name,
      icon:  icon,
      price: price
    });
    saveData(d);
    renderIdentity();
  });
}

// ─────────────────────────────────────────
// Animations
// ─────────────────────────────────────────
function showXPToast(text) {
  const toast = document.getElementById('xp-toast');
  toast.textContent = typeof text === 'number' ? `+${text} XP` : text;
  toast.style.background = '';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function showCoinToast(text) {
  const toast = document.getElementById('xp-toast');
  toast.textContent = text;
  toast.style.background = 'linear-gradient(135deg, #92400e, #d97706)';
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); toast.style.background = ''; }, 2000);
}

function showXPFlyup(xp) {
  const el = document.createElement('div');
  el.className = 'xp-flyup';
  el.textContent = `+${xp} XP`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function playXPSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[523, 0, 0.28], [659, 0.11, 0.28], [784, 0.22, 0.45]].forEach(([freq, when, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.05);
    });
  } catch(e) {}
}

function playLevelUpSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Rising fanfare: four quick steps then a triumphant sustained chord
    [
      [392, 0,    0.18, 'triangle'],
      [523, 0.14, 0.18, 'triangle'],
      [659, 0.28, 0.18, 'triangle'],
      [784, 0.42, 0.7,  'triangle'],
      [784, 0.42, 0.7,  'sine'],
      [1047,0.42, 0.7,  'sine'],
    ].forEach(([freq, when, dur, type]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur + 0.3);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.35);
    });
  } catch(e) {}
}

function showLevelUpOverlay(level) {
  return new Promise(resolve => {
    const overlay   = document.getElementById('levelup-overlay');
    const particles = document.getElementById('levelup-particles');

    document.getElementById('levelup-number').textContent = level;

    // Spawn particle burst
    particles.innerHTML = '';
    for (let i = 0; i < 28; i++) {
      const p     = document.createElement('div');
      p.className = 'particle';
      const angle = (i / 28) * 360;
      const dist  = 70 + Math.random() * 130;
      const tx    = Math.round(Math.cos(angle * Math.PI / 180) * dist);
      const ty    = Math.round(Math.sin(angle * Math.PI / 180) * dist);
      const col   = Math.random() > 0.4 ? 'var(--gold)' : 'var(--accent)';
      const dur   = (0.7 + Math.random() * 0.5).toFixed(2) + 's';
      const dly   = (Math.random() * 0.2).toFixed(2) + 's';
      p.style.cssText = `--tx:${tx}px;--ty:${ty}px;--dur:${dur};--delay:${dly};background:${col}`;
      particles.appendChild(p);
    }

    overlay.classList.add('active');
    playLevelUpSound();

    const dismiss = () => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', dismiss);
      resolve();
    };
    overlay.addEventListener('click', dismiss);
    setTimeout(dismiss, 3200);
  });
}

function spawnRipple(btn) {
  const ripple = document.createElement('span');
  ripple.className = 'ripple-ring';
  ripple.style.left = '50%';
  ripple.style.top  = '50%';
  btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
}

// ─────────────────────────────────────────
// Skill Drawer
// ─────────────────────────────────────────
function computeSkillLevelHistory(skill, tasks) {
  const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date));
  const isDisc = !skill.categories; // discipline counts all tasks
  let cumXP = 0, prevLevel = 0;
  const milestones = [];
  for (const task of sorted) {
    const relevant = isDisc || skill.categories.includes(task.category);
    if (!relevant) continue;
    cumXP += isDisc ? 50 : task.xpAwarded;
    const newLevel = computeSkillLevel(cumXP);
    if (newLevel > prevLevel) {
      for (let l = prevLevel + 1; l <= newLevel; l++) milestones.push({ level: l, date: task.date });
      prevLevel = newLevel;
    }
  }
  return milestones;
}

function showSkillDrawer(skillId) {
  const data   = loadData();
  const skillMeta = data.skills.find(s => s.id === skillId);
  if (!skillMeta) return;
  const computed  = computeAllSkills(data).find(s => s.id === skillId);
  const isDisc    = !skillMeta.categories;

  // Last 5 contributing quests
  const contribTasks = isDisc
    ? [...data.tasks].reverse().slice(0, 5)
    : [...data.tasks].filter(t => skillMeta.categories.includes(t.category)).reverse().slice(0, 5);

  // Level milestones — show last 5
  const history   = computeSkillLevelHistory(skillMeta, data.tasks);
  const recent5   = history.slice(-5).reverse();

  const questsHTML = contribTasks.length
    ? contribTasks.map(t => {
        const cat = getCategoryById(data.categories, t.category);
        const xpLabel = isDisc ? '+50 XP' : `+${t.xpAwarded} XP`;
        return `
          <div class="sd-quest-row">
            <div class="sd-quest-info">
              <span class="sd-quest-name">${esc(t.name)}</span>
              <span class="sd-quest-cat" style="color:${cat.colour}">${esc(cat.name)}</span>
            </div>
            <span class="sd-quest-xp">${xpLabel}</span>
          </div>`;
      }).join('')
    : `<div class="sd-empty">No quests yet.</div>`;

  const milestonesHTML = recent5.length
    ? recent5.map(m => `
        <div class="sd-milestone-row">
          <span class="sd-milestone-dot" style="background:${skillMeta.colour}"></span>
          <span class="sd-milestone-label">Reached <strong>Level ${m.level}</strong></span>
          <span class="sd-milestone-date">${formatDate(m.date)}</span>
        </div>`).join('')
    : `<div class="sd-empty">No levels reached yet.</div>`;

  // XP bar for drawer header
  const pct = computed.level >= 99 ? 100 : Math.round((computed.progressXP / computed.bracketXP) * 100);

  const drawerHTML = `
    <div class="skill-drawer" id="skill-drawer">
      <div class="skill-drawer-handle"></div>
      <div class="skill-drawer-head">
        <div class="sd-icon-wrap" style="background:${skillMeta.colour}22;border-color:${skillMeta.colour}44">
          <span class="sd-icon">${skillMeta.icon}</span>
        </div>
        <div class="sd-head-info">
          <div class="sd-name" style="color:${skillMeta.colour}">${esc(skillMeta.name)}</div>
          <div class="sd-level">Level <strong>${computed.level}</strong>
            <span class="sd-xp-note">${computed.progressXP.toLocaleString()} / ${computed.bracketXP.toLocaleString()} XP</span>
          </div>
          <div class="sd-xp-track">
            <div class="sd-xp-fill" style="width:${pct}%;background:${skillMeta.colour}"></div>
          </div>
        </div>
        <button class="sd-close" id="sd-close" aria-label="Close">×</button>
      </div>
      <div class="skill-drawer-body">
        <div class="sd-section-title">Recent Quests</div>
        ${questsHTML}
        <div class="sd-section-title" style="margin-top:20px">Level History</div>
        ${milestonesHTML}
      </div>
    </div>
    <div class="skill-drawer-backdrop" id="sd-backdrop"></div>`;

  // Remove any existing drawer
  document.getElementById('skill-drawer')?.remove();
  document.getElementById('sd-backdrop')?.remove();

  document.body.insertAdjacentHTML('beforeend', drawerHTML);

  const drawer   = document.getElementById('skill-drawer');
  const backdrop = document.getElementById('sd-backdrop');

  const close = () => {
    drawer.classList.add('skill-drawer--closing');
    backdrop.classList.add('skill-drawer-backdrop--closing');
    setTimeout(() => { drawer.remove(); backdrop.remove(); }, 320);
  };

  document.getElementById('sd-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  // Trigger open animation
  requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('skill-drawer--open')));
}

function undoLastTask() {
  clearInterval(undoTimerInterval);
  lastTaskTimestamp = 0;

  const data = loadData();
  if (!data.tasks.length) return;

  const last = data.tasks[data.tasks.length - 1];
  data.tasks.pop();
  data.player.totalXP  = Math.max(0, data.player.totalXP - last.xpAwarded);
  const newLevel       = calculateLevel(data.player.totalXP);
  data.player.level    = newLevel;
  data.player.currentXP = data.player.totalXP - levelFloor(newLevel);
  saveData(data);

  showXPToast(`"${last.name}" removed`);
  renderDashboard();
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}
