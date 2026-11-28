// CAD Warehouse Geometry, OBB Collision Math & Orthogonal Corridor Pathbuilder

// CAD Warehouse Geometry Constants (1 unit = 1 meter)
// Origin (0, 0): North-West corner of Level 2 Area 3
// +x = East (toward Shutter Door), +z = South (Row 1 -> 12 depth), +y = Up
export const WH_WIDTH = 53.5;
export const WH_DEPTH = 46.0;
export const HWY_Z_IN = 5.45;    // Strictly Westbound (-x) Highway lane (>=4.57m clear for 2.1m U11 through Shutter postN=4.3)
export const HWY_Z_WIDE_3M = 6.10; // Crosswise 3.05m lane (clears 3.98 wall bays<=4.76+0.05 AND clears Eastbound 7.95 empties>=7.39)
export const HWY_Z_MID = 6.70;   // Centerline Wide-Corridor lane for crosswise 3.85m loads (centered through 4.80m Shutter Door)
export const HWY_Z_OUT = 7.95;   // Strictly Eastbound (+x) Highway lane (2.5m south of HWY_Z_IN)
export const PARK_Z = 9.68;      // Open apron south of Highway lanes (>=0.09m below 7.95 vertical exits, >=0.85m X-clear of columns)
export const HWY_WALL_Z = 3.98;  // Parallel access lane in front of HWY-FLOOR / CANT / Row 1 (clears 2.1m U11 at 3.05 AND 6.10 wide lane)
export const SHUTTER_IN_X = 51.2;
export const SHUTTER_OUT_X = 53.0;
export const ROW_TOP_Z = 11.2;

export const AISLE_X = {
  aisle1: 4.3,
  aisle2: 12.1,
  aisle3: 18.8,
  aisle4: 25.5,
  aisle5: 32.2,
  aisle6: 39.4,
};

// Dedicated parking stalls spaced >=1.9m apart, >=0.85m clear of columns, and >=1.80m clear of vertical aisle centerlines
export const PARKING_STALLS = [
  { x: 8.1, z: PARK_Z },
  { x: 14.35, z: PARK_Z },
  { x: 16.25, z: PARK_Z },
  { x: 21.0, z: PARK_Z },
  { x: 22.90, z: PARK_Z },
  { x: 27.7, z: PARK_Z },
  { x: 29.60, z: PARK_Z },
  { x: 36.35, z: PARK_Z },
  { x: 45.2, z: PARK_Z },
  { x: 47.4, z: PARK_Z },
];

export const COLUMNS_POS = (() => {
  const cols = [];
  for (const cx of [6.9, 9.3, 15.35, 22.05, 28.75, 35.4, 43.2]) {
    for (const cz of [0.5, 10.6, 20.6, 30.8, 40.9]) {
      cols.push({ x: cx, z: cz, halfW: 0.275, halfD: 0.275 });
    }
  }
  return cols;
})();

export function normalizeSkusMap(rawSkus) {
  if (!rawSkus) return {};
  if (Array.isArray(rawSkus)) {
    const map = {};
    for (const s of rawSkus) {
      if (s && s.tag) map[s.tag] = s;
    }
    return map;
  }
  return rawSkus;
}

export function tierNum(loc) {
  if (!loc) return 1;
  if (typeof loc.tier === 'number' && Number.isFinite(loc.tier)) return loc.tier;
  const raw = String(loc.tier ?? loc.tier_level ?? '1');
  const m = raw.match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}

