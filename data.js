// data.js — browser global script (localStorage backend)

const STORAGE_KEY = 'rpg_life_data';

const DEFAULT_DATA = {
  player: {
    name: 'Player',
    level: 1,
    currentXP: 0,
    totalXP: 0,
    streak: 0,
    lastLoggedDate: null,
    prestigeCount: 0,
    xpMultiplier: 1.0,
    identity: {
      masterObjective: '',
      minorObjective: '',
      strengths: '',
      weaknesses: ''
    },
    savings: 0   // real-world savings in £ — 1:1 with coins
  },
  tasks: [],
  categories: [
    { id: 'body_health',          name: 'Body & Health',          colour: '#22c55e' },
    { id: 'mind_learning',        name: 'Mind & Learning',        colour: '#a855f7' },
    { id: 'career_growth',        name: 'Career & Growth',        colour: '#f59e0b' },
    { id: 'social_relationships', name: 'Social & Relationships', colour: '#3b82f6' },
    { id: 'life_admin',           name: 'Life Admin',             colour: '#6b7280' },
    { id: 'creative',             name: 'Creative',               colour: '#ec4899' },
    { id: 'finance',              name: 'Finance & Money',        colour: '#10b981' },
    { id: 'hobbies',              name: 'Hobbies & Leisure',      colour: '#f97316' }
  ],
  skills: [
    { id: 'health',     name: 'Health',     icon: '❤️',  colour: '#22c55e', categories: ['body_health'] },
    { id: 'learning',   name: 'Learning',   icon: '🧠',  colour: '#a855f7', categories: ['mind_learning'] },
    { id: 'financial',  name: 'Financial',  icon: '💰',  colour: '#10b981', categories: ['finance'] },
    { id: 'social',     name: 'Social',     icon: '🗣️', colour: '#3b82f6', categories: ['social_relationships', 'hobbies'] },
    { id: 'discipline', name: 'Discipline', icon: '⚡',  colour: '#ef4444', categories: ['career_growth', 'life_admin'] },
    { id: 'expression', name: 'Expression', icon: '🎨',  colour: '#ec4899', categories: ['creative', 'hobbies'] }
  ],
  // Items available in the coin shop
  shopItems: [
    { id: 'beer',     name: 'Pint of Beer',      icon: '🍺', price: 5   },
    { id: 'cigar',    name: 'Cigar',              icon: '🚬', price: 15  },
    { id: 'cinema',   name: 'Cinema Trip',        icon: '🎬', price: 15  },
    { id: 'takeaway', name: 'Takeaway',           icon: '🍕', price: 20  },
    { id: 'whiskey',  name: 'Bottle of Whiskey',  icon: '🥃', price: 35  },
    { id: 'dinner',   name: 'Dinner Out',         icon: '🍽️', price: 50  },
    { id: 'game',     name: 'New Game',           icon: '🎮', price: 60  },
    { id: 'shoes',    name: 'New Shoes',          icon: '👟', price: 80  },
    { id: 'weekend',  name: 'Weekend Away',       icon: '🏨', price: 300 }
  ],
  // Record of every in-app coin purchase
  purchases: [],
  // Last 5 logged quests for Quick Log chips
  recentQuests: [],
  // NPC daily quest completions — keyed by npcId
  npcCompletions: {}
};

// ─── File I/O ────────────────────────────────────────────────────────────────

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let data;
  if (!raw) {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData(data);
    return data;
  }
  data = JSON.parse(raw);

  // Migrations — add fields that didn't exist in older saves
  let dirty = false;
  if (!data.player.identity) {
    data.player.identity = { masterObjective: '', minorObjective: '', strengths: '', weaknesses: '' };
    dirty = true;
  }
  if (!data.skills) {
    data.skills = JSON.parse(JSON.stringify(DEFAULT_DATA.skills));
    dirty = true;
  }
  // Add Expression skill if missing (new skill added after initial release)
  if (data.skills && !data.skills.find(function(s) { return s.id === 'expression'; })) {
    data.skills.push({ id: 'expression', name: 'Expression', icon: '🎨', colour: '#ec4899', categories: ['creative', 'hobbies'] });
    dirty = true;
  }
  // Sync skill category mappings to match current defaults (in case they were changed)
  if (data.skills) {
    var defaultSkillMap = {};
    DEFAULT_DATA.skills.forEach(function(s) { defaultSkillMap[s.id] = s; });
    data.skills.forEach(function(s) {
      if (defaultSkillMap[s.id]) {
        s.categories = defaultSkillMap[s.id].categories;
      }
    });
    dirty = true;
  }
  if (data.player.savings === undefined) {
    data.player.savings = 0;
    dirty = true;
  }
  if (!data.shopItems) {
    data.shopItems = JSON.parse(JSON.stringify(DEFAULT_DATA.shopItems));
    dirty = true;
  }
  if (!data.purchases) {
    data.purchases = [];
    dirty = true;
  }
  if (!data.recentQuests) {
    data.recentQuests = [];
    dirty = true;
  }
  if (!data.npcCompletions) {
    data.npcCompletions = {};
    dirty = true;
  }
  // Migrate old category IDs → new category IDs
  const CAT_MIGRATION = {
    exercise:             'body_health',
    work:                 'career_growth',
    university:           'mind_learning',
    personal_development: 'mind_learning',
    other:                'life_admin',
    nutrition:            'body_health',
    wellbeing:            'body_health',
  };
  const newCatIds = new Set(DEFAULT_DATA.categories.map(c => c.id));
  const hasOldCats = data.categories && data.categories.some(c => CAT_MIGRATION[c.id]);
  if (hasOldCats) {
    data.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
    data.tasks.forEach(function(t) {
      if (CAT_MIGRATION[t.category]) t.category = CAT_MIGRATION[t.category];
    });
    if (data.recentQuests) {
      data.recentQuests.forEach(function(q) {
        if (CAT_MIGRATION[q.category]) q.category = CAT_MIGRATION[q.category];
      });
    }
    data.skills = JSON.parse(JSON.stringify(DEFAULT_DATA.skills));
    dirty = true;
  }
  // Ensure categories list is always the canonical set
  if (!data.categories || data.categories.length !== DEFAULT_DATA.categories.length ||
      data.categories.some(c => !newCatIds.has(c.id))) {
    data.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
    dirty = true;
  }
  if (dirty) saveData(data);
  return data;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── XP & Levelling ──────────────────────────────────────────────────────────

