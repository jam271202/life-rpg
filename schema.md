# Life RPG — Data Schema

All data is stored in a single file: `rpg_life.json`.

---

## Top-Level Structure

```json
{
  "player": { ... },
  "tasks": [ ... ],
  "categories": [ ... ]
}
```

---

## `player` Object

| Field           | Type     | Purpose                                                                 |
|-----------------|----------|-------------------------------------------------------------------------|
| `name`          | string   | Display name for the player                                             |
| `level`         | number   | Current level, derived from totalXP                                     |
| `currentXP`     | number   | XP accumulated toward the next level (resets on level-up)              |
| `totalXP`       | number   | Cumulative XP earned across all time                                    |
| `streak`        | number   | Consecutive days with at least one logged task                          |
| `lastLoggedDate`| string   | ISO date string (YYYY-MM-DD) of the last day a task was logged          |
| `prestigeCount` | number   | Number of times the player has prestiged (reset and started over)       |
| `xpMultiplier`  | number   | Multiplier applied to all XP calculations (default 1.0; boosted by streak/prestige) |

---

## `tasks` Array

Each element in `tasks` is a task object:

| Field               | Type   | Purpose                                                             |
|---------------------|--------|---------------------------------------------------------------------|
| `id`                | string | Unique identifier (e.g. UUID or timestamp-based)                    |
| `name`              | string | Short description of the task                                       |
| `category`          | string | ID reference to a category in the `categories` array               |
| `date`              | string | ISO date string (YYYY-MM-DD) when the task was completed            |
| `duration`          | number | Time spent in minutes                                               |
| `score`             | number | Overall score from 1–5 (optional summary rating)                    |
| `difficulty`        | number | Difficulty rating from 1–5 (1 = trivial, 5 = very hard)            |
| `uncomfortability`  | number | Uncomfortability rating from 1–5 (1 = comfortable, 5 = very uncomfortable) |
| `xpAwarded`         | number | XP granted for this task, calculated at time of logging             |

---

## `categories` Array

Each element in `categories` is a category object:

| Field    | Type   | Purpose                                      |
|----------|--------|----------------------------------------------|
| `id`     | string | Unique identifier for the category           |
| `name`   | string | Display name (e.g. "Exercise", "Work")       |
| `colour` | string | Hex colour code or CSS colour name for the UI |

---

## XP Formula

```
xp = ((duration × 10) + (difficulty × 12) + (uncomfortability × 15)) × player.xpMultiplier
```

- **duration** — minutes spent on the task
- **difficulty** — rated 1–5
- **uncomfortability** — rated 1–5
- **player.xpMultiplier** — global multiplier (default `1.0`)

Example: 30 min task, difficulty 3, uncomfortability 4, multiplier 1.0
```
xp = ((30 × 10) + (3 × 12) + (4 × 15)) × 1.0
   = (300 + 36 + 60) × 1.0
   = 396 XP
```

---

## Level Thresholds

XP required to reach level `n`:

```
xpForLevel(n) = 100 × n²
```

| Level | XP Required to Reach |
|-------|----------------------|
| 1     | 100                  |
| 2     | 400                  |
| 3     | 900                  |
| 4     | 1,600                |
| 5     | 2,500                |
| 10    | 10,000               |
| 20    | 40,000               |

`currentXP` is the XP within the current level bracket. When `currentXP >= xpForLevel(level + 1) - xpForLevel(level)`, the player levels up and `currentXP` resets to the remainder.

---

## Default Categories

| ID                    | Name                 | Colour  |
|-----------------------|----------------------|---------|
| `exercise`            | Exercise             | green   |
| `work`                | Work                 | blue    |
| `university`          | University           | purple  |
| `personal_development`| Personal Development | amber   |
| `other`               | Other                | grey    |

---

## XP Formula — Updated (with Importance)

```
importanceMult = 1.0 + (importance − 1) × 0.075   → range 1.0× (trivial) to 1.3× (critical)

xp = ((duration × 10) + (difficulty × 12) + (uncomfortability × 15))
     × player.xpMultiplier
     × importanceMult
```