export function getBayPose(loc) {
  const row = loc.row_line;
  const bay = Number(loc.bay) || 1;

  // Zone 3 North Highway Wall (Left -> Right)
  if (row === 'Highway Floor') {
    if (bay === 1) {
      return {
        key: 'HWY-FLOOR-01',
        x: 14.8,
        z: 2.0,
        len: 5.8,
        dep: 2.1,
        axis: 'x',
        aisleKey: 'hwy',
        aisleX: 14.8,
        aisleZ: HWY_WALL_Z,
        faceX: 0,
        faceZ: -1,
        kind: 'floor',
      };
    }
    return {
      key: 'HWY-FLOOR-02',
      x: 24.4,
      z: 1.8,
      len: 7.5,
      dep: 1.2,
      axis: 'x',
      aisleKey: 'hwy',
      aisleX: 22.8,
      aisleZ: HWY_WALL_Z,
      faceX: 0,
      faceZ: -1,
      kind: 'floor',
    };
  }

  if (row === 'Line 1 (Cant)') {
    const cx = 33.6 + (bay - 1) * 6.5;
    // Offset access points cleanly clear of Aisle 5 (32.70) and Aisle 6 (38.90):
    // CANT-R01 @ 35.90 -> [33.22..38.34]; CANT-R02 @ 42.80 -> [40.12..45.24]
    const accessX = bay === 1 ? 36.15 : (bay === 2 ? 42.8 : 46.6);
    return {
      key: `CANT-R0${bay}`,
      x: cx,
      z: 1.8,
      len: 6.1,
      dep: 1.2,
      axis: 'x',
      aisleKey: 'hwy',
      aisleX: accessX,
      aisleZ: 3.90,
      faceX: 0,
      faceZ: -1,
      kind: 'cant',
    };
  }

  // Row 1: Vertical 1..12 along West wall + Top-Left Corner horizontal 13..14
  if (row === 'Row 1') {
    if (bay >= 13) {
      const idx = bay - 13;
      const cx = 3.9 + idx * 2.85;
      return {
        key: `R01-R${String(bay).padStart(2, '0')}`,
        x: cx,
        z: 1.8,
        len: 2.7,
        dep: 1.2,
        axis: 'x',
        aisleKey: 'hwy',
        aisleX: cx,
        aisleZ: HWY_WALL_Z,
        faceX: 0,
        faceZ: -1,
        kind: 'selective',
        colorHex: 0x2563eb,
      };
    }
    const z = ROW_TOP_Z + (bay - 0.5) * 2.7;
    return {
      key: `R01-R${String(bay).padStart(2, '0')}`,
      x: 1.7,
      z,
      len: 2.7,
      dep: 1.2,
      axis: 'z',
      aisleKey: 'aisle1',
      aisleX: AISLE_X.aisle1,
      aisleZ: z,
      faceX: -1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0x2563eb,
    };
  }

  if (row === 'Row 2') {
    const z = bay <= 3
      ? ROW_TOP_Z + (bay - 0.5) * 2.7
      : ROW_TOP_Z + 11.4 + (bay - 4 + 0.5) * 2.7;
    return {
      key: `R02-R${String(bay).padStart(2, '0')}`,
      x: 6.9,
      z,
      len: 2.7,
      dep: 1.2,
      axis: 'z',
      aisleKey: 'aisle1',
      aisleX: AISLE_X.aisle1,
      aisleZ: z,
      faceX: 1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0x2563eb,
    };
  }

  if (row === 'Row 3') {
    const z = bay <= 9
      ? ROW_TOP_Z + (bay - 0.5) * 2.7
      : ROW_TOP_Z + 9 * 2.7 + 2.7 + 0.5 * 2.7;
    return {
      key: `R03-R${String(bay).padStart(2, '0')}`,
      x: 9.3,
      z,
      len: 2.7,
      dep: 1.2,
      axis: 'z',
      aisleKey: 'aisle2',
      aisleX: AISLE_X.aisle2,
      aisleZ: z,
      faceX: -1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0x2563eb,
    };
  }

  if (row === 'Row 4' || row === 'Row 5') {
    const isR4 = row === 'Row 4';
    const z = ROW_TOP_Z + (bay - 0.5) * 2.7;
    return {
      key: `${isR4 ? 'R04' : 'R05'}-R${String(bay).padStart(2, '0')}`,
      x: isR4 ? 14.7 : 16.0,
      z,
      len: 2.7,
      dep: 1.2,
      axis: 'z',
      aisleKey: isR4 ? 'aisle2' : 'aisle3',
      aisleX: isR4 ? AISLE_X.aisle2 : AISLE_X.aisle3,
      aisleZ: z,
      faceX: isR4 ? 1 : -1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0x2563eb,
    };
  }

  if (row === 'Row 6') {
    const z = bay <= 3
      ? ROW_TOP_Z + (bay - 0.5) * 2.7
      : ROW_TOP_Z + 10.8 + (bay - 4 + 0.5) * 2.7;
    return {
      key: `R06-R${String(bay).padStart(2, '0')}`,
      x: 21.4,
      z,
      len: 2.7,
      dep: 1.2,
      axis: 'z',
      aisleKey: 'aisle3',
      aisleX: AISLE_X.aisle3,
      aisleZ: z,
      faceX: 1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0x2563eb,
    };
  }

  if (row === 'Row 7' || row === 'Row 8' || row === 'Row 9') {
    const z = ROW_TOP_Z + (bay - 0.5) * 3.3;
    const cfg = {
      'Row 7': { x: 22.7, aisleKey: 'aisle4', faceX: -1, pref: 'R07' },
      'Row 8': { x: 28.1, aisleKey: 'aisle4', faceX: 1, pref: 'R08' },
      'Row 9': { x: 29.4, aisleKey: 'aisle5', faceX: -1, pref: 'R09' },
    }[row];
    return {
      key: `${cfg.pref}-R${String(bay).padStart(2, '0')}`,
      x: cfg.x,
      z,
      len: 3.3,
      dep: 1.2,
      axis: 'z',
      aisleKey: cfg.aisleKey,
      aisleX: AISLE_X[cfg.aisleKey],
      aisleZ: z,
      faceX: cfg.faceX,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0xc026d3,
    };
  }

  if (row === 'Row 10') {
    const z = bay <= 3
      ? ROW_TOP_Z + (bay - 0.5) * 3.3
      : ROW_TOP_Z + 13.2 + (bay - 4 + 0.5) * 3.3;
    return {
      key: `R10-R${String(bay).padStart(2, '0')}`,
      x: 34.8,
      z,
      len: 3.3,
      dep: 1.2,
      axis: 'z',
      aisleKey: 'aisle5',
      aisleX: AISLE_X.aisle5,
      aisleZ: z,
      faceX: 1,
      faceZ: 0,
      kind: 'selective',
      colorHex: 0xc026d3,
    };
  }

  const isR11 = row === 'Row 11';
  const z = ROW_TOP_Z + (bay - 0.5) * 4.0;
  return {
    key: `${isR11 ? 'R11' : 'R12'}-R${String(bay).padStart(2, '0')}`,
    x: isR11 ? 36.4 : 42.3,
    z,
    len: 4.0,
    dep: 1.5,
    axis: 'z',
    aisleKey: 'aisle6',
    aisleX: AISLE_X.aisle6,
    aisleZ: z,
    faceX: isR11 ? -1 : 1,
    faceZ: 0,
    kind: 'floor',
  };
}

