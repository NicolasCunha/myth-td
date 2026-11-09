<div align="center">

# Myth TD ⚡

**A mythological tower defense roguelite — gods against the horde.**

Greek, Norse and Egyptian gods defend a central core against waves coming from every side of the grid.<br>
Short, intense runs of 10–20 minutes, right in the browser: no install, no account.

[**Play now →**](https://nicolascunha.github.io/myth-td/)

![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white)
![Canvas 2D](https://img.shields.io/badge/Canvas_2D-no_engine-e8a33d)
![Assets](https://img.shields.io/badge/art_%26_audio-100%25_code-7e57c2)
![Cost](https://img.shields.io/badge/running_cost-%240-2e7d32)

<br>

<img width="1080" height="860" alt="image" src="https://github.com/user-attachments/assets/2eb8ec2c-9788-41da-b3f3-bd7d0cdd5417" />

</div>

> The game is in Brazilian Portuguese 🇧🇷.

---

## ✨ What it does

<table>
<tr>
<td width="50%" valign="top">

### 🏛️ Gods as towers
Each tower is a mythological figure with its own range shape and pixel-art silhouette. **Only one of each god** can be on the map, so the real choice is *which pantheon combo* you bring — not which tower to spam. Up to 10 towers per run, picked beforehand on the **Team** screen.

### 🧭 Three pantheons, three ideas
- **Greek** — lines, crosses and radii, plus passives (Hera, Hades, Hermes) that buff the whole team.
- **Egyptian** — *directional*: the shape depends on where the tower faces (Ra's sunbeam, Anubis' cone, Thoth's artillery…).
- **Norse** — directional too, and every hit applies a status: Fenrir's frenzy and bleed, Odin's mark, Skadi's freeze, Loki's push.

### 🌊 Hordes, not corridors
Enemies spawn from all four edges and walk the grid in L and Z shapes — fast ones cut diagonally. Grunts, tanks, healers, then elites, two Titans and the final boss **Typhon**, who summons monsters and must be defeated to win.

</td>
<td width="50%" valign="top">

### ✨ Blessings & divine powers
Every kill milestone freezes time and offers 3 blessings (common, uncommon or rare) that shape the run's build — chain lightning, extra projectiles, execution… Late in the run, spend Favor on powers: **Zeus' Wrath**, **Aegis**, **Chronos** and **Tidal Wave** (keys 1–4).

### ⬆️ Upgrades & mythic forms
Click a tower to open its card (in slow motion): upgrade up to level 4, where it evolves into its mythic form — *Olympian Zeus*, *Anubis the Judge*… — or sell it back for half.

### 🍯 Progress between runs
Win or lose, you earn **Ambrosia** to unlock new gods in the **Shop** and grow a 6-branch **upgrade tree**: starting Favor, damage, attack speed, a duplicate god, more Ambrosia and the divine powers.

</td>
</tr>
</table>

### And also

- 🎯 **Pick a direction** — building enters slow motion and shows the range live while you aim with the mouse (or arrows/WASD).
- 🎓 **Guided tutorial** on the first run, with a skip button on every step.
- ⏩ **1x / 2x / 4x speed**, pause and back to the menu with save.
- 🎵 **Procedural music and sound** — the run's soundtrack speeds up from 92 to 168 BPM as the end approaches.
- 💥 **Juice** — a hit signature per god, kill explosions with Favor coins, combo pitch, crits and screen shake.
- 💾 **Local save** — run, progress, team and settings in the browser, with JSON export/import to move between devices.

## 🎨 Made entirely with code

There isn't a single image or audio file in the game:

| What | How |
| --- | --- |
| Sprites | 16x16 grids defined in TypeScript, with automatic outline, pre-rendered once into an offscreen canvas |
| Animation | Canvas transforms over static sprites — the weapon arm rotates around the shoulder in a 3-phase attack (wind-up → strike → recovery) |
| Effects | A visual-only particle system that runs on game time (pause freezes it, slow motion slows it) |
| Music & SFX | Web Audio API: oscillators, envelopes and a custom sequencer for the menu and run themes |

The result is a 100% static deploy with a tiny bundle and no asset pipeline.

## 🛠️ Tech stack

- [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/) — static build
- Canvas 2D — rendering, no game engine
- Web Audio API — procedural music and sound effects
- `localStorage` — saves, progress and settings
- [Rolldown](https://rolldown.rs/) — bundles the balancing simulator for Node
- GitHub Pages + GitHub Actions — hosting and deployment

## 🚀 Getting started

### Requirements

- Node.js (LTS) and Git

### Run locally

```bash
git clone https://github.com/NicolasCunha/myth-td.git
cd myth-td
npm install
npm run dev
```

No keys and no environment variables — it's ready to play.

### Build

```bash
npm run build
npm run preview
```

## 🤖 Balancing by simulation

`npm run sim` runs the real `Game` in Node (with a fake DOM) and a bot that places towers along the enemy traffic map, upgrades them and picks blessings — so balance is decided with numbers, not guesses.

```bash
npm run sim -- times 30     # win rate per team
npm run sim -- inicio 30    # first runs and the Shop economy
npm run sim -- poderes 30   # with vs. without divine powers
npm run sim -- bencaos 30   # impact of each blessing
```

Use ≥30 runs to decide anything — with fewer, the variance is large. Many numbers in the game (Hades' slow, the mythic forms, the late-game curve) were tuned this way.

## 📦 Deployment

Every push to `main` builds and deploys the game to GitHub Pages through GitHub Actions. It needs, once: *Settings → Pages → Source = GitHub Actions*.

## 🗺️ Roadmap

- [x] **Prototype** — grid, core, a tower, an enemy
- [x] **Playable run** — Greek pantheon, enemy archetypes, win and loss
- [x] **Upgrades & mythic forms**, sell towers, tower card
- [x] **Blessings** with rarities and reroll
- [x] **Meta progression** — Ambrosia, Shop, Team and the upgrade tree
- [x] **Egyptian and Norse pantheons** — directional towers and status effects
- [x] **Bosses** — Titans and Typhon, elites in the final phase
- [x] **Divine powers** — a Favor sink for the end of the run
- [x] **Procedural audio**, visual effects and tutorial
- [ ] **Towers that block the path** — maze style, or always walk-through?
- [ ] **More pantheons**, maps and difficulty modes

The full design lives in the [GDD](GDD.md) (in Portuguese).

<div align="center">
<br>
<sub>A personal project, built with the help of <a href="https://claude.ai">Claude</a>. ⚡</sub>
</div>
