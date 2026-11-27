[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?ref=zxv8k0jn)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Tokocrypto96/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?ref=zxv8k0jn)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Tokocrypto96/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?ref=zxv8k0jn)

# Sky Courier — Meridian Isles

A tiny original bush-plane game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057?ref=zxv8k0jn) (referral code `zxv8k0jn`).

Fly the mail plane across a hand-built island chain in a chase view over
real 3D terrain: thread six glowing rings, drop a parcel on the clinic's
orange circle, then bring her home onto the grass strip — gently. Throttle
and turn discipline matter: bank too hard and you bleed speed, fly too slow
and the wing stalls, firewall the throttle and the fuel gauge is the bill.

## How to play

Open `game/index.html` in a desktop browser (or serve `game/` with any
static server). No network, no build step — every file the game loads lives
under `game/`.

| Key | What it does |
| --- | --- |
| Arrow Up / Down | Pitch down / up |
| Arrow Left / Right | Bank left / right (banked turns steer) |
| W / S (or Shift / Ctrl) | Throttle up / down |
| Space | Drop the parcel (Mission 2) |
| Mouse (hold left button) | Steer with the pointer |
| P | Pause · R restart · M sound on/off · Enter start |

The HUD shows airspeed (kt), altitude (ft) and a heading compass, plus an
artificial horizon, throttle / fuel / damage bars and a live minimap. Land
on the runway under 110 kt with a gentle descent and the sortie counts;
hit the mountain or the sea and it does not.

## Missions

1. **Ring Run** — thread all 6 rings in order (centred passes score more).
2. **Supply Drop** — drop the parcel on the orange circle; accuracy scores.
3. **Island Landing** — land on the runway. Smoothness + remaining fuel score.

Finish all three and the day is done. Best score is kept in the browser.

## How it is built

Pure JavaScript + Canvas 2D, no engine, no libraries: a hand-rolled
perspective projector paints the sky, sea, terrain mesh, runway, rings,
trees and clouds, and the plane itself is a small flat-shaded 3D model.
Every sound (engine, wind, chimes, alarms) is synthesized with WebAudio.

```
game/
  index.html        the page
  src/main.js       boot, loop, state machine, autopilot
  src/flight.js     the flight model (throttle, bank, stall, fuel)
  src/terrain.js    the isles: heightmap, runway, trees, clouds
  src/render3d.js   chase camera + everything it sees
  src/hud.js        instruments: compass, horizon, gauges, minimap
  src/missions.js   the three-sortie campaign + scoring
  src/audio.js      synthesized engine, wind and bells
  src/input.js      keyboard + mouse
  src/particles.js  smoke, spray, wreckage
```

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `dossier.json` with
`buildDossier` from `vendor/makefun-game.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