export function tierElevation(loc) {
  const t = tierNum(loc);
  if (loc.zone === 'Zone 3' && loc.row_line === 'Line 1 (Cant)') {
    if (t === 3) return 2.48;
    if (t === 2) return 1.35;
    return 0.16;
  }
  if (String(loc.rack_type || '').includes('Floor')) return 0.04;
  return t >= 2 ? 1.92 : 0.06;
}

export function buildObstacleBoxes(locations) {
  const boxes = [];
  const seenBays = new Set();
  for (const loc of locations || []) {
    const bkey = `${loc.row_line}::${loc.bay}`;
    if (seenBays.has(bkey)) continue;
    seenBays.add(bkey);
    const p = getBayPose(loc);
    const alongZ = p.axis === 'z';
    const hx = (alongZ ? p.dep : p.len) * 0.5;
    const hz = (alongZ ? p.len : p.dep) * 0.5;
    boxes.push({
      id: p.key,
      kind: 'rack',
      minX: p.x - hx,
      maxX: p.x + hx,
      minZ: p.z - hz,
      maxZ: p.z + hz,
    });
  }
  for (const c of COLUMNS_POS) {
    boxes.push({
      id: `col-${c.x}-${c.z}`,
      kind: 'column',
      minX: c.x - c.halfW,
      maxX: c.x + c.halfW,
      minZ: c.z - c.halfD,
      maxZ: c.z + c.halfD,
    });
  }
  // East Office Wing
  boxes.push({ id: 'office', kind: 'office', minX: 43.9, maxX: 50.5, minZ: 11.6, maxZ: 43.4 });
  // Shutter Door Steel Posts
  boxes.push({ id: 'shutter-post-n', kind: 'shutter', minX: 50.6, maxX: 51.0, minZ: 3.9, maxZ: 4.3 });
  boxes.push({ id: 'shutter-post-s', kind: 'shutter', minX: 50.6, maxX: 51.0, minZ: 9.1, maxZ: 9.5 });
  return boxes;
}

