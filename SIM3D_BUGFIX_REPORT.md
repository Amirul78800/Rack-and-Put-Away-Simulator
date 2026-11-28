# 3D Warehouse Simulation (`v7` → `v8`) — Debug & Verification Report

## Bugs Identified & Fixed

### `v7` Baseline Fixes (Verified by User)

1. **Mid-Run Equipment Spawn Reset All Vehicles**
   - **Root Cause:** `adjustFleet()` called `spawnFleet()`, wiping `sim.fleetGroup` and resetting all active/moving vehicles back to home stalls and re-queueing their tasks.
   - **Fix:** `adjustFleet()` now preserves all running vehicles untouched and only adds (`createSingleVehicle`) into the next free parking stall or cleanly removes (`removeOneVehicle`) one vehicle of the requested type.

2. **Pallet Stacker Resembled a Sit-Down Forklift**
   - **Root Cause:** `buildEquipmentMesh('stacker')` included a sit-down counterweight body, 4 overhead cage posts, and roof guard.
   - **Fix:** Rebuilt as a walkie-type electric pallet stacker: compact orange power pack on a black base skirt, red E-stop & drive wheels, offset rear tiller steering handle with thumb controls, two-stage nested black mast with hydraulic cylinder, translucent safety mesh guard screen, fixed forward straddle legs, and sliding forks.

3. **Elevated Rack Tier Detection (`L1` / `L2` / `L3`)**
   - **Root Cause:** `rack_master.json` stores `loc.tier` numerically (`1`, `2`, `3`), whereas earlier checks matched strings `'L2'` / `'L3'`, placing elevated items on the floor and assigning elevated picks to pallet jacks.
   - **Fix:** Added `tierNum(loc)` numeric/string normalizer across `tierElevation()`, `needsStacker()`, bay hitboxes, and S3 replenishment rules, plus capped selective `L1` cargo height at `1.66m` to clear `1.85m` `L2` beams.

4. **Load / Unload / Lifting Animation**
   - **Root Cause:** `dwell_pickup` / `dwell_drop` swapped cargo instantaneously in 1 frame.
   - **Fix:** Implemented 4-stage `updateDwellAnimation()` timeline: smooth carriage raise (`0.08m`–`2.48m`) → horizontal `forkSlide` extension (`+0.56m`) → cargo transfer & lift/settle → fork retraction (`0`) & carriage lowering to `0.08m` before driving away, with pre-spawn neighbor OBB clearance check at `prog = 0.52` and rotation guard during dwell alignment.

---

### `v8` Root Fixes & Intelligent Traffic Features

5. **Situation 2 (`S2`) Instant `00:00` Complete Bug & Shrunk Long Cargo Under Live API (`#4` & `#5`)**
   - **Root Cause (Proven Against Live `server.build_state('live')`):** `rack_master.json` stores `skus` as a tag-keyed Object (`{U1: {...}}`), whereas `app/server.py` (`build_state`) converts `skus` into a **58-element JSON Array** (`[{tag, ...}]`). Because `app.js` passed the live API payload directly into `sim3d.js`, `skus[tag]` returned `undefined` (shrinking all 152 long SKUs across Selective/Floor/Cantilever bays back to `1100mm` 1-pallet fallbacks) and `Object.entries(skus)` iterated `"0".."57"` (matching `0` rack slots, enqueueing `0` S2 picks and triggering `S2 Complete — Day 5 End` at `00:00`).
   - **Fix:** Added `normalizeSkusMap(rawSkus)` across `buildDay0SlotModel()`, `setSlotCargo()`, and `planScenarioQueues()` so both tag-keyed Objects and 58-item API Arrays resolve identically. Confirmed exact proportional visual sizes across all 5 item tiers:
     - 1-pallet standard (`<=1250mm`): `U4` (`R01-R01-L1`: `1.056m × 1.627m × 1.100m`)
     - 2-slot / SPAN (`1300–3050mm`): `U2` (`R03-R01-L1`: `1.035m × 1.476m × 2.156m`), `U24` (`R07-R01-L1`: `1.067m × 1.010m × 3.050m`)
     - 3.85 m crating: `U1` (`R11-R01-L1`: `0.833m × 1.743m × 3.685m`)
     - 5.8 m & 7.5 m Highway Floor pipes/bundles: `U11` (`HWY-FLOOR-01`: `5.452m × 1.345m × 1.653m`), `U26` (`HWY-FLOOR-02`: `7.050m × 0.575m × 0.944m`)
     - 6.1 m Cantilever Unistrut: `U13` (`CANT-R01-L1`: `5.850m × 0.435m × 0.304m`)

