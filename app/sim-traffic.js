// Simulation Traffic Controller: Dispatch, OBB Separation, Bypass Pull-Outs & Dwell Animation
import { HWY_Z_IN, HWY_Z_MID, HWY_Z_OUT, PARK_Z, HWY_WALL_Z, SHUTTER_IN_X, SHUTTER_OUT_X, AISLE_X, PARKING_STALLS, tierElevation, usesLongDolly, isWideCrosswise, hwyWideZ, getCargoCarrySpec, getVehicleWorldAABB, buildCorridorPath, aabbOverlap, getMoveYaw } from './sim-geometry.js';

export function createTrafficEngine({ sim, setSlotCargo, attachCargoToVehicle, clearVehicleCargo, updatePhaseBanner }) {
  function assignTaskToVehicle(v, task) {
    v.task = task;
    v.activeTaskStartSec = +sim.simTimeSec.toFixed(2);
    v.returningHome = false;
    v.dwellSwapped = false;
    v.dwellDollySwapped = false;
    const skuL = Number(task.sku?.L_mm || 0);
    const wideShutter = skuL >= 2500 && skuL <= 4500;
    if (task.kind === 'put') {
      v.state = 'to_pickup';
      v.waypoints = buildCorridorPath(v.x, v.z, SHUTTER_IN_X, wideShutter ? hwyWideZ(task.sku) : HWY_Z_IN, 'hwy', null, null, task.sku);
      v.wpIdx = 0;
    } else {
      v.state = 'to_pickup';
      const p = task.slot.pose;
      const lockKey = p.aisleKey === 'hwy' ? `hwy_bay:${p.key}` : p.aisleKey;
      v.waypoints = buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey, null, task.sku);
      v.wpIdx = 0;
    }
  }

  function getEffectiveSpeed(v) {
    const base = v.type === 'jack' ? 4.4 : 3.9;
    if (!v.carryingSpec) return base;
    const { wt, L_mm } = v.carryingSpec;
    if (L_mm > 5500 || wt > 2500) return base * 0.52;
    if (L_mm > 3500 || wt > 1500) return base * 0.64;
    if (L_mm > 2500 || wt > 1000) return base * 0.74;
    return base * 0.85;
  }

  function computeSafeAdvance(v, nx, nz, dirX, dirZ, wp, overrideYaw = null) {
    const nextYaw = overrideYaw !== null ? overrideYaw : getMoveYaw(v, dirX, dirZ, wp);
    const aabb = getVehicleWorldAABB(nx, nz, nextYaw, v.carryingSpec);

    // 1. Static Obstacle OBB/AABB guard (covers BOTH chassis and carried long cargo)
    for (const b of sim.obstacleBoxes) {
      if (aabbOverlap(aabb, b, 0.02)) {
        return { blocked: true, reason: 'obstacle' };
      }
    }

    // 2. Dynamic Vehicle & Cargo OBB Separation + Priority Deadlock Breaker
    const movingHoriz = Math.abs(dirX) > 0.7;
    const movingVert = Math.abs(dirZ) > 0.7;
    const curAabb = getVehicleWorldAABB(v.x, v.z, v.yaw, v.carryingSpec);
    const vHalfX = (aabb.maxX - aabb.minX) * 0.5;
    const vHalfZ = (aabb.maxZ - aabb.minZ) * 0.5;

    for (const o of sim.vehicles) {
      if (o.uid === v.uid) continue;
      const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
      const oHalfX = (oAabb.maxX - oAabb.minX) * 0.5;
      const oHalfZ = (oAabb.maxZ - oAabb.minZ) * 0.5;

      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const curD = Math.hypot(dx, dz);
      const nextD = Math.hypot(o.x - nx, o.z - nz);

      // Compute priority tie-break early so stalled perpendicular junctions never starve; aisle-exit holders always outrank
      const oStalled = ((o.blockWait || 0) > 0.35 || (o.waitAccum || 0) > 0) && o.state !== 'dwell_pickup' && o.state !== 'dwell_drop';
      const vPrio = (v.heldAisle ? 2000 : 0) + (v.z >= 7.8 && v.z <= 8.5 ? 900 : (v.z < 8.5 ? 700 : 200)) + (v.state === 'to_drop' ? 500 : 0) - v.uid;
      const oPrio = (o.heldAisle ? 2000 : 0) + (o.z >= 7.8 && o.z <= 8.5 ? 900 : (o.z < 8.5 ? 700 : 200)) + (o.state === 'to_drop' ? 500 : 0) - o.uid;
      const canTieBreak = oStalled && ((v.blockWait || 0) > 0.35 || (v.waitAccum || 0) === 0 && (o.waitAccum || 0) > 0) && vPrio > oPrio && !aabbOverlap(aabb, oAabb, 0.005);

      const isParkedIdle = (o.state === 'idle' && !o.returningHome) || (o.bypassing && o.wpIdx >= (o.waypoints?.length || 0));
      const isWallDocked = o.z <= HWY_WALL_Z + 0.35;
      // Forbid any move/turn that creates a new physical OBB overlap, and maintain approaching buffer
      if (aabbOverlap(aabb, oAabb, 0.005) && !aabbOverlap(curAabb, oAabb, 0.005)) {
        return { blocked: true, reason: 'vehicle', by: o };
      }
      const bufPad = (movingHoriz && Math.abs(o.z - v.z) > 0.5) ? 0.015 : ((isParkedIdle || isWallDocked || (o.waitAccum || 0) > 0) ? 0.05 : (v.bypassing ? 0.08 : 0.16));
      if (aabbOverlap(aabb, oAabb, bufPad) && nextD < curD && !canTieBreak) {
        return { blocked: true, reason: 'vehicle', by: o };
      }

      if (movingHoriz && !v.bypassing) {
        const dzAbs = Math.abs(o.z - nz);
        const aheadX = (o.x - nx) * dirX;
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        const oIntentVert = Boolean(oWp && Math.abs(oWp.z - o.z) > 0.25 && Math.abs(oWp.x - o.x) < 0.35);
        // Ignore North-wall vehicles still parked at HWY_WALL_Z waiting to pull out (avoid mutual polite deadlock)
        const oCrossingVert = !isWallDocked && Boolean(o.heldAisle?.startsWith('hwy_bay:') || oIntentVert);
        const oMovingHoriz = !oCrossingVert && (Math.abs(Math.sin(o.yaw || 0)) > 0.7 || (oWp && Math.abs(oWp.x - o.x) > 0.25));
        const followDistX = vHalfX + oHalfX + 0.90;
        if (dzAbs < Math.max(0.85, vHalfZ + oHalfZ + 0.04) && oMovingHoriz && aheadX > 0 && aheadX < followDistX) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
        const oDirZ = isWallDocked ? 0 : (oWp
          ? (Math.abs(oWp.z - o.z) > 0.25 ? Math.sign(oWp.z - o.z) : 0)
          : (!oMovingHoriz ? Math.sign(Math.cos(o.yaw || 0)) : 0));
        const oExitingAisle = (oDirZ < 0 && o.z >= 7.8 && o.z <= 9.85) || (oDirZ > 0 && o.heldAisle?.startsWith('hwy_bay:'));
        // Check actual Z-interval overlap + 0.12m (instead of padded dzAbs) so 10.2m aisle waiters never false-trigger 7.95 braking
        const zBandHit = aabb.minZ < oAabb.maxZ + 0.12 && aabb.maxZ > oAabb.minZ - 0.12;
        const oBlocksLane = zBandHit || (oDirZ !== 0 && (nz - o.z) * oDirZ > 0 && dzAbs < (oExitingAisle ? 5.0 : 1.95));
        const oTurnHalfX = !oMovingHoriz ? Math.max(oHalfX, oHalfZ) : oHalfX;
        const crossStopMin = vHalfX + oHalfX + 0.25;
        const crossStopMax = vHalfX + oTurnHalfX + 0.95;
        // Allow wall-docked stacker finishing a bay drop or actively exiting south to 7.95 clearance before wide Highway loads pass its X span
        const oExitingWall = isWallDocked && ((oWp && oWp.z >= 7.0) || (o.state === 'dwell_drop' && o.dwellSwapped));
        if (oExitingWall && zBandHit && aheadX >= 0.05 && aheadX < crossStopMax + 0.8 && !canTieBreak) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
        if (!isParkedIdle && !isWallDocked && !oMovingHoriz && !((o.z >= 9.0 || o.z <= 4.4) && (o.blockWait || 0) > 0.35) && oBlocksLane && aheadX >= crossStopMin && aheadX < crossStopMax && !canTieBreak) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
      }

      const oStationary = (o.state === 'idle' && !o.returningHome) || (o.bypassing && o.wpIdx >= (o.waypoints?.length || 0)) || (o.z >= 9.0 && (o.blockWait || 0) > 0.35);
      if (movingVert && !v.bypassing && !oStationary && (o.waitAccum || 0) === 0 && (o.z - nz) * dirZ > 0 && (o.z - nz) * dirZ < (vHalfZ + oHalfZ + 1.15)) {
        const oDirX = (o.state !== 'dwell_pickup' && o.state !== 'dwell_drop' && Math.abs(Math.sin(o.yaw || 0)) > 0.7) ? Math.sign(Math.sin(o.yaw)) : 0;
        const oApproaching = oDirX !== 0 && (nx - o.x) * oDirX >= 0 && (nx - o.x) * oDirX < (vHalfX + oHalfX + 1.05);
        if ((Math.abs(o.x - nx) < (vHalfX + oHalfX + 0.02) || (oApproaching && (o.blockWait || 0) < 0.25)) && !canTieBreak) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
      }
    }
    return { blocked: false };
  }

  function tryStartBypass(v, maxConcurrent = 2, ignoreCooldown = false) {
    const holdingHwyapproachOnly = Boolean(v.heldAisle && v.heldAisle.startsWith('hwy_bay:') && v.z >= 5.15);
    const canBypassState = v.state !== 'idle' || v.returningHome;
    if (v.bypassing || (!ignoreCooldown && (v.bypassCooldown || 0) > 0) || (ignoreCooldown && (v.bypassCooldown || 0) > 10.5) || (v.heldAisle && !holdingHwyapproachOnly) || !canBypassState || (!v.task && !v.returningHome)) return false;
    // Cap concurrent bypass maneuvers so vehicles never counter-block each other in pull-out lanes
    if (sim.vehicles.filter((o) => o.bypassing).length >= maxConcurrent) return false;
    // Never swing 3.05m-3.85m crosswise or 5.8m-7.5m dolly oversize loads perpendicular into narrow pockets
    const L_mm = v.carryingSpec?.L_mm || 1100;
    if (L_mm > 3500 || isWideCrosswise(v.carryingSpec)) return false;
    // Only bypass if on main Highway apron west of the Shutter door posts (x < 50.8)
    const onHwyLane = v.z >= 4.75 && v.z <= 8.65 && v.x < 50.8;
    if (!onHwyLane) return false;
    // Don't abandon active Shutter IN/OUT dock queues unless yielding cleanly for a wide outbound crosswise load
    if (!ignoreCooldown && v.x >= 47.6 && v.state === 'to_pickup' && v.task.kind === 'put') return false;
    if (v.x >= 48.0 && v.state === 'to_drop' && v.task.kind === 'pick') return false;
    // Build bypass pocket candidates first so safeDropX can target chosen.x cleanly when nearby
    const candidates = [];

    // Option A: Free parking stalls at PARK_Z not owned by any live fleet vehicle (prevents head-on stall-mouth traps)
    if (L_mm <= 2200) {
      for (let i = 0; i < PARKING_STALLS.length; i++) {
        const claimKey = `park:${i}`;
        if (sim.bypassClaims.has(claimKey)) continue;
        const st = PARKING_STALLS[i];
        const hasLiveOwner = sim.vehicles.some((o) => o.uid !== v.uid && o.stallIdx === i);
        if (hasLiveOwner) continue;
        const stallAabb = getVehicleWorldAABB(st.x, st.z, 0, v.carryingSpec);
        const busy = sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(stallAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.06));
        const hitsObs = sim.obstacleBoxes.some((b) => aabbOverlap(stallAabb, b, 0.06));
        if (!busy && !hitsObs) {
          candidates.push({ x: st.x, z: st.z, claimKey, aisle: 'park', dist: Math.hypot(st.x - v.x, st.z - v.z) });
        }
      }
    }

    // Option B: Unlocked empty vertical aisle pull-out pocket (AISLE_X, z=10.10 or 12.2 for very long loads)
    for (const [ak, ax] of Object.entries(AISLE_X)) {
      const claimKey = `aisle:${ak}`;
      if (sim.aisleOccupant.has(ak) || sim.bypassClaims.has(claimKey)) continue;
      const targeted = sim.vehicles.some((o) => o.uid !== v.uid && (o.heldAisle === ak || o.waypoints.some((w) => w.aisle === ak)));
      if (!targeted) {
        const pocketZ = L_mm > 2400 ? 12.2 : 10.15;
        const pocketAabb = getVehicleWorldAABB(ax, pocketZ, 0, v.carryingSpec);
        const hitsObs = sim.obstacleBoxes.some((b) => aabbOverlap(pocketAabb, b, 0.08));
        if (!hitsObs) {
          candidates.push({ x: ax, z: pocketZ, claimKey, aisle: ak, dist: Math.hypot(ax - v.x, pocketZ - v.z) });
        }
      }
    }

    // Option C: Dynamic open apron pull-out pocket along PARK_Z (clear of aisles, columns, stalls & vehicles)
    if (L_mm <= 2200) {
      const eastApronBusy = sim.vehicles.filter((o) => o.uid !== v.uid && o.z >= 8.8 && o.x >= 44.0).length >= (ignoreCooldown ? 3 : 2);
      const aisleEntries = Object.entries(AISLE_X);
      for (const off of [0, 1.3, -1.3, 2.2, -2.2, 3.2, -3.2, 4.0, -4.0, 5.0, -5.0, 6.0, -6.0, 7.5, -7.5, 9.0, -9.0]) {
        const px = +(Math.max(5.5, Math.min(49.5, v.x + off))).toFixed(2);
        if (eastApronBusy && px >= 44.0) continue;
        if (aisleEntries.some(([ak, ax]) => {
          const wideUser = sim.vehicles.some((o) => o.uid !== v.uid && isWideCrosswise(o.carryingSpec) && o.waypoints.some((w) => w.lockKey === ak));
          return Math.abs(px - ax) < (wideUser ? 2.95 : 2.25);
        })) continue;
        const claimKey = `apron:${Math.round(px)}`;
        if (sim.bypassClaims.has(claimKey)) continue;
        const pAabb = getVehicleWorldAABB(px, PARK_Z, 0, v.carryingSpec);
        const busy = sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(pAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08));
        const hitsObs = sim.obstacleBoxes.some((b) => aabbOverlap(pAabb, b, 0.06));
        if (!busy && !hitsObs) {
          candidates.push({ x: px, z: PARK_Z, claimKey, aisle: 'park', dist: Math.hypot(px - v.x, PARK_Z - v.z) + 0.8 });
        }
      }
    }

    // Option D-East: Empty vehicle refuge into unobstructed North-East corner pocket (x=49.2, z=3.55) or straight-North open bay (z=3.65)
    if (!v.carryingSpec && v.z <= 6.2 && v.x >= 45.0 && !sim.bypassClaims.has('nwall:ne_corner')) {
      const neAabb = getVehicleWorldAABB(49.2, 3.55, Math.PI / 2, v.carryingSpec);
      const neObs = sim.obstacleBoxes.some((b) => aabbOverlap(neAabb, b, 0.08));
      const neBusy = sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(neAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.12));
      let slideClear = true;
      if (!neObs && !neBusy && Math.abs(49.2 - v.x) >= 0.35) {
        const yawSlide = 49.2 >= v.x ? Math.PI / 2 : -Math.PI / 2;
        const sa = getVehicleWorldAABB(49.2, v.z, yawSlide, v.carryingSpec);
        slideClear = !sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(sa, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08));
      }
      if (!neObs && !neBusy && slideClear) {
        candidates.push({ x: 49.2, z: 3.55, claimKey: 'nwall:ne_corner', aisle: 'hwy_wall', bayKey: null, dist: Math.hypot(49.2 - v.x, 3.55 - v.z) + 1.2 });
      }
    }
    if (!v.carryingSpec && v.z <= 6.2 && v.x >= 12.0 && v.x <= 49.5) {
      for (const nOff of [0, -1.2, 1.2, -1.8, 1.8, -3.0, 3.0, -4.5, 4.5]) {
        const sx = +(Math.max(12.0, Math.min(49.5, v.x + nOff))).toFixed(2);
        const claimKey = `nwall:north_${Math.round(sx)}`;
        if (sim.bypassClaims.has(claimKey)) continue;
        let northClear = true;
        for (const nz of [3.65]) {
          if (nz >= v.z - 0.1) continue;
          const nAabb = getVehicleWorldAABB(sx, nz, Math.PI, null);
          if (sim.obstacleBoxes.some((b) => aabbOverlap(nAabb, b, 0.08)) ||
              sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(nAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.10))) {
            northClear = false;
            break;
          }
        }
        if (northClear) {
          candidates.push({ x: sx, z: 3.65, claimKey, aisle: 'hwy_wall', bayKey: null, dist: Math.abs(3.65 - v.z) + Math.abs(nOff) + 4.0 });
          break;
        }
      }
    }

    // Option D (fallback): Empty vehicle refuge into unobstructed North-wall bay pocket when local South pockets are full or blocked
    if (!v.carryingSpec && v.z <= 8.2) {
      const nwallBays = [
        { key: 'hwy_bay:CANT-R03', x: 46.6 },
        { key: 'hwy_bay:CANT-R02', x: 42.8 },
        { key: 'hwy_bay:CANT-R01', x: 35.9 },
        { key: 'hwy_bay:HWY-FLOOR-02', x: 22.8 },
        { key: 'hwy_bay:HWY-FLOOR-01', x: 14.8 },
      ];
      for (const nb of nwallBays) {
        if (Math.abs(nb.x - v.x) > 8.5) continue;
        const claimKey = `nwall:${nb.key}`;
        if (sim.aisleOccupant.has(nb.key) || sim.bypassClaims.has(claimKey)) continue;
        const targeted = sim.vehicles.some((o) => o.uid !== v.uid && o.waypoints.some((w) => w.lockKey === nb.key));
        if (targeted) continue;
        const nAabb = getVehicleWorldAABB(nb.x, 3.65, Math.PI / 2, null);
        const busy = sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(nAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.10));
        if (!busy) {
          candidates.push({ x: nb.x, z: 3.65, claimKey, aisle: 'hwy_wall', bayKey: nb.key, dist: Math.hypot(nb.x - v.x, 3.65 - v.z) + 4.5 });
        }
      }
    }

    if (candidates.length === 0) return false;
    // Prefer pull-out pockets that do NOT require crossing through an approaching wide load overlapping our Z lane
    const vLaneAabb = getVehicleWorldAABB(v.x, v.z, v.yaw, v.carryingSpec);
    const wideBlockerIntervals = sim.vehicles
      .filter((o) => {
        if (o.uid === v.uid || o.z < 4.7 || o.z > 8.6 || !isWideCrosswise(o.carryingSpec)) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return oAabb.minZ < vLaneAabb.maxZ + 0.14 && oAabb.maxZ > vLaneAabb.minZ - 0.14;
      })
      .map((o) => {
        const oa = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return [oa.minX - 0.4, oa.maxX + 0.4];
      });
    const crossesWideBlocker = (fromX, toX) => {
      const lo = Math.min(fromX, toX);
      const hi = Math.max(fromX, toX);
      return wideBlockerIntervals.some(([bMin, bMax]) => bMax >= lo && bMin <= hi);
    };
    for (const c of candidates) {
      c.score = c.dist + (Math.abs(c.x - v.x) >= 0.35 && crossesWideBlocker(v.x, c.x) ? 40 : 0);
    }
    candidates.sort((a, b) => a.score - b.score);

    const aisleEntries = Object.entries(AISLE_X);
    const candOffsets = [0, -0.25, 0.3, -0.5, 0.6, -0.75, 0.9, -1.0, 1.3, -1.3, 1.6, -1.6, 2.2, -2.2, 2.8, -2.8, 3.5, -3.5, 3.9, -3.9, 4.2, -4.2, 5.0, -5.0];
    let chosen = null;
    let safeDropX = null;
    let horizSlideBypass = false;

    for (const cand of candidates.slice(0, 6)) {
      const segClearSouth = (dropX) => {
        if (cand.aisle === 'hwy_wall') return false;
        if (dropX < 3.0 || dropX > 50.8) return false;
        if (Math.abs(dropX - v.x) > 0.1 && crossesWideBlocker(v.x, dropX)) return false;
        if (!(cand.aisle === 'park' && Math.abs(dropX - cand.x) < 0.05) && aisleEntries.some(([ak, ax]) => {
          const wideUser = sim.vehicles.some((o) => o.uid !== v.uid && isWideCrosswise(o.carryingSpec) && o.waypoints.some((w) => w.lockKey === ak));
          return Math.abs(dropX - ax) < (wideUser ? 2.95 : 2.15);
        })) return false;
        if (Math.abs(dropX - v.x) > 0.05) {
          const yawH = dropX > v.x ? Math.PI / 2 : -Math.PI / 2;
          const slideAabb = getVehicleWorldAABB(dropX, v.z, yawH, v.carryingSpec);
          if (sim.obstacleBoxes.some((b) => aabbOverlap(slideAabb, b, 0.06))) return false;
          if (sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(slideAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08))) return false;
        }
        for (const tz of [v.z + 0.05, v.z + 0.4, HWY_Z_MID, HWY_Z_OUT, PARK_Z]) {
          if (tz < v.z) continue;
          const testAabb = getVehicleWorldAABB(dropX, tz, 0, v.carryingSpec);
          if (sim.obstacleBoxes.some((b) => aabbOverlap(testAabb, b, 0.06))) return false;
          if (sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(testAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08))) return false;
        }
        if (sim.vehicles.some((o) => {
          if (o.uid === v.uid || !o.bypassing || !o.waypoints.length) return false;
          const lastWp = o.waypoints[o.waypoints.length - 1];
          return lastWp && lastWp.z >= 9.0 && Math.abs(lastWp.x - dropX) < 1.85;
        })) return false;
        return true;
      };
      let candDropX = null;
      const parkOffsets = [cand.x - v.x, cand.x - v.x + 0.3, cand.x - v.x - 0.3];
      for (const dxOff of [...candOffsets.slice(0, 1), ...parkOffsets.filter((d) => Math.abs(d) <= 2.5), ...candOffsets.slice(1)]) {
        const candX = +(v.x + dxOff).toFixed(2);
        if (segClearSouth(candX)) { candDropX = candX; break; }
      }
      let candHoriz = false;
      if (candDropX === null) {
        if (Math.abs(cand.x - v.x) >= 0.35 && crossesWideBlocker(v.x, cand.x)) continue;
        const minHX = Math.min(v.x, cand.x);
        const maxHX = Math.max(v.x, cand.x);
        const moveYawH = cand.x >= v.x ? Math.PI / 2 : -Math.PI / 2;
        const yawSlide = (!v.carryingSpec && Math.cos(moveYawH - v.yaw) < -0.5) ? v.yaw : moveYawH;
        let slideOk = true;
        if (cand.aisle === 'hwy_wall' && maxHX - minHX < 0.35) {
          const upAabb = getVehicleWorldAABB(v.x, 3.75, Math.PI, v.carryingSpec);
          slideOk = !sim.obstacleBoxes.some((b) => aabbOverlap(upAabb, b, 0.06)) && !sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(upAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08));
        } else {
          const hSteps = Math.max(1, Math.ceil((maxHX - minHX) / 1.0));
          for (let s = 1; slideOk && s <= hSteps; s++) {
            const sx = minHX + ((maxHX - minHX) * s) / hSteps;
            const sa = getVehicleWorldAABB(sx, v.z, yawSlide, v.carryingSpec);
            if (sim.obstacleBoxes.some((b) => aabbOverlap(sa, b, 0.06))) slideOk = false;
            if (sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(sa, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.08))) slideOk = false;
          }
        }
        if (slideOk && segClearSouth(cand.x)) {
          candHoriz = true;
        } else if (cand.aisle === 'hwy_wall' && slideOk) {
          candHoriz = true;
        } else if (slideOk && cand.aisle !== 'park' && cand.aisle !== 'hwy') {
          candHoriz = true;
        } else {
          continue;
        }
      }
      chosen = cand;
      safeDropX = candDropX;
      horizSlideBypass = candHoriz;
      break;
    }
    if (!chosen) return false;

    v.bypassing = true;
    v.bypassTimer = 2.4;
    v.bypassClaimKey = chosen.claimKey;
    sim.bypassClaims.add(chosen.claimKey);
    if (chosen.aisle === 'hwy_wall' && chosen.bayKey) {
      if (holdingHwyapproachOnly && sim.aisleOccupant.get(v.heldAisle) === v.id) {
        sim.aisleOccupant.delete(v.heldAisle);
      }
      sim.aisleOccupant.set(chosen.bayKey, v.id);
      v.heldAisle = chosen.bayKey;
      v.heldBayX = chosen.x;
    } else if (chosen.aisle !== 'park' && chosen.aisle !== 'hwy') {
      if (holdingHwyapproachOnly) {
        if (sim.aisleOccupant.get(v.heldAisle) === v.id) sim.aisleOccupant.delete(v.heldAisle);
        v.heldAisle = null;
        v.heldBayX = null;
      }
      sim.aisleOccupant.set(chosen.aisle, v.id);
      v.heldAisle = chosen.aisle;
    } else if (holdingHwyapproachOnly) {
      if (sim.aisleOccupant.get(v.heldAisle) === v.id) sim.aisleOccupant.delete(v.heldAisle);
      v.heldAisle = null;
      v.heldBayX = null;
    }
    const parkSegClear = (fromX, targetX) => {
      if (L_mm > 2400) return false;
      const minX = Math.min(fromX, targetX);
      const maxX = Math.max(fromX, targetX);
      const yawH = maxX > fromX + 0.1 ? Math.PI / 2 : -Math.PI / 2;
      const steps = Math.max(1, Math.ceil((maxX - minX) / 1.2));
      for (let s = 0; s <= steps; s++) {
        const sx = minX + ((maxX - minX) * s) / steps;
        const segAabb = getVehicleWorldAABB(sx, PARK_Z, yawH, v.carryingSpec);
        if (sim.obstacleBoxes.some((b) => aabbOverlap(segAabb, b, 0.06))) return false;
        if ((s === 0 || s === steps) && sim.obstacleBoxes.some((b) => aabbOverlap(getVehicleWorldAABB(sx, PARK_Z, Math.PI, v.carryingSpec), b, 0.06))) return false;
        if (sim.vehicles.some((o) => o.uid !== v.uid && aabbOverlap(segAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.06))) return false;
      }
      return true;
    };

    v.blockWait = 0;
    if (safeDropX !== null) {
      if (parkSegClear(safeDropX, chosen.x)) {
        v.waypoints = [
          ...(Math.abs(safeDropX - v.x) > 0.05 ? [{ x: safeDropX, z: v.z, aisle: 'hwy', lockKey: null }] : []),
          { x: safeDropX, z: PARK_Z, aisle: 'park', lockKey: null },
          ...(Math.abs(chosen.x - safeDropX) > 0.15 ? [{ x: chosen.x, z: PARK_Z, aisle: chosen.aisle === 'park' ? 'park' : chosen.aisle, lockKey: null }] : []),
          ...(Math.abs(chosen.z - PARK_Z) > 0.15 ? [{ x: chosen.x, z: chosen.z, aisle: chosen.aisle === 'park' ? 'park' : chosen.aisle, lockKey: chosen.aisle === 'park' ? null : chosen.aisle }] : []),
        ];
      } else {
        // Safe perpendicular refuge at (safeDropX, PARK_Z): release unused distant pocket claim so other vehicles can use it
        sim.bypassClaims.delete(chosen.claimKey);
        v.bypassClaimKey = `refuge:${v.uid}`;
        sim.bypassClaims.add(v.bypassClaimKey);
        if (v.heldAisle && v.heldAisle === chosen.aisle && sim.aisleOccupant.get(v.heldAisle) === v.id) {
          sim.aisleOccupant.delete(v.heldAisle);
          v.heldAisle = null;
        }
        v.waypoints = [
          ...(Math.abs(safeDropX - v.x) > 0.05 ? [{ x: safeDropX, z: v.z, aisle: 'hwy', lockKey: null }] : []),
          { x: safeDropX, z: PARK_Z, aisle: 'park', lockKey: null },
        ];
      }
    } else if (horizSlideBypass) {
      v.waypoints = chosen.aisle === 'hwy_wall'
        ? [
            ...(Math.abs(chosen.x - v.x) >= 0.35 ? [{ x: chosen.x, z: v.z, aisle: 'hwy', lockKey: null }] : []),
            { x: Math.abs(chosen.x - v.x) >= 0.35 ? chosen.x : v.x, z: chosen.z, aisle: 'hwy_wall', lockKey: chosen.bayKey },
            ...(chosen.claimKey === 'nwall:ne_corner' ? [{ x: +(chosen.x + 0.2).toFixed(2), z: chosen.z, aisle: 'hwy_wall', lockKey: null }] : []),
          ]
        : [
            { x: chosen.x, z: v.z, aisle: 'hwy', lockKey: null },
            ...(Math.abs(chosen.z - v.z) > 0.15 ? [{ x: chosen.x, z: chosen.z, aisle: chosen.aisle === 'park' ? 'park' : chosen.aisle, lockKey: chosen.aisle === 'park' ? null : chosen.aisle }] : []),
          ];
    } else {
      v.waypoints = buildCorridorPath(v.x, v.z, chosen.x, chosen.z, chosen.aisle === 'hwy_wall' ? 'hwy' : (chosen.aisle === 'park' ? 'park' : chosen.aisle), chosen.bayKey || null);
    }
    v.wpIdx = 0;
    sim.bypassCount += 1;
    return true;
  }

  function resumeFromBypass(v) {
    if (v.bypassClaimKey) {
      sim.bypassClaims.delete(v.bypassClaimKey);
      v.bypassClaimKey = null;
    }
    if (v.heldAisle && !v.heldAisle.startsWith('hwy_bay:') && v.z <= HWY_Z_OUT + 0.5) {
      if (sim.aisleOccupant.get(v.heldAisle) === v.id) sim.aisleOccupant.delete(v.heldAisle);
      v.heldAisle = null;
    }
    v.bypassing = false;
    v.bypassCooldown = 12.0;
    v.blockWait = 0;
    const t = v.task;
    if (t) {
      if (v.state === 'to_pickup') {
        assignTaskToVehicle(v, t);
      } else {
        const p = t.slot.pose;
        const lockKey = p.aisleKey === 'hwy' ? `hwy_bay:${p.key}` : p.aisleKey;
        const outZ = isWideCrosswise(v.carryingSpec) ? hwyWideZ(v.carryingSpec) : HWY_Z_OUT;
        v.waypoints = t.kind === 'put'
          ? buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey, v.carryingSpec, t.sku)
          : buildCorridorPath(v.x, v.z, SHUTTER_OUT_X, outZ, 'hwy', null, v.carryingSpec, t.sku);
        v.wpIdx = 0;
      }
    } else if (v.returningHome) {
      v.waypoints = buildCorridorPath(v.x, v.z, v.homeX, v.homeZ, 'park');
      v.wpIdx = 0;
    }
  }

  function beginDwellPhase(v, mode, atRack) {
    v.state = mode;
    v.dwellElapsed = 0;
    v.dwellSwapped = false;
    v.dwellDollySwapped = false;
    v.dwellStartForkY = v.forkY;

    const t = v.task;
    const dollyBayStage = atRack && usesLongDolly(t.sku) && t.slot.pose.aisleKey === 'hwy';
    if (atRack) {
      const p = t.slot.pose;
      v.dwellTargetYaw = Math.atan2(p.faceX, p.faceZ);
      const elev = tierElevation(t.slot.loc);
      v.dwellTargetForkY = v.type === 'stacker' ? Math.max(0.08, Math.min(elev, 2.48)) : 0.06;
      if (dollyBayStage) {
        v.dwellDuration = v.dwellTargetForkY > 1.0 ? 2.8 : 2.0;
        v.dwellExitYaw = t.kind === 'pick' ? Math.PI / 2 : Math.PI;
      } else {
        v.dwellDuration = v.dwellTargetForkY > 1.0 ? 2.2 : 1.4;
        v.dwellExitYaw = p.aisleKey === 'hwy' ? Math.PI : Math.PI;
      }
    } else {
      // At SHUTTER IN face West (-pi/2) to match Westbound departure without swinging loads 180 deg across Highway
      v.dwellTargetYaw = t.kind === 'put' ? -Math.PI / 2 : Math.PI / 2;
      v.dwellExitYaw = t.kind === 'put' ? -Math.PI / 2 : Math.PI / 2;
      v.dwellTargetForkY = 0.08;
      v.dwellDuration = 1.1;
    }
  }

  function updateDwellAnimation(v, dt) {
    v.dwellElapsed += dt;
    const prog = Math.min(1, v.dwellElapsed / v.dwellDuration);
    const t = v.task;
    const atRack = (v.state === 'dwell_pickup' && t.kind === 'pick') || (v.state === 'dwell_drop' && t.kind === 'put');
    const dollyBayStage = atRack && usesLongDolly(t.sku) && t.slot.pose.aisleKey === 'hwy';

    const canSwapSpec = (candSpec, testYaw) => {
      const nextAabb = getVehicleWorldAABB(v.x, v.z, testYaw, candSpec);
      return !sim.vehicles.some((o) => {
        if (o.uid === v.uid) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return aabbOverlap(nextAabb, oAabb, 0.04);
      });
    };

    // For Zone 3 long-dolly Putaway: keep load strictly East-West (clear of Highway & wall):
    // First clear dolly visually/temporarily while turning empty Stacker North (3.14), THEN mount crosswise on forks!
    if (dollyBayStage && v.state === 'dwell_drop' && !v.dwellDollySwapped) {
      if (v.carryingSpec) {
        // Hold axial dolly briefly while verifying bay-facing OBB is clear, then release dolly so empty Stacker can face bay
        const forkSpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type, 'forks');
        if (!canSwapSpec(forkSpec, v.dwellTargetYaw)) {
          v.dwellElapsed = 0;
          return false;
        }
        clearVehicleCargo(v);
      }
      if (prog >= 0.18) {
        const forkSpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type, 'forks');
        if (Math.abs(v.dwellTargetYaw - v.yaw) > 0.12 || !canSwapSpec(forkSpec, v.dwellTargetYaw)) {
          v.dwellElapsed = v.dwellDuration * 0.17;
        } else {
          v.dwellDollySwapped = true;
          attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide, 'forks');
        }
      }
    }

    // Align facing bay BEFORE reach; for Pick dolly transfer, drop off forks at 0.80 and turn empty to dwellExitYaw BEFORE coupling axial dolly!
    const pickTurningForDolly = dollyBayStage && v.state === 'dwell_pickup' && prog >= 0.80 && !v.dwellDollySwapped;
    if (pickTurningForDolly && v.carryingSpec) {
      const dollySpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type, 'dolly');
      if (!canSwapSpec(dollySpec, v.dwellExitYaw)) {
        v.dwellElapsed = v.dwellDuration * 0.79;
        return false;
      }
      clearVehicleCargo(v);
    }
    const desiredYaw = prog >= 0.80 ? (v.dwellExitYaw ?? v.dwellTargetYaw) : v.dwellTargetYaw;
    let yawDiff = desiredYaw - v.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const candYaw = Math.abs(yawDiff) < 0.08
      ? desiredYaw
      : v.yaw + yawDiff * Math.min(1, dt * 12);
    const rotAabb = getVehicleWorldAABB(v.x, v.z, candYaw, v.carryingSpec);
    const curAabbRot = getVehicleWorldAABB(v.x, v.z, v.yaw, v.carryingSpec);
    const rotHitsVeh = sim.vehicles.some((o) => {
      if (o.uid === v.uid) return false;
      const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
      return aabbOverlap(rotAabb, oAabb, 0.04) && !aabbOverlap(curAabbRot, oAabb, 0.04);
    });
    if (!rotHitsVeh) v.yaw = candYaw;
    v.mesh.rotation.y = v.yaw;

    // Ensure empty vehicle finishes facing the bay BEFORE extending forks or spawning long cargo
    if (prog >= 0.24 && prog < 0.50 && !v.carryingSpec && Math.abs(desiredYaw - v.yaw) > 0.12) {
      v.dwellElapsed = v.dwellDuration * 0.24;
      return false;
    }

    // 4-Stage Fork Lift & Reach Timeline:
    // [0.00 - 0.35]: Raise carriage to target height (crosswise on Stacker forks)
    // [0.35 - 0.55]: Extend forks forward into slot -> swap cargo at 0.52
    // [0.55 - 0.78]: Retract forks out of rack bay
    // [0.78 - 1.00]: Lower carriage smoothly down to travel height (and load onto axial Highway dolly for >=5.8m)
    if (prog < 0.35) {
      const k = prog / 0.35;
      v.forkY = v.dwellStartForkY + (v.dwellTargetForkY - v.dwellStartForkY) * k;
      v.forkReach = 0;
    } else if (prog < 0.55) {
      const k = (prog - 0.35) / 0.20;
      v.forkY = v.dwellTargetForkY;
      v.forkReach = (atRack ? 0.56 : 0.25) * k;
      if (prog >= 0.52 && !v.dwellSwapped) {
        if (v.state === 'dwell_pickup') {
          const initialMode = (atRack || !usesLongDolly(t.sku)) ? 'forks' : 'dolly';
          const nextSpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type, initialMode);
          const checkExitYaw = dollyBayStage ? v.yaw : (v.dwellExitYaw ?? v.yaw);
          const nextAabbCur = getVehicleWorldAABB(v.x, v.z, v.yaw, nextSpec);
          const nextAabbExit = getVehicleWorldAABB(v.x, v.z, checkExitYaw, nextSpec);
          const blockedOnSpawn = sim.vehicles.some((o) => {
            if (o.uid === v.uid) return false;
            const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
            return aabbOverlap(nextAabbCur, oAabb, 0.20) || aabbOverlap(nextAabbExit, oAabb, 0.20);
          });
          if (blockedOnSpawn) {
            v.dwellElapsed = v.dwellDuration * 0.51;
            return false;
          }
          v.dwellSwapped = true;
          if (t.kind === 'put') {
            attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide, initialMode);
          } else {
            setSlotCargo(t.slot, null, 0, false);
            attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide, initialMode);
          }
        } else {
          v.dwellSwapped = true;
          clearVehicleCargo(v);
          if (t.kind === 'put') {
            setSlotCargo(t.slot, t.tag, t.wt, true, t.useWide);
            if (t.useWide) {
              for (const sib of (sim.slotsByLoc.get(t.slot.locId) || [t.slot])) sib.reservedInbound = false;
            } else {
              t.slot.reservedInbound = false;
            }
            sim.inCount += 1;
          } else {
            sim.outCount += 1;
          }
        }
      }
    } else if (prog < 0.78) {
      const k = 1 - (prog - 0.55) / 0.23;
      v.forkY = v.dwellTargetForkY + (v.state === 'dwell_pickup' ? 0.08 : -0.04);
      v.forkReach = (atRack ? 0.56 : 0.25) * k;
    } else {
      const k = (prog - 0.78) / 0.22;
      const travelY = 0.08;
      v.forkY = v.dwellTargetForkY + (travelY - v.dwellTargetForkY) * k;
      v.forkReach = 0;

      // Zone 3 Take-Out: once Stacker finishes lowering & aligns horizontally to dwellExitYaw, couple axial Highway dolly (zero diagonal swing!)
      if (dollyBayStage && v.state === 'dwell_pickup' && !v.dwellDollySwapped && prog >= 0.90) {
        const dollySpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type, 'dolly');
        if (Math.abs(yawDiff) > 0.10 || !canSwapSpec(dollySpec, v.dwellExitYaw)) {
          v.dwellElapsed = v.dwellDuration * 0.89;
          return false;
        }
        v.dwellDollySwapped = true;
        attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide, 'dolly');
      }
    }

    if (v.type === 'stacker' && v.mesh.userData.carriage) {
      v.mesh.userData.carriage.position.y = v.forkY;
    }
    if (v.mesh.userData.forkSlide) {
      v.mesh.userData.forkSlide.position.z = v.forkReach;
    }

    if (prog < 1) return false;

    if (v.carryingSpec && Math.abs(yawDiff) > 0.15) {
      v.dwellElapsed = v.dwellDuration * 0.99;
      return false;
    }

    v.yaw = v.dwellExitYaw ?? v.yaw;
    v.mesh.rotation.y = v.yaw;
    v.forkReach = 0;
    v.forkY = 0.08;
    if (v.type === 'stacker' && v.mesh.userData.carriage) v.mesh.userData.carriage.position.y = 0.08;
    if (v.mesh.userData.forkSlide) v.mesh.userData.forkSlide.position.z = 0;

    if (v.state === 'dwell_pickup') {
      v.state = 'to_drop';
      if (t.kind === 'put') {
        const p = t.slot.pose;
        const lockKey = p.aisleKey === 'hwy' ? `hwy_bay:${p.key}` : p.aisleKey;
        v.waypoints = buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey, v.carryingSpec, t.sku);
      } else {
        const outZ = isWideCrosswise(v.carryingSpec) ? hwyWideZ(v.carryingSpec) : HWY_Z_OUT;
        v.waypoints = buildCorridorPath(v.x, v.z, SHUTTER_OUT_X, outZ, 'hwy', null, v.carryingSpec, t.sku);
      }
      v.wpIdx = 0;
    } else {
      v.taskHistory = v.taskHistory || [];
      v.taskHistory.push({
        kind: t.kind,
        tag: t.tag,
        locId: t.slot.locId,
        bay: t.slot.pose.key,
        L_mm: Number(t.sku?.L_mm || 0),
        wt: Number(t.wt || 0),
        startSec: v.activeTaskStartSec ?? +sim.simTimeSec.toFixed(2),
        endSec: +sim.simTimeSec.toFixed(2),
      });
      v.activeTaskStartSec = null;
      v.task = null;
      v.state = 'idle';
      v.returningHome = false;
    }
    return true;
  }

  function stepVehicle(v, dt) {
    if (v.bypassCooldown > 0) v.bypassCooldown = Math.max(0, v.bypassCooldown - dt);

    const isWideSku = (sku) => {
      const l = Number(sku?.L_mm || 0);
      return l >= 2500 && l <= 4500;
    };
    const isOversizeSku = (sku) => Number(sku?.L_mm || 0) >= 2500;

    // 1. Idle task dispatch (prefers free aisles, enforces Wide-Aisle exclusivity & Highway Wide-Corridor direction lock!)
    if (v.state === 'idle') {
      const hwyBusyCount = sim.vehicles.filter((o) => o.uid !== v.uid && o.z >= 4.4 && o.z <= 8.8 && o.x < 50.2).length;
      const activeFleet = sim.vehicles.filter((o) => o.uid !== v.uid && (o.state !== 'idle' || o.returningHome)).length;
      if (sim.taskQueue.length > 0 && activeFleet < 5 && (v.z < 9.0 || hwyBusyCount < 3)) {
        const shutterInLoaders = sim.vehicles.filter((o) => o.uid !== v.uid && o.task?.kind === 'put' && (o.state === 'to_pickup' || o.state === 'dwell_pickup')).length;
        const taskAisleKey = (t) => (t.slot.pose.aisleKey === 'hwy' ? `hwy_bay:${t.slot.pose.key}` : t.slot.pose.aisleKey);
        const aisleActiveCount = (ak) => sim.vehicles.filter((o) => {
          if (o.uid === v.uid) return false;
          if (o.heldAisle === ak) return true;
          if (o.task && taskAisleKey(o.task) === ak) return true;
          return false;
        }).length;
        const isCrossWideAisleSku = (sku) => {
          const l = Number(sku?.L_mm || 0);
          return l >= 1600 && l <= 4500;
        };
        const aisleHasWide = (ak) => sim.vehicles.some((o) => o.uid !== v.uid && o.task && taskAisleKey(o.task) === ak && isCrossWideAisleSku(o.task.sku));
        const activeOversizeZone3 = sim.vehicles.filter((o) => o.uid !== v.uid && o.task && Number(o.task.sku?.L_mm || 0) >= 3500).length;
        const canServeTask = (t, maxPerAisle) => {
          if (t.requiresStacker && v.type !== 'stacker') return false;
          if (Number(t.sku?.L_mm || 0) >= 3500 && activeOversizeZone3 >= 2) return false;
          const eastApronBusy = sim.vehicles.filter((o) => o.uid !== v.uid && o.x >= 44.0 && o.z >= 8.8).length >= 2;
          const is2mCrossSku = (sku) => {
            const l = Number(sku?.L_mm || 0);
            return l >= 1600 && l < 2500;
          };
          if (t.kind === 'put') {
            if (shutterInLoaders >= 2) return false;
            // Avoid sending Westbound put loaders into SHUTTER_IN head-on against active Eastbound wide crosswise deliveries
            const eastWideActive = sim.vehicles.some((o) => o.uid !== v.uid && o.task?.kind === 'pick' && isWideCrosswise(o.carryingSpec) && o.z <= 9.6);
            const eastWide2mConflict = eastApronBusy && is2mCrossSku(t.sku) && sim.vehicles.some((o) => o.uid !== v.uid && o.task?.kind === 'pick' && isWideSku(o.task.sku));
            const mixedPutBusy = sim.taskQueue.some((q) => q.kind === 'pick') && sim.vehicles.some((o) => o.uid !== v.uid && o.task?.kind === 'put' && (o.state === 'to_pickup' || o.state === 'dwell_pickup'));
            if (eastWideActive || eastWide2mConflict || mixedPutBusy) return false;
          }
          const ak = taskAisleKey(t);
          const tWide = isWideSku(t.sku);
          if (aisleHasWide(ak)) return false;
          // Adjacent 6.1m CANT-R02 (42.8) & CANT-R03 (46.6) are only 3.80m apart so 6.1m bundles overlap if active simultaneously
          if (ak === 'hwy_bay:CANT-R02' && aisleActiveCount('hwy_bay:CANT-R03') > 0) return false;
          if (ak === 'hwy_bay:CANT-R03' && aisleActiveCount('hwy_bay:CANT-R02') > 0) return false;
          if (isCrossWideAisleSku(t.sku) && !ak.startsWith('hwy_bay:') && aisleActiveCount(ak) > 0) return false;
          if (aisleActiveCount(ak) >= maxPerAisle) return false;

          // Picture 2 solver: oppose-direction wide crosswise loads never share Highway [5.0..8.3] simultaneously
          const tDir = t.kind === 'put' ? -1 : 1;
          if (tWide) {
            const oppOversize = sim.vehicles.some((o) => o.uid !== v.uid && o.task && (isOversizeSku(o.task.sku) || (eastApronBusy && t.kind === 'pick' && o.task.kind === 'put' && is2mCrossSku(o.task.sku))) && (o.task.kind === 'put' ? -1 : 1) !== tDir);
            if (oppOversize) return false;
          } else if (usesLongDolly(t.sku)) {
            const oppWide = sim.vehicles.some((o) => o.uid !== v.uid && o.task && isWideSku(o.task.sku) && (o.task.kind === 'put' ? -1 : 1) !== tDir);
            if (oppWide) return false;
          }
          return true;
        };
        // Strongly prefer uncrowded aisles (0 active), fallback to <=2 active (1 in aisle + 1 in 9.95 buffer) so queues never spill onto Highway
        let bestIdx = sim.taskQueue.findIndex((t) => canServeTask(t, 1));
        if (bestIdx === -1) bestIdx = sim.taskQueue.findIndex((t) => canServeTask(t, 2));
        if (bestIdx !== -1) {
          const [task] = sim.taskQueue.splice(bestIdx, 1);
          assignTaskToVehicle(v, task);
          return;
        }
      }

      // Return cleanly to assigned parking stall along corridor graph (NEVER diagonally through racks!)
      const distHome = Math.hypot(v.homeX - v.x, v.homeZ - v.z);
      if (distHome > 0.03) {
        if (!v.returningHome || v.waypoints.length === 0) {
          v.returningHome = true;
          v.waypoints = buildCorridorPath(v.x, v.z, v.homeX, v.homeZ, 'park');
          v.wpIdx = 0;
        }
      } else {
        v.returningHome = false;
        v.waypoints = [];
        if (v.heldAisle && sim.aisleOccupant.get(v.heldAisle) === v.id) {
          sim.aisleOccupant.delete(v.heldAisle);
          v.heldAisle = null;
        }
        return;
      }
    }

    // 2. Multi-stage Load / Unload / Lifting Animation
    if (v.state === 'dwell_pickup' || v.state === 'dwell_drop') {
      v.blockWait = 0;
      updateDwellAnimation(v, dt);
      return;
    }

    // 2.5 Highway Blockade Bypass Yield Timer when parked in temporary bypass pocket
    if (v.bypassing && v.wpIdx >= v.waypoints.length) {
      v.bypassTimer -= dt;
      if (v.bypassTimer > 0) return;
      // Hold inside pull-out pocket until nearby wide crosswise traffic or North-pocket exit lane clears
      const widePassing = !isWideCrosswise(v.carryingSpec) && sim.vehicles.some((o) => {
        if (o.uid === v.uid || o.bypassing) return false;
        if (isWideCrosswise(o.carryingSpec) && o.z >= 4.7 && o.z <= 8.6) {
          const dir = Math.sign(Math.sin(o.yaw || 0));
          if (dir === 0) return Math.abs(o.x - v.x) < 6.0;
          const aheadDist = (v.x - o.x) * dir;
          return aheadDist > -2.5 && aheadDist < (v.z <= 4.3 ? 12.5 : 10.5);
        }
        return false;
      });
      const northExitBusy = v.z <= 4.3 && sim.vehicles.some((o) => o.uid !== v.uid && o.z >= 4.4 && o.z <= 6.5 && (Math.abs(o.x - v.x) < 2.2 || (v.x >= 46.5 && o.x >= v.x - 1.5 && o.x <= 53.5)));
      if (widePassing || northExitBusy) {
        v.bypassTimer = 0.5;
        return;
      }
      resumeFromBypass(v);
      return;
    }

    // 3. Corridor Movement
    const wp = v.waypoints[v.wpIdx];
    if (!wp) {
      if (v.task && !v.bypassing) {
        const t = v.task;
        const atRack = (v.state === 'to_pickup' && t.kind === 'pick') || (v.state === 'to_drop' && t.kind === 'put');
        beginDwellPhase(v, v.state === 'to_pickup' ? 'dwell_pickup' : 'dwell_drop', atRack);
      }
      return;
    }

    // Single-occupant lock for vertical Aisles 1..6 (acquired before entering z=9.85 / stepping onto AISLE_X) and North-wall stubs
    const needVerticalLock = wp.aisle && wp.aisle !== 'hwy' && wp.aisle !== 'park' && wp.aisle !== 'hwy_wall'
      && Math.abs(wp.x - (AISLE_X[wp.aisle] || wp.x)) < 0.2
      && (Math.abs(v.x - (AISLE_X[wp.aisle] || v.x)) > 0.4 || v.z <= 9.85)
      && v.heldAisle !== wp.aisle;
    const hwyHoldDist = 1.6;
    const needHwyBayLock = wp.aisle === 'hwy_wall' && wp.lockKey && v.z >= HWY_Z_IN - 0.15 && wp.z <= HWY_Z_IN + 1.5 && v.heldAisle !== wp.lockKey && Math.abs(wp.x - v.x) < hwyHoldDist;
    const lockKeyNeeded = needVerticalLock ? wp.aisle : (needHwyBayLock ? wp.lockKey : null);

    if (lockKeyNeeded) {
      const occ = sim.aisleOccupant.get(lockKeyNeeded);
      if (occ && occ !== v.id) {
        const wasWaiting = v.waitAccum > 0;
        v.waitAccum += dt;
        v.blockWait = (v.blockWait || 0) + dt;
        if (!wasWaiting) sim.aisleWaits += 1;
        if (v.mesh.userData.beacon) v.mesh.userData.beacon.material.color.setHex(0xef4444);
        // Only yield off Highway if holding a North-wall lock on Highway AND another vehicle is waiting behind us!
        const blockingFollower = needHwyBayLock && sim.vehicles.some((o) => o.uid !== v.uid && Math.abs(o.z - v.z) < 0.7 && o.x > v.x && o.x - v.x < 8.0 && (o.blockWait || 0) > 1.0);
        if (blockingFollower && v.blockWait > 4.0 && tryStartBypass(v)) return;
        return;
      }
      if (v.heldAisle && v.heldAisle !== lockKeyNeeded && sim.aisleOccupant.get(v.heldAisle) === v.id) {
        sim.aisleOccupant.delete(v.heldAisle);
      }
      sim.aisleOccupant.set(lockKeyNeeded, v.id);
      v.heldAisle = lockKeyNeeded;
      v.heldBayX = lockKeyNeeded.startsWith('hwy_bay:') ? v.x : null;
      if (lockKeyNeeded.startsWith('hwy_bay:')) {
        const bayMatch = sim.slots.find((s) => `hwy_bay:${s.pose.key}` === lockKeyNeeded);
        if (bayMatch) v.heldBayX = bayMatch.pose.aisleX;
      }
      v.waitAccum = 0;
      v.blockWait = 0;
    }

    // Release lock ONLY after vehicle has physically exited onto Highway (or cleared South past 5.45 toward another aisle)
    if (v.heldAisle && wp.aisle !== 'hwy_wall' && (wp.aisle === 'hwy' || v.heldAisle.startsWith('hwy_bay:'))) {
      const exitedVertical = !v.heldAisle.startsWith('hwy_bay:') && (
        Math.abs(v.x - (AISLE_X[v.heldAisle] ?? v.x)) > 1.25
        || v.z <= HWY_Z_IN + 0.25
        || (isWideCrosswise(v.carryingSpec) && wp.aisle === 'hwy' && v.z <= HWY_Z_MID + 0.25)
      );
      const bayX = v.heldBayX ?? v.x;
      const bayHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.86;
      const exitedHwyBay = v.heldAisle.startsWith('hwy_bay:') && (
        v.z >= HWY_Z_OUT - 0.35
        || (v.z >= HWY_Z_IN - 0.25 && v.x <= bayX - Math.max(2.0, bayHalf + 0.85))
        || (wp.aisle !== 'hwy' && v.z >= HWY_Z_IN + 0.45)
      );
      if (exitedVertical || exitedHwyBay) {
        if (sim.aisleOccupant.get(v.heldAisle) === v.id) {
          sim.aisleOccupant.delete(v.heldAisle);
        }
        v.heldAisle = null;
        v.heldBayX = null;
      }
    }

    // East-Dock North-Cross Yield: if parked at SHUTTER_OUT (53.0, 7.95) and a 3.05m wide load is already inside x>=46.0 on 5.70,
    // or a SHUTTER_IN loader is actively dwelling/picking at 51.2, hold BEFORE leaving z>=7.88
    if (v.x >= 50.8 && v.z >= 7.88 && wp.z < 7.0) {
      const wideArrivingNorth = sim.vehicles.some((o) => o.uid !== v.uid && o.state === 'to_drop' && o.x >= 46.0 && isWideCrosswise(o.carryingSpec) && hwyWideZ(o.carryingSpec) < 6.2);
      const shutterInBusy = sim.vehicles.some((o) => o.uid !== v.uid && o.x >= 50.6 && o.z <= 6.8 && (o.state === 'dwell_pickup' || (o.state === 'to_pickup' && o.task?.kind === 'put')));
      if (wideArrivingNorth || shutterInBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // East-Dock Approach Gate: allow 1 active occupant inside overlapping Z-band of Shutter bay (x>=48.2)
    const approachingShutter = ((v.state === 'to_pickup' && v.task?.kind === 'put') || (v.state === 'to_drop' && v.task?.kind === 'pick')) && wp.x >= 49.8;
    if (approachingShutter && v.x >= 44.0 && v.x < 50.0) {
      const vAabbDock = getVehicleWorldAABB(v.x, v.z, v.yaw, v.carryingSpec);
      const vNeedsFullDock = v.state === 'to_pickup' && v.task?.kind === 'put' && (usesLongDolly(v.task?.sku) || isWideSku(v.task?.sku));
      const vMinZ = vNeedsFullDock ? 4.5 : vAabbDock.minZ;
      const vMaxZ = vNeedsFullDock ? 8.8 : vAabbDock.maxZ;
      const dockOccupied = sim.vehicles.some((o) => {
        if (o.uid === v.uid || o.bypassing || o.z < 4.5 || o.z > 8.8) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        const oFullDock = o.state === 'dwell_pickup' && o.task?.kind === 'put' && (isWideSku(o.task?.sku) || usesLongDolly(o.task?.sku));
        const oMinZ = oFullDock ? 4.5 : oAabb.minZ;
        const oMaxZ = oFullDock ? 8.8 : oAabb.maxZ;
        return o.x >= v.x - 0.1 && oAabb.maxX >= 48.2 && oMaxZ > vMinZ - 0.06 && oMinZ < vMaxZ + 0.06;
      });
      if (dockOccupied) {
        v.blockWait = (v.blockWait || 0) + dt;
        if (v.blockWait > 1.5 && !isWideCrosswise(v.carryingSpec) && tryStartBypass(v, 4, true)) {
          v.bypassTimer = 3.0;
          return;
        }
        return;
      }
    }

    // Exclusive Highway Wide-Corridor Guard: prevent narrow/wide head-on Highway gridlock (hold at vertical aisles/stalls when AABB is clear of Highway)
    const vAabbNow = getVehicleWorldAABB(v.x, v.z, v.yaw, v.carryingSpec);
    const outsideHwy = (v.z >= 9.0 && v.z <= 11.2 && vAabbNow.minZ >= 8.6) || (v.z <= 4.3 && vAabbNow.maxZ <= 4.5);
    const enteringHwy = outsideHwy && wp.z >= 4.5 && wp.z <= 8.8 && wp.x < 50.2;
    if (enteringHwy) {
      if (!isWideCrosswise(v.carryingSpec)) {
        const wideOnHwy = sim.vehicles.some((o) => {
          if (o.uid === v.uid || o.bypassing || o.x >= 50.2) return false;
          if (o.carryingSpec?.carryMode === 'dolly' && o.z >= 3.8 && o.z <= 8.6 && Math.abs((o.waypoints[o.wpIdx]?.x ?? o.x) - o.x) < 0.3 && Math.abs(o.x - v.x) < 4.5) return true;
          if (!isWideCrosswise(o.carryingSpec)) return false;
          const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
          return oAabb.maxZ > 4.4 && oAabb.minZ < 8.6;
        });
        if (wideOnHwy) {
          v.blockWait = (v.blockWait || 0) + dt;
          return;
        }
      } else {
        const targetZ = hwyWideZ(v.carryingSpec);
        const band = v.carryingSpec.halfZ + 0.55;
        const hwyBandBusy = sim.vehicles.some((o) => {
          if (o.uid === v.uid || o.bypassing || o.x >= 50.2) return false;
          if (v.heldAisle && o.waypoints.some((w) => w.aisle === v.heldAisle || w.lockKey === v.heldAisle)) return false;
          const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
          const oExitingWallDolly = o.z <= 4.3 && (o.carryingSpec?.carryMode === 'dolly' || (o.state === 'dwell_pickup' && usesLongDolly(o.task?.sku))) && Math.abs(o.x - v.x) < 5.0;
          if (oExitingWallDolly) return true;
          if (oAabb.maxZ <= 4.4 || oAabb.minZ >= 8.6) return false;
          return oAabb.maxZ > (targetZ - band) && oAabb.minZ < (targetZ + band);
        });
        if (hwyBandBusy) {
          v.blockWait = (v.blockWait || 0) + dt;
          return;
        }
      }
    }

    // Proactive East-Apron Yield: Westbound narrow/empty leaving Shutter yields at x=45..49.5 if an Eastbound wide load is on Highway and apron isn't already crowded
    if (!v.bypassing && !isWideCrosswise(v.carryingSpec) && v.x >= 45.0 && v.x <= 49.5 && v.z >= 4.75 && v.z <= 8.65 && wp.x < v.x - 1.0) {
      const eastApronBusy = sim.vehicles.filter((o) => o.uid !== v.uid && o.z >= 8.8 && o.x >= 44.0).length >= 2;
      const eastboundWide = !eastApronBusy && sim.vehicles.some((o) => o.uid !== v.uid && !o.bypassing && isWideCrosswise(o.carryingSpec) && o.state === 'to_drop' && o.x < v.x && o.z >= 4.5 && o.z <= 8.8);
      if (eastboundWide && tryStartBypass(v, 3, true)) {
        v.bypassTimer = 2.0;
        return;
      }
    }

    // East-Dock Mutex: prevent approaching SHUTTER_IN loaders (51.2) from sandwiching at Shutter Door (never trap vehicles already at 53.0 exiting North!)
    if (v.x < 51.5 && v.z >= 6.4 && wp.z <= HWY_Z_MID + 0.35 && wp.x >= 50.5) {
      const isPutLoader = v.state === 'to_pickup' && v.task?.kind === 'put';
      const maxCheckZ = isPutLoader ? 8.3 : 7.25;
      const eastDockBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || o.z < 4.9 || o.z > maxCheckZ) return false;
        return isPutLoader ? o.x >= 51.0 : o.x >= 49.6;
      });
      if (eastDockBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // Centerline Highway Direction Yield for Wide Crosswise / Dolly loads leaving Wall or Vertical Aisles
    if (isWideCrosswise(v.carryingSpec) && ((v.z >= 10.2 && wp.z < v.z && wp.z <= 9.6) || (v.z <= HWY_WALL_Z + 0.25 && wp.z >= 5.0))) {
      const vDir = v.task?.kind === 'put' ? -1 : 1;
      const oppWideOnHwy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || o.z < 4.7 || o.z > 9.2) return false;
        const oOpp = o.task && (o.task.kind === 'put' ? -1 : 1) !== vDir;
        return oOpp && (isWideCrosswise(o.carryingSpec) || o.carryingSpec?.carryMode === 'dolly');
      });
      if (oppWideOnHwy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // North-Wall Pull-Through Yield: wait safely AT HWY_WALL_Z (<=4.03, clear above 5.45/6.10) BEFORE stepping out into Highway
    // and any adjacent vertical aisle exit conflict are open (never stop mid-turn at z=4.17!)
    if (v.z <= HWY_WALL_Z + 0.05 && wp.z >= HWY_Z_IN - 0.1) {
      const spanHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.42;
      const wallMinX = v.x - spanHalf - 0.18;
      const wallMaxX = v.x + spanHalf + 0.18;
      const targetMaxZ = wp.z >= HWY_Z_OUT - 0.3 ? 8.65 : 6.15;
      const exitLaneBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || (o.state === 'idle' && !o.returningHome)) return false;
        // Never yield to a vehicle queuing to enter our own bay lock — we must exit so it can enter!
        if (v.heldAisle && o.waypoints.some((w) => w.lockKey === v.heldAisle)) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        if (oAabb.maxX > wallMinX && oAabb.minX < wallMaxX && oAabb.maxZ > 4.9 && oAabb.minZ < targetMaxZ) return true;
        // Also yield if an adjacent vertical aisle occupant is actively exiting past the mouth (z <= 12.5) within our swing span
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        if (wp.z >= HWY_Z_OUT - 0.3 && o.heldAisle && !o.heldAisle.startsWith('hwy_bay:') && oWp && oWp.z < o.z && o.z <= 10.0) {
          const swingPad = o.carryingSpec ? Math.max(o.carryingSpec.halfX, o.carryingSpec.halfZ) : 0.86;
          if (o.x + swingPad > wallMinX && o.x - swingPad < wallMaxX) return true;
        }
        return false;
      });
      if (exitLaneBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // Vertical Aisle Exit Yield: right before stepping out past z=10.6 onto Highway, ensure turning radius along
    // [v.x - spanHalf - 2.9 .. v.x + spanHalf + 2.9] is clear of horizontal traffic & descending long-dolly North-wall exits
    if (v.heldAisle && !v.heldAisle.startsWith('hwy_bay:') && v.z >= 10.45 && v.z <= 10.95 && wp.z < v.z && wp.z <= 9.6) {
      const spanHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.86;
      const mouthMinX = v.x - spanHalf - (spanHalf > 1.0 ? 2.9 : 0.65);
      const mouthMaxX = v.x + spanHalf + (spanHalf > 1.0 ? 2.9 : 0.65);
      const mouthBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || (o.state === 'idle' && !o.returningHome)) return false;
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        const isHwyOutMover = o.z >= 5.2 && o.z <= 8.55 && (!oWp || Math.abs(oWp.x - o.x) > 0.35);
        const isWallDescending = o.heldAisle?.startsWith('hwy_bay:') && o.z > HWY_WALL_Z + 0.15 && oWp && oWp.z >= HWY_Z_OUT - 0.3;
        if (!isHwyOutMover && !isWallDescending) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return oAabb.maxX > mouthMinX && oAabb.minX < mouthMaxX;
      });
      if (mouthBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // Highway South-Crossing Yield (non-heldAisle, non-bypassing only): before stepping south from HWY_Z_IN (5.45) across Eastbound HWY_Z_OUT (7.95),
    // wait cleanly at z<=5.75 if Eastbound traffic on 7.95 is within our crossing width (never stop bypassing refuges in mid-crossover!)
    if (!v.heldAisle && !v.bypassing && v.z <= HWY_Z_IN + 0.30 && wp.z >= HWY_Z_OUT - 0.15 && Math.abs(wp.x - v.x) < 0.35 && wp.aisle !== 'hwy_wall') {
      const spanHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.86;
      const crossMinX = v.x - spanHalf - 1.1;
      const crossMaxX = v.x + spanHalf + 0.5;
      const hwyOutBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || (o.state === 'idle' && !o.returningHome)) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return oAabb.maxX > crossMinX && oAabb.minX < crossMaxX && oAabb.maxZ > 7.1 && oAabb.minZ < 8.65;
      });
      if (hwyOutBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        if (!isWideCrosswise(v.carryingSpec) && v.blockWait > 1.5 && tryStartBypass(v, 4, true)) return;
        return;
      }
    }

    // Never allow a 2nd entrant to queue across HWY_Z_OUT blocking an occupied aisle's wait buffer (AISLE_X - 1.30, 9.95)
    if (!v.bypassing && wp.aisle && wp.aisle !== 'hwy' && wp.aisle !== 'park' && wp.aisle !== 'hwy_wall' && v.z <= HWY_Z_OUT + 0.45 && Math.abs(wp.z - 9.95) < 0.2) {
      const bufferBusy = sim.vehicles.some((o) => o.uid !== v.uid && Math.abs(o.x - wp.x) < (o.carryingSpec ? o.carryingSpec.halfX + 0.55 : 0.9) && o.z >= 8.2 && o.z <= 10.6);
      const nextWp = v.waypoints[v.wpIdx + 1];
      if (bufferBusy && wp.lockKey && !sim.aisleOccupant.has(wp.lockKey) && nextWp && nextWp.aisle === wp.aisle) {
        v.wpIdx += 1;
        v.blockWait = 0;
        return;
      }
      if (bufferBusy && tryStartBypass(v, 3)) return;
    }

    if (v.mesh.userData.beacon) {
      v.mesh.userData.beacon.material.color.setHex(v.type === 'stacker' ? 0xfbbf24 : 0x22c55e);
    }

    const dx = wp.x - v.x;
    const dz = wp.z - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) {
      v.wpIdx += 1;
      if (v.wpIdx >= v.waypoints.length && v.task && !v.bypassing) {
        const t = v.task;
        const atRack = (v.state === 'to_pickup' && t.kind === 'pick') || (v.state === 'to_drop' && t.kind === 'put');
        beginDwellPhase(v, v.state === 'to_pickup' ? 'dwell_pickup' : 'dwell_drop', atRack);
      } else if (v.wpIdx >= v.waypoints.length && v.returningHome) {
        v.returningHome = false;
        v.waypoints = [];
      }
      return;
    }

    const effSpeed = getEffectiveSpeed(v);
    const step = Math.min(dist, effSpeed * dt);
    const nx = v.x + (dx / dist) * step;
    const nz = v.z + (dz / dist) * step;

    let chosenYaw = getMoveYaw(v, dx / dist, dz / dist, wp);
    let guard = computeSafeAdvance(v, nx, nz, dx / dist, dz / dist, wp, chosenYaw);
    if (guard.blocked && Math.abs(chosenYaw - v.yaw) > 0.25) {
      const keepGuard = computeSafeAdvance(v, nx, nz, dx / dist, dz / dist, wp, v.yaw);
      if (!keepGuard.blocked) {
        guard = keepGuard;
        chosenYaw = v.yaw;
      }
    }
    if (guard.blocked) {
      v.blockWait = (v.blockWait || 0) + dt;
      // If an aisle wait buffer (ax - 1.30, 9.95) is blocked by a neighbor/bypasser while the aisle itself is unlocked, skip the buffer and enter the aisle directly
      const nextWp = v.waypoints[v.wpIdx + 1];
      if (!v.bypassing && wp.lockKey && Math.abs(wp.z - 9.95) < 0.2 && nextWp && nextWp.aisle === wp.aisle && !sim.aisleOccupant.has(wp.lockKey) && v.blockWait > 1.2) {
        v.wpIdx += 1;
        v.blockWait = 0;
        return;
      }
      if (!v.bypassing && guard.by && guard.by.z >= 9.0 && Math.abs(wp.x - v.x) > 0.25 && Math.abs(wp.z - v.z) > 0.25 && v.blockWait > 1.0) {
        v.waypoints.splice(v.wpIdx, 0, { x: wp.x, z: v.z, aisle: wp.aisle, lockKey: wp.lockKey });
        v.blockWait = 0;
        return;
      }
      if (guard.reason === 'vehicle') sim.collisionsAvoided += 1;
      if (v.mesh.userData.beacon) v.mesh.userData.beacon.material.color.setHex(0xef4444);
      // If an active bypass path itself becomes blocked, abort bypass cleanly and resume primary route (unless pinned in front of a z=10.6 column)
      if (v.bypassing && v.blockWait > 4.0) {
        const pinnedAtCol = v.z >= 9.0 && sim.obstacleBoxes.some((b) => aabbOverlap(getVehicleWorldAABB(v.x, v.z, Math.PI, v.carryingSpec), b, 0.04));
        if (!pinnedAtCol) {
          resumeFromBypass(v);
          return;
        }
      }
      // Trigger Highway pull-out bypass for opposing/crossing blockades, narrow yielding to wide crosswise loads, or prolonged >12s gridlock
      const by = guard.by;
      const yieldToWide = by && isWideCrosswise(by.carryingSpec) && !isWideCrosswise(v.carryingSpec) && v.blockWait > 0.6;
      const yieldToDwell = by && (by.state === 'dwell_pickup' || by.state === 'dwell_drop') && v.blockWait > 3.0;
      const yieldToStalledLeader = by && (by.blockWait || 0) > 4.0 && v.blockWait > 4.5 && !isWideCrosswise(v.carryingSpec);
      const opposingOrCross = by && (by.blockWait || 0) > 2.5 && by.state !== 'dwell_pickup' && by.state !== 'dwell_drop' && Math.cos((v.yaw || 0) - (by.yaw || 0)) < 0.35;
      const longMutualGridlock = by && (by.blockWait || 0) > 8.0 && by.state !== 'dwell_pickup' && by.state !== 'dwell_drop';
      if (!v.bypassing && (yieldToWide || yieldToDwell || yieldToStalledLeader || (opposingOrCross && v.blockWait > 4.5) || (longMutualGridlock && v.blockWait > 12.0) || (v.blockWait > 8.0 && !isWideCrosswise(v.carryingSpec))) && tryStartBypass(v, (yieldToWide || yieldToDwell || yieldToStalledLeader) ? 6 : 3, yieldToWide || yieldToDwell || yieldToStalledLeader)) {
        if (yieldToWide || yieldToDwell || yieldToStalledLeader) v.bypassTimer = 3.5;
        return;
      }
      return;
    }

    v.blockWait = 0;
    v.x = nx;
    v.z = nz;
    v.yaw = chosenYaw;
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.yaw;

    if (dist <= effSpeed * dt + 0.01) {
      v.wpIdx += 1;
      if (v.wpIdx >= v.waypoints.length && v.task && !v.bypassing) {
        const t = v.task;
        const atRack = (v.state === 'to_pickup' && t.kind === 'pick') || (v.state === 'to_drop' && t.kind === 'put');
        beginDwellPhase(v, v.state === 'to_pickup' ? 'dwell_pickup' : 'dwell_drop', atRack);
      } else if (v.wpIdx >= v.waypoints.length && v.returningHome) {
        v.returningHome = false;
        v.waypoints = [];
      }
    }
  }

  return { assignTaskToVehicle, getEffectiveSpeed, computeSafeAdvance, tryStartBypass, resumeFromBypass, beginDwellPhase, updateDwellAnimation, stepVehicle };
}