export function usesLongDolly(sku) {
  return Number(sku?.L_mm || 0) > 4500;
}

export function isWideCrosswise(spec) {
  return Boolean(spec && spec.carryAxis === 'x' && spec.L_mm >= 2500);
}

export function hwyWideZ(specOrSku) {
  const l = Number(specOrSku?.L_mm || 0);
  if (l >= 3500 && l <= 4500) return HWY_Z_MID;
  return HWY_Z_WIDE_3M;
}

export function getCargoCarrySpec(tag, sku, wt, type = 'jack', carryMode = null) {
  const L_mm = Number(sku?.L_mm || 1100);
  const W_mm = Number(sku?.W_mm || 1000);
  const weight = Number(wt || sku?.unit_wt_kg || 450);
  const scale = 0.84;
  const L_m = (L_mm / 1000) * scale;
  const W_m = (W_mm / 1000) * scale;
  // Option 1:
  // - Items <= 4.0m (1.1m-3.85m) are ALWAYS carried crosswise ('forks', axis 'x') in front of the mast/tiller.
  // - Items > 4.5m (5.8m-7.5m) travel along Highway on a low-profile wheeled steel dolly ('dolly', axis 'z'),
  //   then transfer onto Walkie Stacker forks crosswise ('forks', axis 'x') when placing/picking at Zone 3 bays.
  const mode = carryMode || (L_mm > 4500 ? 'dolly' : 'forks');
  const isDolly = mode === 'dolly';
  const halfX = isDolly ? Math.max(W_m / 2, 0.42) : L_m / 2;
  const halfZ = isDolly ? L_m / 2 : W_m / 2;
  const baseForkZ = type === 'stacker' ? 0.78 : 0.68;
  const offsetZ = isDolly ? 0.12 : baseForkZ + Math.max(0, halfZ - 0.45);
  return {
    tag,
    L_mm,
    W_mm,
    wt: weight,
    carryMode: mode,
    carryAxis: isDolly ? 'z' : 'x',
    halfX,
    halfZ,
    offsetZ,
  };
}

export function getVehicleWorldAABB(cx, cz, yaw, spec) {
  let uMinX = -0.40;
  let uMaxX = 0.40;
  let uMinZ = -0.78;
  let uMaxZ = 0.86;
  if (spec) {
    uMinX = Math.min(uMinX, -spec.halfX);
    uMaxX = Math.max(uMaxX, spec.halfX);
    uMinZ = Math.min(uMinZ, spec.offsetZ - spec.halfZ);
    uMaxZ = Math.max(uMaxZ, spec.offsetZ + spec.halfZ);
  }
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  const corners = [
    [uMinX, uMinZ],
    [uMaxX, uMinZ],
    [uMaxX, uMaxZ],
    [uMinX, uMaxZ],
  ];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = cx + lx * c + lz * s;
    const wz = cz - lx * s + lz * c;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  return { minX, maxX, minZ, maxZ, uMinZ, uMaxZ };
}