6. **Rotated Cargo + Chassis OBB Collision Control & Deadlock-Free Routing**
   - **Root Cause:** Earlier center-point checks missed long `3.05m–7.50m` rotated cargo tails overhanging racks, Shutter posts (`4.80m` opening), aisle wait buffers, or neighboring vehicles; `hwy_bay:R01-R13` could also remain orphaned in `sim.aisleOccupant` when a vehicle turned immediately into `(3.0, 9.95)` for `aisle1`, and vehicles starting `to_pickup` inside the same bay as their previous `dwell_drop` (`<0.08m`) stalled on empty `buildCorridorPath` arrays.
   - **Fixes:**
     - Added `getCargoCarrySpec()` & `getVehicleWorldAABB()` computing rotated world AABBs (`chassis + carried load`) for lengthwise (`>1.5m`) and crosswise (`<=1.5m`) transport, plus East-West crabbing (`±π/2`) on North-wall (`L>=5000`) pull-through moves.
     - Enforced strict obstacle OBB checks (racks, structural columns, East Office, North/South Shutter posts) and dynamic OBB separation + turning clearance (`computeSafeAdvance()`).
     - Separated vertical aisle waiting buffers cleanly off-Highway at `(AISLE_X - 1.30, 9.95)`, staggered `PARKING_STALLS` at `PARK_Z = 9.68` clear of columns and Highway traffic, shifted Cantilever access points (`CANT-R01` `35.4 -> 35.9`, `CANT-R02` `42.8`, `CANT-R03` `46.6`), capped per-aisle concurrency (`<=2`) & `SHUTTER_IN` queue depth (`<=3`), added East-Dock (`50.5..53.5`) mutex, yield guards at North-wall (`z=4.10`), aisle exits (`z=10.45..10.95`), and Highway south crossings (`z=5.45`), handled `0`-waypoint same-bay transitions in `stepVehicle`, and fixed `exitedHwyBay` + defensive lock cleanup before overwriting `v.heldAisle`.

7. **Long-Items-First Priority Dispatch**
   - **Implementation:** Added `taskPriorityRank(sku, wt)` sorting `L >= 5500` → `L >= 3500` → `L >= 2500` → `1250–2500` → heavy `>1400 kg` → standard pallets first across `S1`, `S2` (per-day batch), and `S3` (emitting long refills ahead of standard picks within each day). Confirmed `S2` Day 1 starts `[6100, 3850, 3850, 3050, ...]` and finishes with `[1100, ...]`.

8. **Intelligent Highway Blockade Pull-Out Bypass (`tryStartBypass`)**
   - **Implementation:** When mutually blockaded on `HWY_Z_IN` / `HWY_Z_OUT` (or yielding off a North-wall wait / congested 2nd aisle buffer), eligible vehicles (`L <= 3500`) reserve and pull temporarily into an unobstructed `PARKING_STALLS` slot (`park:*`) or unlocked empty vertical aisle pocket (`aisle:*`, checked via OBB against obstacles/vehicles), hold cleanly (`bypassTimer`), release `bypassClaims`, and resume their active task via `resumeFromBypass()`.

9. **Weight & Length Dynamic Travel Speed Scaling (`getEffectiveSpeed`)**
   - **Implementation:** Empty Pallet Jack `4.40 m/s` (`Stacker` `3.90 m/s`) scales smoothly down to `0.85×` (`stdPallet: 3.74 m/s`), `0.74×` (`>2.5 m` or `>1000 kg`), `0.64×` (`>3.5 m` or `>1500 kg`, e.g. `U1` on Stacker `2.496 m/s`), and `0.52×` (`>5.5 m` or `>2500 kg`, e.g. `U26` `7.5 m` Whip Pipe on Stacker `2.028 m/s`).

---

## Multi-Agent Headless Verification Against Raw `server.build_state('live')` (`v8`)