function xpForLevel(n) {
  return 100 * n * n;
}

function calculateXP(duration, difficulty, uncomfortability, multiplier, importance) {
  if (multiplier  === undefined) multiplier  = 1.0;
  if (importance  === undefined) importance  = 3;
  // Importance 1→1.0×, 2→1.075×, 3→1.15×, 4→1.225×, 5→1.3×
  const importanceMult = 1.0 + (importance - 1) * 0.075;
  const base = (duration * 10) + (difficulty * 12) + (uncomfortability * 15);
  return Math.round(base * multiplier * importanceMult);
}

function calculateLevel(totalXP) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXP) level++;
  return level;
}

function levelFloor(n) {
  return n > 1 ? xpForLevel(n) : 0;
}

function getXPForNextLevel(level) {
  return xpForLevel(level + 1) - levelFloor(level);
}

// ─── Coins / Finance ─────────────────────────────────────────────────────────

// Available coins = real savings minus everything spent in the shop
function computeCoins(data) {
  const spent = (data.purchases || []).reduce(function(sum, p) { return sum + p.price; }, 0);
  return Math.max(0, (data.player.savings || 0) - spent);
}

// Total spent across all purchases
function computeTotalSpent(data) {
  return (data.purchases || []).reduce(function(sum, p) { return sum + p.price; }, 0);
}

// Buy an item from the shop. Returns { ok, coinsLeft, error }
function purchaseItem(itemId) {
  const data = loadData();
  const item = (data.shopItems || []).find(function(i) { return i.id === itemId; });
  if (!item) return { ok: false, error: 'Item not found' };

  const coins = computeCoins(data);
  if (coins < item.price) return { ok: false, error: 'Not enough coins', coins: coins, need: item.price };

  data.purchases.push({
    id:       Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    itemId:   item.id,
    itemName: item.name,
    icon:     item.icon,
    price:    item.price,
    date:     new Date().toISOString().slice(0, 10)
  });

  saveData(data);
  return { ok: true, item: item, coinsLeft: computeCoins(data) };
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function computeSkillLevel(xp) {
  return Math.min(99, calculateLevel(xp));
}

function computeAllSkills(data) {
  return data.skills.map(function(skill) {
    var xp;
    if (skill.id === 'discipline' || skill.categories === null) {
      xp = data.tasks.length * 50;
    } else {
      xp = data.tasks
        .filter(function(t) { return skill.categories.indexOf(t.category) !== -1; })
        .reduce(function(sum, t) { return sum + t.xpAwarded; }, 0);
    }
    var level      = computeSkillLevel(xp);
    var floorXP    = levelFloor(level);
    var ceilXP     = xpForLevel(level + 1);
    var progressXP = xp - floorXP;
    var bracketXP  = ceilXP - floorXP;
    return { id: skill.id, name: skill.name, icon: skill.icon, colour: skill.colour,
             level: level, xp: xp, progressXP: progressXP, bracketXP: bracketXP };
  });
}

// ─── Streak ──────────────────────────────────────────────────────────────────

function updateStreak(data) {
  const today = new Date().toISOString().slice(0, 10);
  const last  = data.player.lastLoggedDate;
  if (last === today) return;
  if (last !== null) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    data.player.streak = (last === yesterday) ? data.player.streak + 1 : 1;
  } else {
    data.player.streak = 1;
  }
  data.player.lastLoggedDate = today;
}

// ─── Task Management ─────────────────────────────────────────────────────────