export function inferCorridor(x, z) {
  if (z >= 10.2) {
    let best = 'aisle1';
    let bestDist = Infinity;
    for (const [k, ax] of Object.entries(AISLE_X)) {
      const d = Math.abs(x - ax);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    return best;
  }
  return 'hwy';
}

// Strict orthogonal corridor router with Highway Centerline wide-corridor & Zone 3 bay staging
export function buildCorridorPath(fromX, fromZ, toX, toZ, targetAisle, targetLockKey = null, carryingSpec = null, targetSku = null) {
  const pts = [];
  const pushUnique = (nx, nz, aisleTag, lockKey = null) => {
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(prev.x - nx, prev.z - nz) < 0.08) {
      prev.aisle = aisleTag;
      if (lockKey) prev.lockKey = lockKey;
      return;
    }
    if (!prev && Math.hypot(fromX - nx, fromZ - nz) < 0.08) return;
    pts.push({ x: nx, z: nz, aisle: aisleTag, lockKey });
  };

  const curAisle = inferCorridor(fromX, fromZ);
  const dstAisle = targetAisle || inferCorridor(toX, toZ);
  const crosswiseCarried = Boolean(carryingSpec && carryingSpec.carryAxis === 'x' && carryingSpec.L_mm > 1500);
  const wideCross = isWideCrosswise(carryingSpec);

  const isDstVertical = dstAisle !== 'hwy' && dstAisle !== 'park' && dstAisle !== 'hwy_wall' && Boolean(AISLE_X[dstAisle]);
  // Crosswise 2.2m-3.85m loads track straight down AISLE_X (no -1.30 lateral jog near Parking Stalls)
  const enterX = isDstVertical ? (crosswiseCarried ? AISLE_X[dstAisle] : AISLE_X[dstAisle] - 1.30) : toX;
  const exitX = curAisle !== 'hwy' ? AISLE_X[curAisle] : fromX;

  const goingEast = enterX > exitX + 0.15;
  const is2m = Boolean(carryingSpec && carryingSpec.carryAxis === 'x' && carryingSpec.L_mm >= 1600 && carryingSpec.L_mm < 2500);
  const is2mWest = is2m && !goingEast;
  const is2mEast = is2m && goingEast;
  // When already in the South Highway apron (z>=7.2) heading strictly into a parking stall, stay on 7.95 instead of crossing 6.70.
  // Westbound 2.2m crosswise loads use z=5.75 to clear 7.65; Eastbound 2.2m use z=7.65 to clear 9.68 parked stalls AND 5.75.
  const hwyLaneZ = wideCross
    ? hwyWideZ(carryingSpec)
    : ((curAisle === 'hwy' && fromZ >= 7.2 && dstAisle === 'park' && (goingEast || Math.abs(toX - fromX) < 3.0)) ? HWY_Z_OUT : (goingEast ? (is2mEast ? 7.65 : HWY_Z_OUT) : (is2mWest ? 5.75 : HWY_Z_IN)));

  // Case 1: Both endpoints inside the SAME vertical working aisle (centerline AISLE_X!)
  if (curAisle !== 'hwy' && curAisle === dstAisle && toZ >= 10.2) {
    pushUnique(AISLE_X[curAisle], toZ, curAisle);
    return pts;
  }

  // Step 1: Exit vertical aisle straight down centerline AISLE_X -> Highway lane (zero diagonal sweeps!)
  if (curAisle !== 'hwy') {
    pushUnique(exitX, wideCross ? 9.4 : 8.6, curAisle);
    pushUnique(exitX, hwyLaneZ, 'hwy');
  } else if (fromZ <= HWY_WALL_Z + 0.35 && dstAisle !== 'hwy_wall') {
    // Exit North-wall bay straight down from current bay X to Highway lane (0 horizontal interference with aisles)
    pushUnique(fromX, hwyLaneZ, 'hwy');
  } else if (Math.abs(fromZ - hwyLaneZ) > 0.15 && Math.abs(enterX - fromX) > 0.25) {
    pushUnique(fromX, hwyLaneZ, 'hwy');
  }

  // Step 2: Travel horizontally along Highway (7.95 Eastbound, 5.45 Westbound, or 6.70 Centerline Wide-Corridor)
  const curLast = pts.length ? pts[pts.length - 1] : { x: fromX, z: fromZ };
  const dstHwyX = enterX;
  if (Math.abs(dstHwyX - curLast.x) > 0.15) {
    pushUnique(dstHwyX, hwyLaneZ, 'hwy');
  }

  // Step 3: Turn cleanly off Highway into target destination
  if (isDstVertical) {
    if (crosswiseCarried) {
      // Crosswise 2.2m-3.85m enters directly along AISLE_X centerline
      pushUnique(AISLE_X[dstAisle], 9.95, dstAisle, dstAisle);
      pushUnique(AISLE_X[dstAisle], toZ, dstAisle, dstAisle);
    } else {
      // Wait cleanly off-Highway at (AISLE_X - 1.30, 9.95) clear of exiting traffic, then step orthogonally onto AISLE_X.
      pushUnique(AISLE_X[dstAisle] - 1.30, 9.95, dstAisle, dstAisle);
      pushUnique(AISLE_X[dstAisle], 9.95, dstAisle, dstAisle);
      pushUnique(AISLE_X[dstAisle], toZ, dstAisle, dstAisle);
    }
  } else if (dstAisle === 'hwy' && toZ <= HWY_WALL_Z + 0.35 && targetLockKey) {
    // Align straight in front of North-wall bay on Highway approach lane (wide corridor or 5.45)
    const isWideRef = wideCross || (!carryingSpec && targetSku && targetSku.L_mm >= 2500 && targetSku.L_mm <= 4500);
    const stageZ = isWideRef ? hwyWideZ(carryingSpec || targetSku) : HWY_Z_IN;
    pushUnique(toX, stageZ, 'hwy_wall', targetLockKey);
    pushUnique(toX, toZ, 'hwy_wall', targetLockKey);
  } else {
    pushUnique(toX, toZ, 'hwy');
  }

  return pts;
}