| Scenario / Audit Check | Outcome | Units / Throughput | Rotated OBB Obstacle Hits | Rotated OBB Veh Overlaps | Min Pairwise Dist / Notes |
|---|---|---|---|---|---|
| `S1 (2J, 2S)` Putaway `0 → 225` | PASS (`2058.71s`) | `225 IN` / `225 occ` | `0` | `0` | `1.3013 m` · `2` bypasses · `14` aisle waits |
| `S2 (2J, 2S)` Take-Out `225 → 53` | PASS (`1535.08s`) | `172 OUT` / `53 rem` | `0` | `0` | `1.3011 m` · `172` tasks queued cleanly under Array `skus` |
| `S3 (3J, 3S)` Mixed `OUT` + `IN` | PASS (`1196.58s`) | `172 OUT` / `25 IN` (`78 end`) | `0` | `0` | `1.3000 m` · `2` bypasses · `16` aisle waits |
| `S1 Stress (5J, 5S)` Max 10 Fleet | PASS (`1431.96s`) | `225 IN` / `225 occ` | `0` | `0` | `1.3000 m` · `1` bypass |
| `S2 Stress (5J, 5S)` Max 10 Fleet | PASS (`815.58s`) | `172 OUT` / `53 rem` | `0` | `0` | `1.3000 m` |
| `S3 Stress (5J, 5S)` Max 10 Fleet | PASS (`973.45s`) | `172 OUT` / `25 IN` (`78 end`) | `0` | `0` | `1.0730 m` · `2` bypasses |
| **QA Agent:** `S3` Mid-Run `+1J/+1S` (`t=60s`) & `-1J` (`t=120s`) | PASS (`1336.33s`) | `0.00 m` teleport · `172 OUT` / `25 IN` | `0` | `0` | `0` orphan locks · `0` state resets |
| **QA Agent:** Forced Head-On `S2` Highway Blockade | PASS (`1557.71s`) | `172 OUT` / `3` pull-out bypasses | `0` | `0` | Pulls to `park:5`, `aisle:aisle6`, `park:7` & resumes (`claims=0`) |
| **QA Agent:** `S2` Elevations & Equipment Rules | PASS | `97` Stacker (`L2/L3 <= 2.56m`), `75` Jack | `0` | `0` | `0` Jack tasks on `L2/L3`, `Cant`, or `>1400 kg` |

---

### `v9 (Option 1)` — Realistic Crosswise Forks (`<= 4.0m`) & Dolly-to-Stacker (`5.8m–7.5m`)

10. **Option 1 Physical Carry Modes (`app/sim3d.js`)**
    - **`L_mm <= 4000` (`1.1m`–`3.85m`):** Carried perpendicular crosswise across front forks (`carryMode: 'forks'`, `carryAxis: 'x'`), seated ahead of mast/tiller.
    - **`L_mm > 4500` (`5.8m` `U11`, `6.1m` `U12/U13/U47`, `7.5m` `U26`):** Rolled lengthwise on a rendered steel dolly cradle (`carryMode: 'dolly'`, `carryAxis: 'z'`) between Shutter Door and Zone 3 bays (`HWY-FLOOR-01/02`, `CANT-R01..03`), then transferred cleanly to Walkie Pallet Stacker crosswise forks (`carryAxis: 'x'`) at the bay during `updateDwellAnimation()`.
    - **Highway Lane & Bay Geometry:**
      - Adjusted `CANT-R01` `accessX` to `36.15` (`aisleZ: 3.90`) to clear `aisle5` (`32.2`) and `6.10m` Highway traffic.
      - Separated `2.2m` Highway lanes: Westbound `z = 5.75`, Eastbound `z = 7.65` (`0.052m` Z-clearance), `3.05m–3.85m` Highway lane `z = 6.10`, with opposing-direction wide-load Highway lock in `idle` dispatch.
      - Refined `computeSafeAdvance()`, `tryStartBypass()` (`Option A/B/C/D/D-East` with multi-candidate fallback, `overrideYaw` rear-pinning clearance, unlocked-aisle wait-buffer skip, orthogonal L-step for diagonal `z >= 9.0` blocks, and `oStationary` `z >= 9.0 / z <= 4.4` guards), `East-Dock Mutex` (`maxCheckZ = 8.3`, `o.x >= 51.0`), `East-Dock North-Cross Yield` (`shutterInBusy` guard), and `idle` dispatch guard preventing opposing `2.2m` `put` vs `3.05m+` `pick` when East apron has `>= 2` occupied stalls (`x >= 44.0 && z >= 8.8`).

### Current `v9 (Option 1)` Headless OBB Verification (`test_sim3d_v9.mjs`, `7 / 7` Passing)

| Scenario | Status | Metrics | OBB Obs Hits | OBB Veh Overlaps | Opp Wide Hwy Conflicts |
|---|---|---|---|---|---|
| `S1 (2J, 2S)` | **PASS** (`2313.96s`) | `225 IN` / `52` bypasses | `0` | `0` | `0` |
| `S2 (2J, 2S)` | **PASS** (`1846.83s`) | `172 OUT` / `80` bypasses | `0` | `0` | `0` |
| `S3 (3J, 3S)` | **PASS** (`1661.58s`) | `25 IN`, `172 OUT` / `142` bypasses | `0` | `0` | `0` |
| `S1 Stress (5J, 5S)` | **PASS** (`2056.83s`) | `225 IN` / `84` bypasses | `0` | `0` | `0` |
| `S2 Stress (5J, 5S)` | **PASS** (`1589.21s`) | `172 OUT` / `111` bypasses | `0` | `0` | `0` |
| `S3 Stress (5J, 5S)` | **PASS** (`1757.83s`) | `25 IN`, `172 OUT` / `136` bypasses | `0` | `0` | `0` |
| `S3 MidRun Fleet` | **PASS** (`1779.46s`) | `25 IN`, `172 OUT` / `99` bypasses | `0` | `0` | `0` |