function addTask(taskObj) {
  const data      = loadData();
  const prevLevel = data.player.level;

  // npcMultiplier is an optional bonus multiplier for NPC quests (default 1.0)
  const npcMult = taskObj.npcMultiplier || 1.0;
  const xp = Math.round(calculateXP(
    taskObj.duration, taskObj.difficulty, taskObj.uncomfortability,
    data.player.xpMultiplier, taskObj.importance
  ) * npcMult);

  const task = {
    id:               Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name:             taskObj.name,
    category:         taskObj.category,
    date:             taskObj.date || new Date().toISOString().slice(0, 10),
    duration:         taskObj.duration,
    score:            taskObj.score !== undefined ? taskObj.score : 3,
    difficulty:       taskObj.difficulty,
    uncomfortability: taskObj.uncomfortability,
    importance:       taskObj.importance !== undefined ? taskObj.importance : 3,
    xpAwarded:        xp
  };

  // Tag NPC-sourced quests for history display
  if (taskObj.npcId) {
    task.npcId   = taskObj.npcId;
    task.npcName = taskObj.npcName || taskObj.npcId;
  }

  data.tasks.push(task);
  data.player.totalXP += xp;

  // Update Quick Log recent list — dedupe by name, newest first, cap at 5
  if (!data.recentQuests) data.recentQuests = [];
  data.recentQuests = data.recentQuests.filter(q => q.name.toLowerCase() !== task.name.toLowerCase());
  data.recentQuests.unshift({
    name:             task.name,
    category:         task.category,
    duration:         task.duration,
    difficulty:       task.difficulty,
    uncomfortability: task.uncomfortability,
    importance:       task.importance
  });
  data.recentQuests = data.recentQuests.slice(0, 5);

  const newLevel = calculateLevel(data.player.totalXP);
  data.player.level     = newLevel;
  data.player.currentXP = data.player.totalXP - levelFloor(newLevel);

  updateStreak(data);
  saveData(data);

  return { data: data, xpGained: xp, leveledUp: newLevel > prevLevel, newLevel: newLevel };
}

// ─── NPC Daily Quests ─────────────────────────────────────────────────────────

// Deterministic hash of a string → non-negative integer.
// Same input always produces the same output across all players and sessions.
function _dateHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 31) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

// Returns the quest assigned to a given NPC today (deterministic — same for all players).
function getTodaysNPCQuest(npc) {
  const today = new Date().toISOString().slice(0, 10);
  const idx   = _dateHash(today + '|' + npc.id) % npc.quests.length;
  return npc.quests[idx];
}

// Returns today's quest + completion status for every NPC.
// Shape: [{ npc, quest, xpPreview, completed, completedAt, xpAwarded }, ...]
function getDailyNPCQuests() {
  const data  = loadData();
  const today = new Date().toISOString().slice(0, 10);

  return NPCS.map(function(npc) {
    const quest      = getTodaysNPCQuest(npc);
    const rec        = data.npcCompletions[npc.id];
    const completed  = !!(rec && rec.date === today);
    const xpPreview  = Math.round(
      calculateXP(quest.duration, quest.difficulty, quest.uncomfortability,
                  data.player.xpMultiplier, 3) * npc.xpMultiplier
    );
    return {
      npc,
      quest,
      xpPreview,
      completed,
      completedAt: completed ? rec.completedAt : null,
      xpAwarded:   completed ? rec.xpAwarded   : null,
    };
  });
}

// Completes today's NPC quest for the given npcId.
// Awards XP (logged as a regular task tagged with npcId), marks the slot done.
// Returns { ok, xpGained, leveledUp, newLevel, error }
function completeNPCQuest(npcId) {
  const today = new Date().toISOString().slice(0, 10);

  // NPCS is defined in npcs.js, loaded before data.js in index.html
  if (typeof NPCS === 'undefined') return { ok: false, error: 'npcs.js not loaded' };
  const npc = NPCS.find(function(n) { return n.id === npcId; });
  if (!npc) return { ok: false, error: 'NPC not found: ' + npcId };

  // Check not already completed today
  const data = loadData();
  const rec  = data.npcCompletions[npcId];
  if (rec && rec.date === today) {
    return { ok: false, error: 'Already completed today', completedAt: rec.completedAt };
  }

  const quest  = getTodaysNPCQuest(npc);
  const result = addTask({
    name:             quest.title,
    category:         quest.category,
    duration:         quest.duration,
    difficulty:       quest.difficulty,
    uncomfortability: quest.uncomfortability,
    importance:       3,
    npcMultiplier:    npc.xpMultiplier,
    npcId:            npc.id,
    npcName:          npc.name,
  });

  // Reload after addTask saved, then record completion
  const d = loadData();
  d.npcCompletions[npcId] = {
    date:        today,
    questId:     quest.id,
    questTitle:  quest.title,
    completedAt: new Date().toISOString(),
    xpAwarded:   result.xpGained,
  };
  saveData(d);

  return {
    ok:        true,
    xpGained:  result.xpGained,
    leveledUp: result.leveledUp,
    newLevel:  result.newLevel,
  };
}