export function slotWorldPos(pose, loc, slotIndex, slotMode, sku) {
  const y = tierElevation(loc);
  const isSingle = slotMode !== '2x1' && slotMode !== 'CANT' && slotMode !== '1+SP';
  // On 6.1m Cantilever bays with 2 shared SKUs (e.g. U90 + U91 or U12 + U13),
  // place both full-length 6.1m bundles parallel along X, separated front/back in Z on the arms!
  if (pose.kind === 'cant' && sku && (sku.L_mm || 0) >= 4000) {
    const zShift = slotIndex === 0 ? -0.18 : 0.22;
    return { x: pose.x, y, z: pose.z + zShift };
  }
  const offsetSign = slotIndex === 0 ? -1 : 1;
  const shift = isSingle ? 0 : offsetSign * (pose.len * 0.24);
  if (pose.axis === 'z') {
    return { x: pose.x, y, z: pose.z + shift };
  }
  return { x: pose.x + shift, y, z: pose.z };
}

export function aabbOverlap(a, b, pad = 0) {
    return a.maxX + pad > b.minX && a.minX - pad < b.maxX && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
  }

export function getMoveYaw(v, dx, dz, wp) {
    // Keep 5.8m-7.5m Highway dolly loads strictly East-West parallel during 4.10 <-> 5.45 <-> 7.95 shifts
    if (v.carryingSpec && v.carryingSpec.carryMode === 'dolly' && v.z <= HWY_Z_OUT + 0.5 && wp && wp.z <= HWY_Z_OUT + 0.5) {
      if (dx < -0.1) return -Math.PI / 2;
      if (dx > 0.1) return Math.PI / 2;
      return v.yaw >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    return Math.atan2(dx, dz);
  }
