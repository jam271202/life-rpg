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
    { id: 'exercise',             name: 'Exercise',             colour: '#22c55e' },
    { id: 'work',                 name: 'Work',                 colour: '#3b82f6' },
    { id: 'university',           name: 'University',           colour: '#a855f7' },
    { id: 'personal_development', name: 'Personal Development', colour: '#f59e0b' },
    { id: 'other',                name: 'Other',                colour: '#6b7280' }
  ],
  skills: [
    { id: 'health',     name: 'Health',     icon: '❤️',  colour: '#22c55e', categories: ['exercise'] },
    { id: 'learning',   name: 'Learning',   icon: '🧠',  colour: '#a855f7', categories: ['university', 'personal_development'] },
    { id: 'financial',  name: 'Financial',  icon: '💰',  colour: '#f59e0b', categories: ['work'] },
    { id: 'social',     name: 'Social',     icon: '🗣️', colour: '#3b82f6', categories: ['other'] },
    { id: 'discipline', name: 'Discipline', icon: '⚡',  colour: '#ef4444', categories: null }
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
  purchases: []
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

function calculateXP(duration, difficulty, uncomfortability, multiplier) {
  if (multiplier === undefined) multiplier = 1.0;
  const base = (duration * 10) + (difficulty * 12) + (uncomfortability * 15);
  return Math.round(base * multiplier);
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

  const xp = calculateXP(
    taskObj.duration, taskObj.difficulty, taskObj.uncomfortability, data.player.xpMultiplier
  );

  const task = {
    id:               Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name:             taskObj.name,
    category:         taskObj.category,
    date:             taskObj.date || new Date().toISOString().slice(0, 10),
    duration:         taskObj.duration,
    score:            taskObj.score !== undefined ? taskObj.score : 3,
    difficulty:       taskObj.difficulty,
    uncomfortability: taskObj.uncomfortability,
    xpAwarded:        xp
  };

  data.tasks.push(task);
  data.player.totalXP += xp;

  const newLevel = calculateLevel(data.player.totalXP);
  data.player.level     = newLevel;
  data.player.currentXP = data.player.totalXP - levelFloor(newLevel);

  updateStreak(data);
  saveData(data);

  return { data: data, xpGained: xp, leveledUp: newLevel > prevLevel, newLevel: newLevel };
}