| Importance | Label    | Multiplier |
|-----------|----------|------------|
| 1         | Trivial  | 1.000×     |
| 2         | Minor    | 1.075×     |
| 3         | Normal   | 1.150×     |
| 4         | Important| 1.225×     |
| 5         | Critical | 1.300×     |

---

## NPC System (`npcs.js`)

NPCs are defined in `npcs.js` as the global array `NPCS`. Each NPC offers a curated
roster of quests. When a player completes an NPC quest, XP is calculated using the
standard formula multiplied by the NPC's `xpMultiplier` (default **1.5×**) as a bonus
for stepping outside the player's normal routine.

### NPC Object

| Field         | Type    | Purpose                                                         |
|---------------|---------|-----------------------------------------------------------------|
| `id`          | string  | Unique identifier (e.g. `'gary'`, `'mei'`)                     |
| `name`        | string  | Display name (e.g. `'Gary the Gym Rat'`)                       |
| `tagline`     | string  | Short flavour quote shown on the NPC card                      |
| `avatar`      | string  | Emoji used as the NPC's portrait                               |
| `personality` | string  | Personality archetype tag (for UI styling / filtering)         |
| `xpMultiplier`| number  | Bonus multiplier applied on top of the base XP formula (1.5)   |
| `quests`      | array   | Array of quest objects (see below)                             |

### NPC Quest Object

| Field               | Type   | Purpose                                                        |
|---------------------|--------|----------------------------------------------------------------|
| `id`                | string | Unique quest identifier (e.g. `'gary_pushups'`)               |
| `title`             | string | Quest name shown to the player                                 |
| `description`       | string | Flavour text / instructions for the quest                      |
| `category`          | string | Maps to a category `id` in `data.categories`                  |
| `duration`          | number | 1–5 (pre-set; feeds `duration × 10` in XP formula)            |
| `difficulty`        | number | 1–5 (pre-set; feeds `difficulty × 12` in XP formula)          |
| `uncomfortability`  | number | 1–5 (pre-set; feeds `uncomfortability × 15` in XP formula)    |

### NPC XP Formula

```
xp = ((duration × 10) + (difficulty × 12) + (uncomfortability × 15))
     × player.xpMultiplier
     × npc.xpMultiplier        ← always 1.5 for NPC quests
     × importanceMult
```

Helper available: `calculateNPCQuestXP(quest, npc, playerMult, importance)`

### Current NPCs

| ID      | Name                        | Personality           | Focus Area             |
|---------|-----------------------------|-----------------------|------------------------|
| `gary`  | Gary the Gym Rat            | aggressive-motivational | Exercise / fitness    |
| `mei`   | Mei the Monk                | calm-philosophical    | Mindfulness / inner growth |
| `derek` | Derek the Life Admin Demon  | chaotic-productive    | Life admin / organisation |
| `brenda`| Brenda the Socialite        | warm-extroverted      | Social connection      |
| `quill` | Professor Quill             | eccentric-academic    | Learning / knowledge   |
| `rico`  | Rico the Rebel              | chaotic-adventurous   | Comfort zone challenges |
| `steel` | Sergeant Steel              | military-disciplined  | Discipline / routine   |
| `luna`  | Luna the Creative           | whimsical-artistic    | Creativity / expression|

---

## Daily Reset Logic (Planned)

NPC quests are designed to be offered on a rotating or daily basis. The intended
reset logic (to be implemented in a future update):

- Each NPC offers **1 quest per day** from their `quests` array.
- The active quest for each NPC resets at **midnight local time**.
- Selection can be deterministic (e.g. `dayOfYear % quests.length`) so the same
  player always sees the same quest on the same day, or random per session.
- A `npcDailyQuests` object in `data.js` stores `{ npcId: { questId, date, completed } }`
  so the app knows whether today's NPC quest has already been completed.
- Completing an NPC quest before midnight locks that NPC's slot until the next reset.
- The reset date is compared against `new Date().toISOString().slice(0, 10)` (YYYY-MM-DD).

### Planned `npcDailyQuests` Shape

```json
{
  "npcDailyQuests": {
    "gary": { "questId": "gary_pushups", "date": "2026-03-18", "completed": false },
    "mei":  { "questId": "mei_meditate", "date": "2026-03-18", "completed": true  }
  }
}
```
