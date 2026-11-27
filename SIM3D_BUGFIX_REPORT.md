# 3D Warehouse Simulation (`v7`) — Debug & Verification Report

## Bugs Identified & Fixed

1. **Mid-Run Equipment Spawn Reset All Vehicles**
   - **Root Cause:** `adjustFleet()` called `spawnFleet()`, wiping `sim.fleetGroup` and resetting all active/moving vehicles back to home stalls and re-queueing their tasks.
   - **Fix:** `adjustFleet()` now preserves all running vehicles untouched and only adds (`createSingleVehicle`) into the next free parking stall or cleanly removes (`removeOneVehicle`) one vehicle of the requested type.

2. **Vehicle-to-Vehicle & Obstacle Collisions / Deadlocks**
   - **Root Causes:**
     - `assignTaskToVehicle` passed `fromAisle = null`, causing diagonal shortcuts through selective racks, columns, and the East Office (`3,919` rack hits in `S1` on `v6`).
     - Idle return-to-home routed in a straight line through racks; parking stalls overlapped Highway driving lanes (`z=5.2` / `z=8.3`) and `shutter-post-s`.
     - Single-lane aisle mouths caused entering & exiting vehicles to deadlock at `(aisleX, 8.6)`, while `4.5s` timeout forced vehicles into occupied aisles.
   - **Fix:**
     - Added strict orthogonal corridor router (`buildCorridorPath` + `inferCorridor` with `PARK_Z = 9.45` cleanly distinct from `z >= 10.2` aisles).
     - Divided Highway into clockwise one-way lanes (`HWY_Z_IN = 5.2` Westbound, `HWY_Z_OUT = 7.8` Eastbound), separated Shutter docks (`SHUTTER_IN_X = 51.2`, `SHUTTER_OUT_X = 53.0`), and spaced 10 dedicated parking stalls (`PARKING_STALLS`) clear of all aisles & posts.
     - Implemented two-lane aisle mouths (`AISLE_X ± 0.90m`), single-occupant aisle & North-wall pull-through locks (`hwy_bay:*`), static AABB guard (`buildObstacleBoxes`), and direction-aware crossing clearance (`computeSafeAdvance`).

3. **Pallet Stacker Resembled a Sit-Down Forklift**
   - **Root Cause:** `buildEquipmentMesh('stacker')` included a large counterweight body, 4 overhead cage posts, and roof guard.
   - **Fix:** Rebuilt as a walkie-type electric pallet stacker: compact orange power pack on a black base skirt, red E-stop & drive wheels, offset rear tiller steering handle with thumb controls, two-stage nested black mast with hydraulic cylinder, translucent safety mesh guard screen, fixed forward straddle legs, and sliding forks.

4. **Situation 2 (`S2`) & Elevated Tier Bug**
   - **Root Cause:** `rack_master.json` stores `loc.tier` as numeric (`1`, `2`, `3`), whereas `tierElevation`, `needsStacker`, `buildStaticRacksFromData`, and S3 placement checked string `'L2'`/`'L3'`/`'L1'`, forcing all 101 `L2` and 3 `L3` locations onto the floor and misassigning `66/70` `L2` tasks to pallet jacks.
   - **Fix:** Added `tierNum(loc)` numeric/string normalizer across `tierElevation`, `needsStacker`, hitbox heights, and S3 replenishment rules, plus capped selective `L1` cargo height at `1.66m` to clear `1.85m` `L2` beams.

5. **Long Items Rendered at Stretched Standard-Pallet Proportions**
   - **Root Cause:** `buildCargoMesh` clamped Cantilever `6.1m` Unistrut to `2.75m`, rendered `3.05m` Basket Trays / `7.5m` Whip Pipe / `5.8m` Vienna arms as stretched 4-box pallets, shrunk `S3` long refills into half-bays (`1.45m`), and `attachCargoToVehicle` hardcoded `axis: 'z'` (spearing cargo forward through the mast).
   - **Fix:** Differentiated cargo builders by SKU type (`Unistrut`/`Pipe`/`Vienna arm` metallic strapped bundles, `Basket Tray` long tray stacks, `Crating` slatted timber crates, and standard `Pallet` cartons) with true `L_mm` scaling (`5.85m` on Cantilever stacked front/back in Z), full-bay `S3` long reservations, and crosswise (`axis: 'x'`) fork transport.

6. **Instant Cargo Teleportation Without Load/Unload/Lift Animation**
   - **Root Cause:** `dwell_pickup` / `dwell_drop` swapped cargo instantaneously in 1 frame and drove off before forks returned down.
   - **Fix:** Implemented 4-stage `updateDwellAnimation` timeline: smooth carriage raise to target tier (`0.08m`–`2.48m`) → horizontal `forkSlide` extension (`+0.56m`) into the bay → cargo transfer & lift/settle → fork retraction (`0`) & carriage lowering back to `0.08m` before driving away.

## Automated Headless Verification Results (`dt = 0.05s`)

| Scenario / Check | Outcome | Units / Throughput | Obstacle Hits (R/C/O/S) | Vehicle Overlaps (`<0.95m`) | Min Pairwise Dist |
|---|---|---|---|---|---|
| Static Corridor Paths (`10 stalls × 221 bays`) | PASS | `2,210` paths | `0` | — | — |
| `S1 (2J, 2S)` Putaway `0 → 225` | PASS (`1715.2s`) | `225 IN` / `225 occ` | `0 / 0 / 0 / 0` | `0` | `1.3518 m` |
| `S2 (2J, 2S)` Daily Take-Out `225 → 53` | PASS (`1348.7s`) | `172 OUT` / `53 rem` | `0 / 0 / 0 / 0` | `0` | `1.3027 m` |
| `S3 (3J, 3S)` Mixed `OUT` + `IN` Refill | PASS (`1069.3s`) | `172 OUT` / `25 IN` (`78 end`) | `0 / 0 / 0 / 0` | `0` | `1.3500 m` |
| `S1 Stress (5J, 5S)` Max 10 Fleet | PASS (`943.8s`) | `225 IN` / `225 occ` | `0 / 0 / 0 / 0` | `0` | `1.1075 m` |
| `S2 Stress (5J, 5S)` Max 10 Fleet | PASS (`690.2s`) | `172 OUT` / `53 rem` | `0 / 0 / 0 / 0` | `0` | `1.2520 m` |
| `S3 Stress (5J, 5S)` Max 10 Fleet | PASS (`761.0s`) | `172 OUT` / `25 IN` (`78 end`) | `0 / 0 / 0 / 0` | `0` | `1.2400 m` |
| `S1` Mid-Run `+1J / -1S` (`t = 20s`) | PASS (`3246.6s`) | `0` teleports · `225 IN` | `0 / 0 / 0 / 0` | `0` | `1.2669 m` |
