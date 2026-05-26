# Tasty Travels (Prototype)

Mobile-first browser merge game prototype built with vanilla HTML/CSS/JS and Matter.js.

## How to Run

No build step is required.

### Option A: Open directly
1. Open `tasty-travels/index.html` in any modern browser.

### Option B: Serve locally (recommended for mobile testing)
1. From the repository root:
   - `python3 -m http.server 8080`
2. Open:
   - `http://localhost:8080/tasty-travels/`

## Controls

- **Mouse / touch drag:** Pull the current drink below the launch line.
- **Release:** Flick it up the table.
- Matching same-tier drinks merge into higher tiers.

## Implemented Features

- Top-down Matter.js physics with no gravity
- Slingshot-style launch from a fixed spawn point
- Same-tier merge chain (10 configured tiers)
- Coin rewards for merges and completed orders
- Order card system with dynamic target tier scaling
- Danger line game-over state
- Next-drink preview and collection progress bar
- LocalStorage persistence for:
  - coins
  - highest discovered tier
  - completed order count
  - discovered drink tiers
- Ambient sparkles/firework effects and merge particles
- Lightweight procedural sound effects via Web Audio API

## File Structure

- `index.html` - Canvas + HUD overlay structure
- `styles.css` - Mobile-first visuals and layout
- `drinks.js` - Tier config array and helper lookups
- `ui.js` - HUD rendering/bindings and floating text
- `audio.js` - SFX controller
- `game.js` - Matter.js setup, gameplay loop, rendering, persistence

## Tuning Notes

The easiest gameplay knobs live in `game.js` inside `GAME_CONFIG`:
- `linearDamping`
- `launchVelocityScale`
- `maxLaunchSpeed`
- `launchSpawnCooldownMs`
- `dangerTimeoutMs`

Per-drink balance (radius, merge chain, sprite) is in `drinks.js`.

## TODO (Art + Expansion)

- [ ] Replace emoji placeholders with final illustrated/SVG drink sprites
- [ ] Implement full store screen and purchasable upgrades
- [ ] Tune spawn weighting, merge rewards, and order difficulty curve
- [ ] Add richer table/wall collision sounds and background music
- [ ] Add win-state celebration sequence for Tropical Pitcher streak goals
