// CAD-Accurate 3D Warehouse Simulation Engine (Level 2 Area 3 — v7)
// Dynamically imported when the "3D Simulation" tab is activated.

let THREE = null;
let OrbitControls = null;

// CAD Warehouse Geometry Constants (1 unit = 1 meter)
// Origin (0, 0): North-West corner of Level 2 Area 3
// +x = East (toward Shutter Door), +z = South (Row 1 -> 12 depth), +y = Up
export const WH_WIDTH = 53.5;
export const WH_DEPTH = 46.0;
export const HWY_Z_IN = 5.45;    // Strictly Westbound (-x) Highway lane (>=4.57m clear for 2.1m U11 through Shutter postN=4.3)
export const HWY_Z_OUT = 7.95;   // Strictly Eastbound (+x) Highway lane (2.5m south of HWY_Z_IN)
export const PARK_Z = 9.68;      // Open apron south of Highway lanes (>=0.09m below 7.95 vertical exits, >=0.85m X-clear of columns)
export const HWY_WALL_Z = 4.10;  // Parallel access lane in front of HWY-FLOOR / CANT / Row 1 (>=0.16m south of HWY-FLOOR-01 rack)
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

// Dedicated parking stalls spaced >=1.9m apart, >=0.85m clear of columns, and >=1.30m clear of aisle wait lanes
export const PARKING_STALLS = [
  { x: 8.1, z: PARK_Z },
  { x: 14.35, z: PARK_Z },
  { x: 16.25, z: PARK_Z },
  { x: 20.8, z: PARK_Z },
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
    const accessX = bay === 1 ? 35.9 : (bay === 2 ? 42.8 : 46.6);
    return {
      key: `CANT-R0${bay}`,
      x: cx,
      z: 1.8,
      len: 6.1,
      dep: 1.2,
      axis: 'x',
      aisleKey: 'hwy',
      aisleX: accessX,
      aisleZ: HWY_WALL_Z,
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

export function getCargoCarrySpec(tag, sku, wt, type = 'jack') {
  const L_mm = Number(sku?.L_mm || 1100);
  const W_mm = Number(sku?.W_mm || 1000);
  const weight = Number(wt || sku?.unit_wt_kg || 450);
  const scale = 0.84;
  const L_m = (L_mm / 1000) * scale;
  const W_m = (W_mm / 1000) * scale;
  // Items >1.5m travel lengthwise along vehicle (+Z local) so 3.05m-7.5m loads fit cleanly
  // through the 4.80m Shutter Door and 4.0-4.4m aisles without clipping uprights or posts.
  const isLengthwise = L_mm > 1500;
  return {
    tag,
    L_mm,
    W_mm,
    wt: weight,
    carryAxis: isLengthwise ? 'z' : 'x',
    halfX: isLengthwise ? W_m / 2 : L_m / 2,
    halfZ: isLengthwise ? L_m / 2 : W_m / 2,
    offsetZ: isLengthwise ? 0.12 : (type === 'stacker' ? 0.72 : 0.64),
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

// Strict orthogonal corridor router with two-lane aisle mouths (±0.9m) & North-wall pull-through
export function buildCorridorPath(fromX, fromZ, toX, toZ, targetAisle, targetLockKey = null) {
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

  const isDstVertical = dstAisle !== 'hwy' && dstAisle !== 'park';
  const enterX = isDstVertical ? AISLE_X[dstAisle] - 1.30 : toX;
  const exitX = curAisle !== 'hwy' ? AISLE_X[curAisle] : fromX;

  const goingEast = enterX > exitX + 0.15;
  const hwyLaneZ = goingEast ? HWY_Z_OUT : HWY_Z_IN;

  // Case 1: Both endpoints inside the SAME vertical working aisle (centerline AISLE_X!)
  if (curAisle !== 'hwy' && curAisle === dstAisle && toZ >= 10.2) {
    pushUnique(AISLE_X[curAisle], toZ, curAisle);
    return pts;
  }

  // Step 1: Exit vertical aisle straight down centerline AISLE_X -> Highway lane (zero diagonal sweeps!)
  if (curAisle !== 'hwy') {
    pushUnique(exitX, 8.6, curAisle);
    pushUnique(exitX, hwyLaneZ, 'hwy');
  } else if (fromZ <= HWY_WALL_Z + 0.35 && dstAisle !== 'hwy_wall') {
    // Exit North-wall bay straight down from current bay X to Highway lane (0 horizontal interference with aisles)
    pushUnique(fromX, hwyLaneZ, 'hwy');
  } else if (Math.abs(fromZ - hwyLaneZ) > 0.15 && Math.abs(enterX - fromX) > 0.25) {
    pushUnique(fromX, hwyLaneZ, 'hwy');
  }

  // Step 2: Travel horizontally along one-way Highway lane (7.95 Eastbound or 5.45 Westbound)
  const curLast = pts.length ? pts[pts.length - 1] : { x: fromX, z: fromZ };
  const dstHwyX = enterX;
  if (Math.abs(dstHwyX - curLast.x) > 0.15) {
    pushUnique(dstHwyX, hwyLaneZ, 'hwy');
  }

  // Step 3: Turn cleanly off Highway into target destination
  if (isDstVertical) {
    // Wait cleanly off-Highway at (AISLE_X - 1.30, 9.95) >= 1.30m west & 1.70m south of HWY_Z_OUT so exiting traffic
    // can pass unobstructed straight down AISLE_X even with 1.2m wide crates, then step orthogonally onto AISLE_X.
    pushUnique(AISLE_X[dstAisle] - 1.30, 9.95, dstAisle, dstAisle);
    pushUnique(AISLE_X[dstAisle], 9.95, dstAisle, dstAisle);
    pushUnique(AISLE_X[dstAisle], toZ, dstAisle, dstAisle);
  } else if (dstAisle === 'hwy' && toZ <= HWY_WALL_Z + 0.35 && targetLockKey) {
    // Align straight in front of North-wall bay on HWY_Z_IN, then slide laterally into HWY_WALL_Z
    pushUnique(toX, HWY_Z_IN, 'hwy_wall', targetLockKey);
    pushUnique(toX, toZ, 'hwy_wall', targetLockKey);
  } else {
    pushUnique(toX, toZ, 'hwy');
  }

  return pts;
}

function slotWorldPos(pose, loc, slotIndex, slotMode, sku) {
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

function makeLabelTexture(text, bg, fg, w = 256, h = 64, font = 'bold 28px Inter, system-ui, sans-serif') {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeMastMeshTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  ctx.strokeRect(2, 2, 124, 124);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function makeFloorStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(234, 179, 8, 0.14)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
  ctx.lineWidth = 10;
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function skuPaletteColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  const palette = [0x2563eb, 0x0ea5e9, 0x10b981, 0x8b5cf6, 0x06b6d4, 0x3b82f6, 0x6366f1];
  return palette[hash % palette.length];
}

// Accurate cargo meshes preserving true L_mm for long Unistrut, Whip Pipe, Basket Tray, Busway Crates, and Standard Pallets
function buildCargoMesh(tag, sku, pose, isWide, isCant, tier = 1) {
  const group = new THREE.Group();
  const method = sku?.method || 'Pallet';
  const cat = String(sku?.category || '');
  const L_m = (sku?.L_mm || 1100) / 1000;
  const W_m = (sku?.W_mm || 1000) / 1000;
  const H_m = (sku?.H_mm || 1150) / 1000;

  const isLongItem = L_m > 1.25;
  const maxBayLen = isCant ? 5.85 : ((isWide || isLongItem) ? pose.len * 0.94 : pose.len * 0.44);
  const rawL = Math.max(0.8, Math.min(L_m, maxBayLen));
  const rawW = isCant ? 0.34 : Math.max(0.68, Math.min(W_m, pose.dep * 0.88));
  // Keep L1 selective cargo cleanly under 1.85m L2 beam; allow fuller height on L2/Floor
  const maxH = (pose.kind === 'selective' && tier === 1) ? 1.66 : 1.92;
  const rawH = Math.max(0.42, Math.min(H_m, maxH));

  const alongZ = pose.axis === 'z';
  const sx = alongZ ? rawW : rawL;
  const sz = alongZ ? rawL : rawW;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.85 });
  const darkTimberMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

  // 1. Cantilever / Whip Pipe / Unistrut / Fire Pipe -> Long Metallic Strapped Bundles on Dunnage
  if (isCant || cat.includes('Unistrut') || cat.includes('Pipe') || cat.includes('Vienna arm')) {
    const bundleLen = Math.max(1.3, rawL);
    const bx = alongZ ? rawW * 0.86 : bundleLen;
    const bz = alongZ ? bundleLen : rawW * 0.86;
    const bh = Math.min(rawH, isCant ? 0.34 : (cat.includes('Vienna') ? 1.25 : 0.48));

    // Timber cross-sleepers underneath
    for (const f of [-0.34, 0, 0.34]) {
      const sleeper = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? bx * 1.04 : 0.14, 0.1, alongZ ? 0.14 : bz * 1.04),
        woodMat
      );
      sleeper.position.set(alongZ ? 0 : f * bundleLen, 0.05, alongZ ? f * bundleLen : 0);
      group.add(sleeper);
    }

    // Multiple longitudinal bars / pipes inside bundle
    const steelMat = new THREE.MeshStandardMaterial({
      color: cat.includes('Fire') ? 0xdc2626 : (cat.includes('Vienna') ? 0x64748b : 0x94a3b8),
      metalness: 0.55,
      roughness: 0.38,
    });
    const rows = isCant ? 2 : 3;
    const cols = 2;
    const subH = (bh - 0.1) / cols;
    const subW = (alongZ ? bx : bz) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offSide = (r - (rows - 1) / 2) * subW;
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(alongZ ? subW * 0.86 : bundleLen, subH * 0.88, alongZ ? bundleLen : subW * 0.86),
          steelMat
        );
        bar.position.set(alongZ ? offSide : 0, 0.1 + (c + 0.5) * subH, alongZ ? 0 : offSide);
        group.add(bar);
      }
    }

    // Steel strapping bands
    for (const f of [-0.36, 0, 0.36]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? bx * 1.02 : 0.06, bh + 0.03, alongZ ? 0.06 : bz * 1.02),
        strapMat
      );
      strap.position.set(alongZ ? 0 : f * bundleLen, 0.1 + bh / 2 - 0.02, alongZ ? f * bundleLen : 0);
      group.add(strap);
    }
    return group;
  }

  // 2. Wire Basket Tray / Long Flex (L > 1.25m, Method = Pallet) -> Full-length Skid + Open Metallic Mesh Tray Stack
  if (isLongItem && method === 'Pallet') {
    const skids = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), woodMat);
    skids.position.y = 0.06;
    group.add(skids);

    const trayMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.35 });
    const collarMat = new THREE.MeshStandardMaterial({ color: skuPaletteColor(tag), roughness: 0.5 });
    const stackH = Math.max(0.55, rawH - 0.14);
    for (let layer = 0; layer < 3; layer++) {
      const ly = 0.14 + (layer + 0.5) * (stackH / 3);
      const railL = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.96, (stackH / 3) * 0.72, sz * 0.96), trayMat);
      railL.position.y = ly;
      group.add(railL);
    }
    // Strapping & end-cap tags
    for (const f of [-0.32, 0.32]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? sx * 1.01 : 0.08, stackH + 0.06, alongZ ? 0.08 : sz * 1.01),
        strapMat
      );
      strap.position.set(alongZ ? 0 : f * rawL, 0.12 + stackH / 2, alongZ ? f * rawL : 0);
      group.add(strap);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, 0.12, sz * 0.98), collarMat);
    band.position.y = 0.14 + stackH * 0.55;
    group.add(band);
    return group;
  }

  // 3. Crating (Busway / Busplug heavy timber crates)
  if (method === 'Crating') {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.78 });
    const skids = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.96, 0.1, sz * 0.96), darkTimberMat);
    skids.position.y = 0.05;
    group.add(skids);

    const bodyH = rawH * 0.86;
    const body = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.94, bodyH, sz * 0.94), crateMat);
    body.position.y = 0.1 + bodyH / 2;
    group.add(body);

    const topBand = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, 0.08, sz * 0.98), darkTimberMat);
    topBand.position.y = 0.1 + bodyH - 0.04;
    const midBand = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, 0.07, sz * 0.98), darkTimberMat);
    midBand.position.y = 0.1 + bodyH * 0.45;
    group.add(topBand, midBand);

    // Vertical batten ribs along crate length
    const ribCount = L_m >= 2.5 ? 4 : 2;
    for (let i = 0; i < ribCount; i++) {
      const f = ribCount === 1 ? 0 : -0.36 + (0.72 * i) / (ribCount - 1);
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? sx * 0.98 : 0.09, bodyH, alongZ ? 0.09 : sz * 0.98),
        darkTimberMat
      );
      rib.position.set(alongZ ? 0 : f * rawL, 0.1 + bodyH / 2, alongZ ? f * rawL : 0);
      group.add(rib);
    }
    return group;
  }

  // 4. Standard Method = Pallet (wooden pallet deck + 2 layers of cardboard cartons)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), woodMat);
  deck.position.y = 0.06;
  group.add(deck);

  const cartonMat = new THREE.MeshStandardMaterial({ color: 0xd6b084, roughness: 0.72 });
  const accentMat = new THREE.MeshStandardMaterial({ color: skuPaletteColor(tag), roughness: 0.5 });

  const boxH = Math.max(0.32, (rawH - 0.14) * 0.5);
  for (let layer = 0; layer < 2; layer++) {
    const bw = sx * 0.45;
    const bd = sz * 0.45;
    for (const ox of [-0.24, 0.24]) {
      for (const oz of [-0.24, 0.24]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(bw, boxH * 0.94, bd), cartonMat);
        box.position.set(ox * sx, 0.13 + (layer + 0.5) * boxH, oz * sz);
        group.add(box);
      }
    }
  }
  const collar = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.94, 0.09, sz * 0.94), accentMat);
  collar.position.y = 0.13 + boxH * 1.15;
  group.add(collar);

  return group;
}

function buildEquipmentMesh(type) {
  const root = new THREE.Group();
  const isStacker = type === 'stacker';
  const darkChassisMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.5, roughness: 0.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.45 });
  const forkMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.32 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });

  // Vehicle local frame: +Z points forward (forks lead when facing rack), -Z is rear walkie operator handle
  if (isStacker) {
    // Walkie-Type Electric Pallet Stacker (matching uploaded photo: compact orange hood + black lower skirt,
    // rear walkie tiller handle, NO cab/roof/seat, two-stage tall black mast, wire safety mesh, forward straddle/fork chassis)
    const orangeBody = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.34, metalness: 0.12 });
    const innerMastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.35 });

    // Lower black heavy base skirt
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.28, 0.82), darkChassisMat);
    skirt.position.set(0, 0.18, -0.35);
    root.add(skirt);

    // Sculpted lower rear step + vertical orange power/battery hood
    const hoodBase = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.22, 0.78), orangeBody);
    hoodBase.position.set(0, 0.41, -0.35);
    const hoodUpper = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.52), orangeBody);
    hoodUpper.position.set(0, 0.73, -0.22);
    root.add(hoodBase, hoodUpper);

    // Red E-stop button on top of power pack
    const eStop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    eStop.position.set(0.18, 0.98, -0.14);
    root.add(eStop);

    // Drive & swivel caster wheels underneath
    const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12);
    for (const wx of [-0.30, 0.30]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.11, -0.58);
      root.add(w);
    }

    // Offset-left rear Walkie Tiller Steering Arm + Control Head
    const tillerPivot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), orangeBody);
    tillerPivot.position.set(-0.22, 0.44, -0.74);
    const tillerShaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), darkMetal);
    tillerShaft.position.set(-0.22, 0.82, -0.92);
    tillerShaft.rotation.x = -0.45;
    const tillerHead = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.12), darkMetal);
    tillerHead.position.set(-0.22, 1.15, -1.07);
    const thumbKnob = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), orangeBody);
    thumbKnob.position.set(-0.22, 1.20, -1.07);
    root.add(tillerPivot, tillerShaft, tillerHead, thumbKnob);

    // Fixed Forward Straddle / Support Outrigger Frame
    for (const sx of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.05), darkChassisMat);
      leg.position.set(sx, 0.075, 0.60);
      root.add(leg);
    }

    // Two-Stage Nested Vertical Mast at z = +0.08
    const outerMastGeo = new THREE.BoxGeometry(0.09, 2.55, 0.12);
    const mL = new THREE.Mesh(outerMastGeo, darkChassisMat);
    mL.position.set(-0.32, 1.32, 0.08);
    const mR = new THREE.Mesh(outerMastGeo, darkChassisMat);
    mR.position.set(0.32, 1.32, 0.08);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.10, 0.14), darkChassisMat);
    topBar.position.set(0, 2.58, 0.08);
    // Center hydraulic lift cylinder + inner stage rails
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.35, 10), innerMastMat);
    cyl.position.set(0, 1.22, 0.10);
    root.add(mL, mR, topBar, cyl);

    // Wire Mesh Safety Guard Screen inside mast window
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 1.05),
      new THREE.MeshBasicMaterial({ map: makeMastMeshTexture(), transparent: true, side: THREE.DoubleSide })
    );
    screen.position.set(0, 1.48, 0.05);
    root.add(screen);

    // Lifting Fork Carriage (moves vertically along Y) + Fork Slide (extends along Z during load/unload)
    const carriage = new THREE.Group();
    carriage.position.y = 0.08;
    const carrBar = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.06), darkChassisMat);
    carrBar.position.set(0, 0.14, 0.18);
    carriage.add(carrBar);

    const forkSlide = new THREE.Group();
    const forkGeo = new THREE.BoxGeometry(0.11, 0.045, 1.12);
    const fL = new THREE.Mesh(forkGeo, forkMat);
    fL.position.set(-0.20, 0.04, 0.76);
    const fR = new THREE.Mesh(forkGeo, forkMat);
    fR.position.set(0.20, 0.04, 0.76);
    forkSlide.add(fL, fR);

    const cargoMount = new THREE.Group();
    cargoMount.position.set(0, 0.07, 0.80);
    forkSlide.add(cargoMount);
    carriage.add(forkSlide);
    root.add(carriage);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    beacon.position.set(-0.22, 2.68, 0.08);
    root.add(beacon);

    root.userData.carriage = carriage;
    root.userData.forkSlide = forkSlide;
    root.userData.cargoMount = cargoMount;
    root.userData.beacon = beacon;
  } else {
    // Walkie Electric Pallet Jack (ground/L1 only)
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.15 });
    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.58, 0.64), paintMat);
    drive.position.set(0, 0.34, -0.25);
    root.add(drive);

    const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.90, 0.06), darkMetal);
    tiller.position.set(0, 0.90, -0.52);
    tiller.rotation.x = -0.38;
    root.add(tiller);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.06, 0.08), darkMetal);
    handle.position.set(0, 1.32, -0.69);
    root.add(handle);

    const carriage = new THREE.Group();
    carriage.position.y = 0.05;
    const forkSlide = new THREE.Group();
    const forkGeo = new THREE.BoxGeometry(0.13, 0.055, 1.12);
    const fL = new THREE.Mesh(forkGeo, forkMat);
    fL.position.set(-0.19, 0.04, 0.64);
    const fR = new THREE.Mesh(forkGeo, forkMat);
    fR.position.set(0.19, 0.04, 0.64);
    forkSlide.add(fL, fR);

    const cargoMount = new THREE.Group();
    cargoMount.position.set(0, 0.08, 0.68);
    forkSlide.add(cargoMount);
    carriage.add(forkSlide);
    root.add(carriage);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    beacon.position.set(0, 0.68, -0.25);
    root.add(beacon);

    root.userData.carriage = carriage;
    root.userData.forkSlide = forkSlide;
    root.userData.cargoMount = cargoMount;
    root.userData.beacon = beacon;
  }

  return root;
}

export function createSimulationController({ container, getData, getTheme, onSelectLocation }) {
  const sim = {
    initialized: false,
    active: false,
    rafId: null,
    lastTs: 0,

    // User parameters
    scenario: 's1',
    jacksCount: 2,
    stackersCount: 2,
    speed: 2,
    running: false,

    // Clock & stats
    simTimeSec: 0,
    inCount: 0,
    outCount: 0,
    aisleWaits: 0,
    collisionsAvoided: 0,
    phaseLabel: 'Ready — S1 Putaway',
    nextVehicleUid: 1,

    // Scene objects
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    floorMesh: null,
    inArrow: null,
    outArrow: null,
    highlightRing: null,

    // Geometry & state
    bayPoses: new Map(),
    obstacleBoxes: [],
    bayPickables: [],
    slots: [],
    slotsByLoc: new Map(),
    taskQueue: [],
    outboundBatches: [],
    vehicles: [],
    aisleOccupant: new Map(),
    bypassClaims: new Set(),
    bypassCount: 0,
    cargoGroup: null,
    fleetGroup: null,
  };

  const dom = {
    scenario: document.getElementById('sim-scenario'),
    fleetTotal: document.getElementById('sim-fleet-total'),
    jackCount: document.getElementById('sim-jack-count'),
    stackCount: document.getElementById('sim-stack-count'),
    jackDec: document.getElementById('sim-jack-dec'),
    jackInc: document.getElementById('sim-jack-inc'),
    stackDec: document.getElementById('sim-stack-dec'),
    stackInc: document.getElementById('sim-stack-inc'),
    playBtn: document.getElementById('sim-play-btn'),
    resetBtn: document.getElementById('sim-reset-btn'),
    speedSel: document.getElementById('sim-speed'),
    camOverview: document.getElementById('sim-cam-overview'),
    camShutter: document.getElementById('sim-cam-shutter'),
    camAisles: document.getElementById('sim-cam-aisles'),
    statPhase: document.getElementById('sim-stat-phase'),
    statTime: document.getElementById('sim-stat-time'),
    statUnits: document.getElementById('sim-stat-units'),
    statFill: document.getElementById('sim-stat-fill'),
    statIn: document.getElementById('sim-stat-in'),
    statOut: document.getElementById('sim-stat-out'),
    statSpare: document.getElementById('sim-stat-spare'),
    statWaits: document.getElementById('sim-stat-waits'),
  };

  function updateFleetUI() {
    const total = sim.jacksCount + sim.stackersCount;
    if (dom.fleetTotal) dom.fleetTotal.textContent = String(total);
    if (dom.jackCount) dom.jackCount.textContent = String(sim.jacksCount);
    if (dom.stackCount) dom.stackCount.textContent = String(sim.stackersCount);
    if (dom.jackDec) dom.jackDec.disabled = sim.jacksCount <= 0 || total <= 1;
    if (dom.stackDec) dom.stackDec.disabled = sim.stackersCount <= 0 || total <= 1;
    if (dom.jackInc) dom.jackInc.disabled = total >= 10;
    if (dom.stackInc) dom.stackInc.disabled = total >= 10;
  }

  function updateTelemetry() {
    const occupied = sim.slots.filter((s) => s.occupied).length;
    const totalTarget = 225;
    const spareLocs = new Set();
    for (const [locId, locSlots] of sim.slotsByLoc.entries()) {
      if (locSlots.every((s) => !s.occupied)) spareLocs.add(locId);
    }
    const mins = Math.floor(sim.simTimeSec / 60);
    const secs = Math.floor(sim.simTimeSec % 60);

    if (dom.statPhase) dom.statPhase.textContent = sim.phaseLabel;
    if (dom.statTime) dom.statTime.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (dom.statUnits) dom.statUnits.textContent = `${occupied} / ${totalTarget}`;
    if (dom.statFill) dom.statFill.textContent = `${Math.round((occupied / totalTarget) * 100)}%`;
    if (dom.statIn) dom.statIn.textContent = String(sim.inCount);
    if (dom.statOut) dom.statOut.textContent = String(sim.outCount);
    if (dom.statSpare) dom.statSpare.textContent = String(spareLocs.size);
    if (dom.statWaits) dom.statWaits.textContent = String(sim.aisleWaits);
  }

  function applySceneTheme(theme) {
    if (!sim.initialized) return;
    const isLight = theme === 'light';
    sim.scene.background.setHex(isLight ? 0xe5ecf6 : 0x080d17);
    if (sim.floorMesh) sim.floorMesh.material.color.setHex(isLight ? 0xcfd9e8 : 0x111a2b);
  }

  function setCameraPreset(mode) {
    if (!sim.initialized) return;
    if (mode === 'shutter') {
      sim.camera.position.set(58, 17, 22);
      sim.controls.target.set(34, 1.2, 5.5);
    } else if (mode === 'aisles') {
      sim.camera.position.set(22, 16, 48);
      sim.controls.target.set(22, 1.2, 20);
    } else {
      sim.camera.position.set(26, 42, 56);
      sim.controls.target.set(25, 0.5, 20);
    }
    sim.controls.update();
  }

  async function initThreeScene() {
    if (sim.initialized) return;
    if (!THREE) {
      THREE = await import('three');
      ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    }

    const w = container.clientWidth || 960;
    const h = container.clientHeight || 610;
    const isLight = getTheme() === 'light';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isLight ? 0xe5ecf6 : 0x080d17);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.2, 300);
    camera.position.set(26, 42, 56);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(25, 0.5, 20);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(38, 52, 28);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
    fill.position.set(-20, 22, -15);
    scene.add(fill);

    const floorMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0xcfd9e8 : 0x111a2b,
      roughness: 0.9,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WH_WIDTH + 4, WH_DEPTH + 4), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WH_WIDTH / 2 - 1, 0, WH_DEPTH / 2 - 1);
    scene.add(floor);
    sim.floorMesh = floor;

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(51.2, 1.4, 0.25), wallMat);
    northWall.position.set(25.2, 0.7, 0.1);
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 44.0), wallMat);
    westWall.position.set(0.1, 0.7, 22.0);
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(51.2, 1.4, 0.25), wallMat);
    southWall.position.set(25.2, 0.7, 44.0);
    const officeBorder = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.5, 31.8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    officeBorder.position.set(47.2, 0.25, 27.5);
    scene.add(northWall, westWall, southWall, officeBorder);

    buildFloorMarkingsAndShutter(scene);

    const colGeo = new THREE.BoxGeometry(0.55, 4.2, 0.55);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
    for (const c of COLUMNS_POS) {
      const pillar = new THREE.Mesh(colGeo, colMat);
      pillar.position.set(c.x, 2.1, c.z);
      scene.add(pillar);
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.25, 28),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    scene.add(ring);
    sim.highlightRing = ring;

    sim.cargoGroup = new THREE.Group();
    sim.fleetGroup = new THREE.Group();
    scene.add(sim.cargoGroup, sim.fleetGroup);

    sim.scene = scene;
    sim.camera = camera;
    sim.renderer = renderer;
    sim.controls = controls;
    sim.initialized = true;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPt = { x: 0, y: 0 };
    renderer.domElement.addEventListener('pointerdown', (e) => { downPt = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(sim.bayPickables, false);
      if (hits.length > 0 && hits[0].object.userData?.locId) {
        const locId = hits[0].object.userData.locId;
        const pose = sim.bayPoses.get(locId);
        if (pose) {
          sim.highlightRing.position.set(pose.x, 0.04, pose.z);
          sim.highlightRing.visible = true;
        }
        onSelectLocation?.(locId);
      }
    });

    window.addEventListener('resize', resize);

    buildStaticRacksFromData();
    resetScenario();
  }

  function buildFloorMarkingsAndShutter(scene) {
    // Highway 2-lane band (IN Westbound z=5.4, OUT Eastbound z=7.4)
    const laneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.24 });
    const hwyStrip = new THREE.Mesh(new THREE.PlaneGeometry(49.5, 4.2), laneMat);
    hwyStrip.rotation.x = -Math.PI / 2;
    hwyStrip.position.set(27.5, 0.008, 6.7);
    scene.add(hwyStrip);

    const dashMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 });
    for (let x = 5.0; x < 50.5; x += 2.2) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.012, 6.7);
      scene.add(dash);
    }

    // Dedicated Equipment Parking Apron markers
    const stallMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25 });
    for (const st of PARKING_STALLS) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), stallMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(st.x, 0.009, st.z);
      scene.add(pad);
    }

    const hwyLbl = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 1.3),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('HIGHWAY  ← IN / OUT →', 'rgba(15,23,42,0.72)', '#93c5fd', 320, 64), transparent: true })
    );
    hwyLbl.rotation.x = -Math.PI / 2;
    hwyLbl.position.set(22.5, 0.015, 6.7);
    scene.add(hwyLbl);

    const aisleHighlight = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.14 });
    Object.entries(AISLE_X).forEach(([, ax], idx) => {
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 31.0), aisleHighlight);
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(ax, 0.006, 26.0);
      scene.add(runner);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.7),
        new THREE.MeshBasicMaterial({ map: makeLabelTexture(`AISLE ${idx + 1}`, 'rgba(15,23,42,0.72)', '#e2e8f0', 192, 56), transparent: true })
      );
      sign.rotation.x = -Math.PI / 2;
      sign.position.set(ax, 0.015, 10.2);
      scene.add(sign);
    });

    const shutterFrameMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.4, roughness: 0.45 });
    const postN = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), shutterFrameMat);
    postN.position.set(50.8, 1.8, 4.1);
    const postS = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), shutterFrameMat);
    postS.position.set(50.8, 1.8, 9.3);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 5.6), shutterFrameMat);
    lintel.position.set(50.8, 3.65, 6.7);
    scene.add(postN, postS, lintel);

    const shutterSign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.9),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('SHUTTER DOOR  IN ← / OUT →', '#0f172a', '#f8fafc', 360, 72), transparent: true })
    );
    shutterSign.position.set(50.8, 4.35, 6.7);
    shutterSign.rotation.y = -Math.PI / 2;
    scene.add(shutterSign);

    function makeArrowGroup(dirSign, colorHex, text) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.36), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.15, 4), mat);
      head.rotation.z = dirSign < 0 ? Math.PI / 2 : -Math.PI / 2;
      head.rotation.x = Math.PI / 4;
      head.position.x = dirSign * 2.1;
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.65),
        new THREE.MeshBasicMaterial({ map: makeLabelTexture(text, 'rgba(15,23,42,0.85)', dirSign < 0 ? '#34d399' : '#fb7185', 160, 56), transparent: true })
      );
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.06, 0);
      grp.add(shaft, head, lbl);
      return grp;
    }

    const inArr = makeArrowGroup(-1, 0x10b981, 'IN ←');
    inArr.position.set(50.8, 0.06, HWY_Z_IN);
    const outArr = makeArrowGroup(+1, 0xf43f5e, 'OUT →');
    outArr.position.set(50.8, 0.06, HWY_Z_OUT);
    scene.add(inArr, outArr);
    sim.inArrow = inArr;
    sim.outArrow = outArr;
  }

  function buildStaticRacksFromData() {
    const data = getData();
    if (!data?.locations) return;

    sim.bayPoses.clear();
    sim.bayPickables = [];
    sim.obstacleBoxes = buildObstacleBoxes(data.locations);

    const baysMap = new Map();
    for (const loc of data.locations) {
      const bkey = `${loc.row_line}::${loc.bay}`;
      if (!baysMap.has(bkey)) baysMap.set(bkey, []);
      baysMap.get(bkey).push(loc);
    }

    const rackGroup = new THREE.Group();
    const stripeTex = makeFloorStripeTexture();
    const blueUpright = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.45, roughness: 0.45 });
    const magUpright = new THREE.MeshStandardMaterial({ color: 0xc026d3, metalness: 0.45, roughness: 0.45 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.35, roughness: 0.4 });
    const cantMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.45, roughness: 0.45 });
    const braceMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.5 });

    for (const locs of baysMap.values()) {
      const sample = locs[0];
      const pose = getBayPose(sample);
      for (const l of locs) sim.bayPoses.set(l.location_id, pose);

      const alongZ = pose.axis === 'z';
      const wX = alongZ ? pose.dep : pose.len;
      const wZ = alongZ ? pose.len : pose.dep;

      if (pose.kind === 'floor') {
        const floorBay = new THREE.Mesh(
          new THREE.PlaneGeometry(wX * 0.96, wZ * 0.96),
          new THREE.MeshBasicMaterial({ map: stripeTex, transparent: true })
        );
        floorBay.rotation.x = -Math.PI / 2;
        floorBay.position.set(pose.x, 0.015, pose.z);
        floorBay.userData.locId = sample.location_id;
        rackGroup.add(floorBay);
        sim.bayPickables.push(floorBay);
        continue;
      }

      if (pose.kind === 'cant') {
        const backZ = pose.z - 0.42;
        for (const ox of [-2.3, 0, 2.3]) {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.45, 0.16), cantMat);
          col.position.set(pose.x + ox, 1.725, backZ);
          rackGroup.add(col);
          for (const armY of [0.14, 1.32, 2.45]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.95), cantMat);
            arm.position.set(pose.x + ox, armY, backZ + 0.5);
            rackGroup.add(arm);
          }
        }
        for (const l of locs) {
          const ty = tierElevation(l) + 0.25;
          const hit = new THREE.Mesh(
            new THREE.BoxGeometry(pose.len * 0.94, 0.9, pose.dep),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hit.position.set(pose.x, ty, pose.z);
          hit.userData.locId = l.location_id;
          rackGroup.add(hit);
          sim.bayPickables.push(hit);
        }
        continue;
      }

      const upMat = pose.colorHex === 0xc026d3 ? magUpright : blueUpright;
      const frameH = (sample.frame_height_mm || 2700) / 1000 + 0.25;
      const beamY = 1.85;
      const hx = wX / 2 - 0.05;
      const hz = wZ / 2 - 0.05;

      const postGeo = new THREE.BoxGeometry(0.085, frameH, 0.085);
      for (const sx of [-hx, hx]) {
        for (const sz of [-hz, hz]) {
          const p = new THREE.Mesh(postGeo, upMat);
          p.position.set(pose.x + sx, frameH / 2, pose.z + sz);
          rackGroup.add(p);
        }
      }

      if (alongZ) {
        for (const sz of [-hz, hz]) {
          for (const ty of [0.85, 2.55]) {
            const tie = new THREE.Mesh(new THREE.BoxGeometry(wX - 0.1, 0.04, 0.04), braceMat);
            tie.position.set(pose.x, ty, pose.z + sz);
            rackGroup.add(tie);
          }
        }
        const bGeo = new THREE.BoxGeometry(0.07, 0.11, wZ - 0.08);
        const bL = new THREE.Mesh(bGeo, beamMat);
        bL.position.set(pose.x - hx, beamY, pose.z);
        const bR = new THREE.Mesh(bGeo, beamMat);
        bR.position.set(pose.x + hx, beamY, pose.z);
        rackGroup.add(bL, bR);
      } else {
        for (const sx of [-hx, hx]) {
          for (const ty of [0.85, 2.55]) {
            const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, wZ - 0.1), braceMat);
            tie.position.set(pose.x + sx, ty, pose.z);
            rackGroup.add(tie);
          }
        }
        const bGeo = new THREE.BoxGeometry(wX - 0.08, 0.11, 0.07);
        const bF = new THREE.Mesh(bGeo, beamMat);
        bF.position.set(pose.x, beamY, pose.z + hz);
        const bB = new THREE.Mesh(bGeo, beamMat);
        bB.position.set(pose.x, beamY, pose.z - hz);
        rackGroup.add(bF, bB);
      }

      for (const l of locs) {
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(wX * 0.92, 1.25, wZ * 0.92),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hit.position.set(pose.x, tierNum(l) >= 2 ? 2.45 : 0.75, pose.z);
        hit.userData.locId = l.location_id;
        rackGroup.add(hit);
        sim.bayPickables.push(hit);
      }
    }

    sim.scene.add(rackGroup);
  }

  function buildDay0SlotModel() {
    const data = getData();
    if (!data) return;

    while (sim.cargoGroup.children.length > 0) {
      sim.cargoGroup.remove(sim.cargoGroup.children[0]);
    }
    sim.slots = [];
    sim.slotsByLoc.clear();

    const skus = normalizeSkusMap(data.skus);
    const locations = data.locations || [];

    for (const loc of locations) {
      const pose = sim.bayPoses.get(loc.location_id);
      if (!pose) continue;
      const locSlots = [];

      const activeUnits = Number(loc.units_on_level || 0);
      const isWide = loc.slot_mode === 'SPAN' || loc.slot_mode === 'FL3' || loc.slot_mode === 'HWY';
      const isCant = pose.kind === 'cant';

      const slotSpecs = [];
      if (activeUnits >= 1 && loc.slot1_tag && loc.slot1_tag !== 'SPARE') {
        slotSpecs.push({ idx: 0, tag: loc.slot1_tag, wt: Number(loc.slot1_wt_kg || 0) });
      }
      if (activeUnits >= 2 && loc.slot2_tag && loc.slot2_tag !== 'SPARE' && !String(loc.slot2_tag).startsWith('[')) {
        slotSpecs.push({ idx: 1, tag: loc.slot2_tag, wt: Number(loc.slot2_wt_kg || 0) });
      }

      const capacity = isWide ? 1 : 2;
      for (let idx = 0; idx < capacity; idx++) {
        const spec = slotSpecs.find((s) => s.idx === idx) || null;
        const skuObj = spec ? skus[spec.tag] : null;
        const pos = slotWorldPos(pose, loc, idx, isWide ? 'SPAN' : (isCant ? 'CANT' : '2x1'), skuObj);
        const slot = {
          id: `${loc.location_id}#${idx + 1}`,
          locId: loc.location_id,
          loc,
          pose,
          slotIdx: idx,
          isWide,
          isCant,
          pos,
          day0Tag: spec ? spec.tag : null,
          day0Wt: spec ? spec.wt : 0,
          currentTag: null,
          currentWt: 0,
          occupied: false,
          reservedInbound: false,
          mesh: null,
        };
        sim.slots.push(slot);
        locSlots.push(slot);
        if (isWide) break;
      }
      sim.slotsByLoc.set(loc.location_id, locSlots);
    }
  }

  function needsStacker(slot, wt) {
    const t = tierNum(slot.loc);
    if (t >= 2) return true;
    if (slot.isCant) return true;
    if ((wt || 0) > 1400) return true;
    return false;
  }

  function setSlotCargo(slot, tag, wt, occupied, forceWide = false) {
    if (slot.mesh) {
      sim.cargoGroup.remove(slot.mesh);
      slot.mesh = null;
    }
    slot.occupied = Boolean(occupied);
    slot.currentTag = occupied ? tag : null;
    slot.currentWt = occupied ? (wt || 0) : 0;

    if (occupied && tag) {
      const skus = normalizeSkusMap(getData()?.skus);
      const sku = skus[tag];
      const useWide = forceWide || slot.isWide || ((sku?.L_mm || 0) > 1250);
      const pos = useWide && !slot.isCant && slot.slotIdx === 0
        ? { x: slot.pose.x, y: tierElevation(slot.loc), z: slot.pose.z }
        : slot.pos;
      slot.pos = pos;
      const mesh = buildCargoMesh(tag, sku, slot.pose, useWide, slot.isCant, tierNum(slot.loc));
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData.locId = slot.locId;
      sim.cargoGroup.add(mesh);
      slot.mesh = mesh;
    }
  }

  function taskPriorityRank(sku, wt) {
    const L = Number(sku?.L_mm || 1100);
    const w = Number(wt || sku?.unit_wt_kg || 450);
    if (L > 5500) return 0; // 7.5m Whip Pipe, 6.1m Unistrut, 5.8m Vienna Arm first
    if (L > 3500) return 1; // 3.85m U1 Busway crates
    if (L > 2200) return 2; // 3.05m Basket Trays
    if (L > 1250) return 3; // 1.3m-2.2m crates / pipes / flex
    if (w > 1500) return 4; // Heavy standard pallets (e.g. U85)
    return 5;               // Standard 1-pallet SKUs
  }

  function planScenarioQueues() {
    const data = getData();
    const skus = normalizeSkusMap(data?.skus);
    sim.taskQueue = [];
    sim.outboundBatches = [];
    sim.aisleOccupant.clear();

    const day0Slots = sim.slots.filter((s) => s.day0Tag);

    if (sim.scenario === 's1') {
      for (const s of sim.slots) setSlotCargo(s, null, 0, false);

      // Long-item-first dispatch: oversize/long items move IN first before standard pallets
      const sorted = [...day0Slots].sort((a, b) => {
        const ra = taskPriorityRank(skus[a.day0Tag], a.day0Wt);
        const rb = taskPriorityRank(skus[b.day0Tag], b.day0Wt);
        if (ra !== rb) return ra - rb;
        const bayDiff = (a.loc.bay || 1) - (b.loc.bay || 1);
        if (bayDiff !== 0) return bayDiff;
        return a.locId.localeCompare(b.locId);
      });

      for (const slot of sorted) {
        const sku = skus[slot.day0Tag];
        sim.taskQueue.push({
          kind: 'put',
          slot,
          tag: slot.day0Tag,
          wt: slot.day0Wt,
          sku,
          useWide: slot.isWide,
          requiresStacker: needsStacker(slot, slot.day0Wt),
        });
      }
      sim.phaseLabel = 'S1: Filling Day 0 Inbound (0 → 225)';
      return;
    }

    for (const s of sim.slots) {
      if (s.day0Tag) setSlotCargo(s, s.day0Tag, s.day0Wt, true);
      else setSlotCargo(s, null, 0, false);
    }

    const claimed = new Set();
    let cumOut = 0;

    for (let day = 1; day <= 5; day++) {
      const dayPicks = [];
      for (const [tag, sku] of Object.entries(skus)) {
        const prevUnits = Number(sku.burndown?.[String(day - 1)]?.spq_units || 0);
        const nextUnits = Number(sku.burndown?.[String(day)]?.spq_units || 0);
        const drop = Math.max(0, prevUnits - nextUnits);
        if (drop <= 0) continue;

        const candidates = sim.slots
          .filter((s) => s.currentTag === tag && !claimed.has(s.id))
          .sort((a, b) => (a.loc.bay || 99) - (b.loc.bay || 99));

        for (let i = 0; i < drop && i < candidates.length; i++) {
          const slot = candidates[i];
          claimed.add(slot.id);
          dayPicks.push({
            kind: 'pick',
            day,
            slot,
            tag,
            wt: slot.currentWt,
            sku,
            useWide: slot.isWide,
            requiresStacker: needsStacker(slot, slot.currentWt),
          });
        }
      }
      // Long items move OUT first within each day, then Highway-end Rack 01 priority
      dayPicks.sort((a, b) => {
        const ra = taskPriorityRank(a.sku, a.wt);
        const rb = taskPriorityRank(b.sku, b.wt);
        if (ra !== rb) return ra - rb;
        return (a.slot.loc.bay || 99) - (b.slot.loc.bay || 99);
      });
      cumOut += dayPicks.length;
      sim.outboundBatches.push({ day, count: dayPicks.length, cumOut });

      const dayRefills = [];
      if (sim.scenario === 's3') {
        const refillTargets = Object.entries(skus)
          .filter(([, sku]) => {
            const d0 = Number(sku.burndown?.['0']?.spq_units || 1);
            const cur = Number(sku.burndown?.[String(day)]?.spq_units || 0);
            return cur <= Math.max(1, Math.floor(d0 * 0.45));
          })
          .slice(0, 7);

        for (const [rTag, rSku] of refillTargets) {
          const L_mm = Number(rSku.L_mm || 1100);
          const isLong = L_mm > 1250;
          const spare = sim.slots.find((cand) => {
            if (cand.occupied || cand.reservedInbound) return false;
            const l = cand.loc;
            const siblings = sim.slotsByLoc.get(l.location_id) || [cand];
            if (isLong) {
              if (cand.slotIdx !== 0) return false;
              if (siblings.some((sib) => sib.occupied || sib.reservedInbound)) return false;
              if (cand.pose.len * 1000 < L_mm * 0.92) return false;
            }
            // Enforce strict physical rack domain compatibility for oversize items
            if (L_mm >= 5500 && String(rSku.category || '').includes('Unistrut')) {
              return l.zone === 'Zone 3' && l.row_line === 'Line 1 (Cant)';
            }
            if (L_mm >= 5500) return l.row_line === 'Highway Floor';
            if (L_mm >= 3500) return String(l.rack_type || '').includes('4.0x1.5m Floor');
            if (L_mm >= 2500) return String(l.rack_type || '').includes('3.3x1.2m') || String(l.rack_type || '').includes('Floor');
            if (l.zone === 'Zone 3' && l.row_line === 'Line 1 (Cant)') return rTag === 'U12' || rTag === 'U13' || rTag === 'U47';
            if (isLong) return String(l.rack_type || '').includes('Floor') || l.slot_mode === 'SPAN' || l.slot_mode === 'SPARE' || l.row_line.includes('Row 7') || l.row_line.includes('Row 8') || l.row_line.includes('Row 9') || l.row_line.includes('Row 10');
            if ((rSku.unit_wt_kg || 0) > 1500) return tierNum(l) === 1;
            return !String(l.rack_type || '').includes('Cantilever');
          });
          if (spare) {
            if (isLong) {
              for (const sib of (sim.slotsByLoc.get(spare.locId) || [spare])) {
                sib.reservedInbound = true;
              }
            } else {
              spare.reservedInbound = true;
            }
            dayRefills.push({
              kind: 'put',
              day,
              slot: spare,
              tag: rTag,
              wt: rSku.unit_wt_kg || 500,
              sku: rSku,
              useWide: isLong || spare.isWide,
              requiresStacker: needsStacker(spare, rSku.unit_wt_kg || 500),
            });
          }
        }
        dayRefills.sort((a, b) => taskPriorityRank(a.sku, a.wt) - taskPriorityRank(b.sku, b.wt));
      }

      // Emit day's long refills/picks up front, then interleave remaining picks & standard refills
      let pIdx = 0;
      let rIdx = 0;
      while (pIdx < dayPicks.length && taskPriorityRank(dayPicks[pIdx].sku, dayPicks[pIdx].wt) <= 2) {
        sim.taskQueue.push(dayPicks[pIdx++]);
      }
      while (rIdx < dayRefills.length && taskPriorityRank(dayRefills[rIdx].sku, dayRefills[rIdx].wt) <= 2) {
        sim.taskQueue.push(dayRefills[rIdx++]);
      }
      for (; pIdx < dayPicks.length; pIdx++) {
        sim.taskQueue.push(dayPicks[pIdx]);
        if (sim.scenario === 's3' && pIdx % 3 === 1 && rIdx < dayRefills.length) {
          sim.taskQueue.push(dayRefills[rIdx++]);
        }
      }
      while (rIdx < dayRefills.length) sim.taskQueue.push(dayRefills[rIdx++]);
    }

    sim.phaseLabel = sim.scenario === 's2'
      ? 'S2: Day 1–5 Kitting Take-Out (OUT →)'
      : 'S3: Mixed Take-Out (OUT →) & Refill (IN ←)';
  }

  function findFreeParkingStallIdx() {
    const used = new Set(sim.vehicles.map((v) => v.stallIdx));
    for (let i = 0; i < PARKING_STALLS.length; i++) {
      if (!used.has(i)) return i;
    }
    return sim.vehicles.length % PARKING_STALLS.length;
  }

  function createSingleVehicle(type, stallIdx) {
    const uid = sim.nextVehicleUid++;
    const stall = PARKING_STALLS[stallIdx] || PARKING_STALLS[0];
    const mesh = buildEquipmentMesh(type);
    mesh.position.set(stall.x, 0, stall.z);
    sim.fleetGroup.add(mesh);

    const v = {
      uid,
      id: `${type}-${uid}`,
      type,
      stallIdx,
      mesh,
      x: stall.x,
      z: stall.z,
      homeX: stall.x,
      homeZ: stall.z,
      yaw: 0,
      speed: type === 'jack' ? 4.4 : 3.9,
      state: 'idle', // idle | to_pickup | dwell_pickup | to_drop | dwell_drop
      task: null,
      waypoints: [],
      wpIdx: 0,
      dwellElapsed: 0,
      dwellDuration: 1.5,
      dwellSwapped: false,
      dwellTargetForkY: 0.06,
      dwellStartForkY: 0.06,
      dwellTargetYaw: 0,
      forkY: 0.06,
      forkReach: 0,
      carryingMesh: null,
      carryingSpec: null,
      heldAisle: null,
      waitAccum: 0,
      blockWait: 0,
      returningHome: false,
      bypassing: false,
      bypassTimer: 0,
      bypassCooldown: 0,
      bypassClaimKey: null,
    };
    sim.vehicles.push(v);
    return v;
  }

  function spawnFleet() {
    while (sim.fleetGroup.children.length > 0) {
      sim.fleetGroup.remove(sim.fleetGroup.children[0]);
    }
    sim.vehicles = [];
    sim.aisleOccupant.clear();
    sim.nextVehicleUid = 1;

    const specs = [];
    for (let i = 0; i < sim.jacksCount; i++) specs.push('jack');
    for (let i = 0; i < sim.stackersCount; i++) specs.push('stacker');
    const total = Math.min(10, specs.length);
    for (let i = 0; i < total; i++) {
      createSingleVehicle(specs[i], i);
    }
  }

  function removeOneVehicle(type) {
    // Prefer idle vehicle of matching type; fallback to vehicle returningHome, else least progressed
    let idx = sim.vehicles.findIndex((v) => v.type === type && v.state === 'idle');
    if (idx === -1) idx = sim.vehicles.findIndex((v) => v.type === type);
    if (idx === -1) return;

    const v = sim.vehicles[idx];
    if (v.task) {
      const carriedPicked = v.task.kind === 'pick' && (v.state === 'to_drop' || (v.state === 'dwell_pickup' && v.dwellSwapped) || v.state === 'dwell_drop');
      if (carriedPicked) {
        setSlotCargo(v.task.slot, v.task.tag, v.task.wt, true, v.task.useWide);
      }
      sim.taskQueue.unshift(v.task);
    }
    if (v.heldAisle && sim.aisleOccupant.get(v.heldAisle) === v.id) {
      sim.aisleOccupant.delete(v.heldAisle);
    }
    if (v.bypassClaimKey) sim.bypassClaims.delete(v.bypassClaimKey);
    sim.fleetGroup.remove(v.mesh);
    sim.vehicles.splice(idx, 1);
  }

  function assignTaskToVehicle(v, task) {
    v.task = task;
    v.returningHome = false;
    v.dwellSwapped = false;
    if (task.kind === 'put') {
      v.state = 'to_pickup';
      v.waypoints = buildCorridorPath(v.x, v.z, SHUTTER_IN_X, HWY_Z_IN, 'hwy');
      v.wpIdx = 0;
    } else {
      v.state = 'to_pickup';
      const p = task.slot.pose;
      const lockKey = p.aisleKey === 'hwy' ? `hwy_bay:${p.key}` : p.aisleKey;
      v.waypoints = buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey);
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

  function attachCargoToVehicle(v, tag, sku, slot, useWide) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    const spec = getCargoCarrySpec(tag, sku, slot.currentWt || v.task?.wt, v.type);
    const carryPose = { axis: spec.carryAxis, len: slot.pose.len, dep: slot.pose.dep, kind: slot.pose.kind };
    const mesh = buildCargoMesh(tag, sku, carryPose, useWide, slot.isCant, 1);
    mesh.scale.setScalar(0.84);
    // Align carried bundle/pallet center with OBB carry offset
    const defaultMountZ = v.type === 'stacker' ? 0.80 : 0.68;
    mesh.position.z = spec.offsetZ - defaultMountZ;
    mount.add(mesh);
    v.carryingMesh = mesh;
    v.carryingSpec = spec;
  }

  function clearVehicleCargo(v) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    v.carryingMesh = null;
    v.carryingSpec = null;
  }

  function aabbOverlap(a, b, pad = 0) {
    return a.maxX + pad > b.minX && a.minX - pad < b.maxX && a.maxZ + pad > b.minZ && a.minZ - pad < b.maxZ;
  }

  function getMoveYaw(v, dx, dz, wp) {
    // Keep 5.8m-7.5m North-wall loads strictly East-West parallel during 4.15 <-> 5.45 <-> 7.95 Highway shifts
    if (v.carryingSpec && v.carryingSpec.L_mm >= 5000 && v.z <= HWY_Z_OUT + 0.5 && wp && wp.z <= HWY_Z_OUT + 0.5) {
      if (dx < -0.1) return -Math.PI / 2;
      if (dx > 0.1) return Math.PI / 2;
      return v.yaw >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    return Math.atan2(dx, dz);
  }

  function computeSafeAdvance(v, nx, nz, dirX, dirZ, wp) {
    const nextYaw = getMoveYaw(v, dirX, dirZ, wp);
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

      const isParkedIdle = o.state === 'idle' && !o.returningHome;
      const isWallDocked = o.z <= HWY_WALL_Z + 0.35;
      // Forbid any move/turn that creates a new physical OBB overlap, and maintain approaching buffer
      if (aabbOverlap(aabb, oAabb, 0.005) && !aabbOverlap(curAabb, oAabb, 0.005)) {
        return { blocked: true, reason: 'vehicle', by: o };
      }
      if (aabbOverlap(aabb, oAabb, (isParkedIdle || isWallDocked) ? 0.05 : 0.16) && nextD < curD && !canTieBreak) {
        return { blocked: true, reason: 'vehicle', by: o };
      }

      if (movingHoriz) {
        const dzAbs = Math.abs(o.z - nz);
        const aheadX = (o.x - nx) * dirX;
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        const oIntentVert = Boolean(oWp && Math.abs(oWp.z - o.z) > 0.25 && Math.abs(oWp.x - o.x) < 0.35);
        // Ignore North-wall vehicles still parked at HWY_WALL_Z waiting to pull out (avoid mutual polite deadlock)
        const oCrossingVert = !isWallDocked && Boolean(o.heldAisle?.startsWith('hwy_bay:') || oIntentVert);
        const oMovingHoriz = !oCrossingVert && (Math.abs(Math.sin(o.yaw || 0)) > 0.7 || (oWp && Math.abs(oWp.x - o.x) > 0.25));
        const followDistX = vHalfX + oHalfX + 0.90;
        if (dzAbs < Math.max(0.85, vHalfZ + oHalfZ + 0.1) && oMovingHoriz && aheadX > 0 && aheadX < followDistX) {
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
        if (!isParkedIdle && !oMovingHoriz && oBlocksLane && aheadX >= crossStopMin && aheadX < crossStopMax && !canTieBreak) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
      }

      if (movingVert && !(o.state === 'idle' && !o.returningHome) && (o.waitAccum || 0) === 0 && (o.z - nz) * dirZ > 0 && (o.z - nz) * dirZ < (vHalfZ + oHalfZ + 1.15)) {
        const oDirX = Math.abs(Math.sin(o.yaw || 0)) > 0.7 ? Math.sign(Math.sin(o.yaw)) : 0;
        const oApproaching = oDirX !== 0 && (nx - o.x) * oDirX >= 0 && (nx - o.x) * oDirX < (vHalfX + oHalfX + 1.05);
        if ((Math.abs(o.x - nx) < (vHalfX + oHalfX + 0.02) || (oApproaching && (o.blockWait || 0) < 0.25)) && !canTieBreak) {
          return { blocked: true, reason: 'vehicle', by: o };
        }
      }
    }
    return { blocked: false };
  }

  function tryStartBypass(v, maxConcurrent = 2) {
    if (v.bypassing || (v.bypassCooldown || 0) > 0 || v.heldAisle || v.state === 'idle' || !v.task) return false;
    // Cap concurrent bypass maneuvers so vehicles never counter-block each other in pull-out lanes
    if (sim.vehicles.filter((o) => o.bypassing).length >= maxConcurrent) return false;
    // Never swing 3.85m-7.5m oversize Highway loads perpendicular into narrow pockets
    const L_mm = v.carryingSpec?.L_mm || 1100;
    if (L_mm > 3500) return false;
    // Only bypass if actually obstructing one of the two Highway lanes
    const onHwyLane = Math.abs(v.z - HWY_Z_IN) < 0.65 || Math.abs(v.z - HWY_Z_OUT) < 0.65;
    if (!onHwyLane) return false;
    // Don't abandon active Shutter IN/OUT dock queues where a linear queue clears faster than detouring
    if (v.x >= 40.0 && v.state === 'to_pickup' && v.task.kind === 'put') return false;
    if (v.x >= 43.0 && v.state === 'to_drop' && v.task.kind === 'pick') return false;
    // Never cut vertically across Highway if another vehicle is already crossing Highway [4.8..8.6] at this X
    for (const o of sim.vehicles) {
      if (o.uid === v.uid) continue;
      if (o.z >= 4.8 && o.z <= 8.6 && Math.abs(o.x - v.x) < 1.0 && (o.bypassing || Math.abs(Math.cos(o.yaw || 0)) > 0.7)) return false;
    }
    // Only bypass if swinging South at current X won't collide with obstacles or docked North-wall vehicles
    const turnAabb = getVehicleWorldAABB(v.x, Math.min(HWY_Z_OUT, v.z + 0.25), 0, v.carryingSpec);
    for (const b of sim.obstacleBoxes) {
      if (aabbOverlap(turnAabb, b, 0.08)) return false;
    }
    for (const o of sim.vehicles) {
      if (o.uid === v.uid) continue;
      if (o.z <= HWY_Z_IN && aabbOverlap(turnAabb, getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec), 0.25)) return false;
    }

    const candidates = [];

    // Option A: Free parking stalls at PARK_Z = 9.52 not claimed as an active vehicle's idle stall
    if (L_mm <= 2200) {
      for (let i = 0; i < PARKING_STALLS.length; i++) {
        const claimKey = `park:${i}`;
        if (sim.bypassClaims.has(claimKey)) continue;
        const st = PARKING_STALLS[i];
        const homeOwnerBusy = sim.vehicles.some((o) => o.uid !== v.uid && o.stallIdx === i && (o.state === 'idle' || o.returningHome || (o.state === 'to_drop' && sim.taskQueue.length < 4)));
        if (homeOwnerBusy) continue;
        const busy = sim.vehicles.some((o) => o.uid !== v.uid && Math.hypot(o.x - st.x, o.z - st.z) < 2.2);
        const stallAabb = getVehicleWorldAABB(st.x, st.z, 0, v.carryingSpec);
        const hitsObs = sim.obstacleBoxes.some((b) => aabbOverlap(stallAabb, b, 0.08));
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
        const pocketZ = L_mm > 2200 ? 12.2 : 10.1;
        const pocketAabb = getVehicleWorldAABB(ax, pocketZ, 0, v.carryingSpec);
        const hitsObs = sim.obstacleBoxes.some((b) => aabbOverlap(pocketAabb, b, 0.08));
        if (!hitsObs) {
          candidates.push({ x: ax, z: pocketZ, claimKey, aisle: pocketZ >= 10.2 ? ak : 'hwy', dist: Math.hypot(ax - v.x, pocketZ - v.z) });
        }
      }
    }

    if (candidates.length === 0) return false;
    candidates.sort((a, b) => a.dist - b.dist);
    const chosen = candidates[0];

    v.bypassing = true;
    v.bypassTimer = 2.4;
    v.bypassClaimKey = chosen.claimKey;
    sim.bypassClaims.add(chosen.claimKey);
    if (chosen.aisle !== 'park' && chosen.aisle !== 'hwy') {
      sim.aisleOccupant.set(chosen.aisle, v.id);
      v.heldAisle = chosen.aisle;
    }
    v.blockWait = 0;
    v.waypoints = buildCorridorPath(v.x, v.z, chosen.x, chosen.z, chosen.aisle === 'park' ? 'park' : chosen.aisle);
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
        v.waypoints = t.kind === 'put'
          ? buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey)
          : buildCorridorPath(v.x, v.z, SHUTTER_OUT_X, HWY_Z_OUT, 'hwy');
        v.wpIdx = 0;
      }
    }
  }

  function beginDwellPhase(v, mode, atRack) {
    v.state = mode;
    v.dwellElapsed = 0;
    v.dwellSwapped = false;
    v.dwellStartForkY = v.forkY;

    const t = v.task;
    if (atRack) {
      const p = t.slot.pose;
      const isLongNorthWall = (t.sku?.L_mm || 0) >= 5000 && p.aisleKey === 'hwy';
      // Keep 5.8m-7.5m North-wall loads oriented parallel East-West on side-reach dwell so they never swing into the wall
      v.dwellTargetYaw = isLongNorthWall ? -Math.PI / 2 : Math.atan2(p.faceX, p.faceZ);
      const elev = tierElevation(t.slot.loc);
      v.dwellTargetForkY = v.type === 'stacker' ? Math.max(0.08, Math.min(elev, 2.48)) : 0.06;
      v.dwellDuration = v.dwellTargetForkY > 1.0 ? 2.2 : 1.4;
      v.dwellExitYaw = p.aisleKey === 'hwy' ? -Math.PI / 2 : Math.PI;
    } else {
      // At SHUTTER IN face West (-pi/2) to match Westbound departure without swinging long loads 180 deg across HWY_Z_OUT
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

    // Align facing bay BEFORE [0.35] reach, then rotate smoothly to exit orientation [0.82..1.00] ONLY when clear!
    const desiredYaw = prog >= 0.82 ? (v.dwellExitYaw ?? v.dwellTargetYaw) : v.dwellTargetYaw;
    let yawDiff = desiredYaw - v.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const candYaw = Math.abs(yawDiff) < 0.08 || (prog >= 0.30 && prog < 0.82)
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

    // 4-Stage Fork Lift & Reach Timeline:
    // [0.00 - 0.35]: Raise carriage to target height
    // [0.35 - 0.55]: Extend forks forward into slot -> swap cargo at 0.52
    // [0.55 - 0.78]: Retract forks out of rack bay
    // [0.78 - 1.00]: Lower carriage smoothly down to travel height BEFORE driving off
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
          // Verify newly loaded OBB (at both current yaw and exit yaw) clears nearby vehicles before spawning
          const nextSpec = getCargoCarrySpec(t.tag, t.sku, t.wt, v.type);
          const nextAabbCur = getVehicleWorldAABB(v.x, v.z, v.yaw, nextSpec);
          const nextAabbExit = getVehicleWorldAABB(v.x, v.z, v.dwellExitYaw ?? v.yaw, nextSpec);
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
            attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide);
          } else {
            setSlotCargo(t.slot, null, 0, false);
            attachCargoToVehicle(v, t.tag, t.sku, t.slot, t.useWide);
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
      // Lift pallet slightly off rack while pulling back on Pick
      v.forkY = v.dwellTargetForkY + (v.state === 'dwell_pickup' ? 0.08 : -0.04);
      v.forkReach = (atRack ? 0.56 : 0.25) * k;
    } else {
      const k = (prog - 0.78) / 0.22;
      const travelY = 0.08;
      v.forkY = v.dwellTargetForkY + (travelY - v.dwellTargetForkY) * k;
      v.forkReach = 0;
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
        v.waypoints = buildCorridorPath(v.x, v.z, p.aisleX, p.aisleZ, p.aisleKey, lockKey);
      } else {
        v.waypoints = buildCorridorPath(v.x, v.z, SHUTTER_OUT_X, HWY_Z_OUT, 'hwy');
      }
      v.wpIdx = 0;
    } else {
      v.task = null;
      v.state = 'idle';
      v.returningHome = false;
    }
    return true;
  }

  function stepVehicle(v, dt) {
    if (v.bypassCooldown > 0) v.bypassCooldown = Math.max(0, v.bypassCooldown - dt);

    // 1. Idle task dispatch (prefers free aisles & free North-wall bays so traffic flows smoothly!)
    if (v.state === 'idle') {
      if (sim.taskQueue.length > 0) {
        const shutterInLoaders = sim.vehicles.filter((o) => o.uid !== v.uid && o.task?.kind === 'put' && (o.state === 'to_pickup' || o.state === 'dwell_pickup')).length;
        const taskAisleKey = (t) => (t.slot.pose.aisleKey === 'hwy' ? `hwy_bay:${t.slot.pose.key}` : t.slot.pose.aisleKey);
        const aisleActiveCount = (ak) => sim.vehicles.filter((o) => {
          if (o.uid === v.uid) return false;
          if (o.heldAisle === ak) return true;
          if (o.task && taskAisleKey(o.task) === ak) return true;
          return false;
        }).length;
        const canServeTask = (t, maxPerAisle) => {
          if (t.requiresStacker && v.type !== 'stacker') return false;
          if (t.kind === 'put' && shutterInLoaders >= 3) return false;
          const ak = taskAisleKey(t);
          if (aisleActiveCount(ak) >= maxPerAisle) return false;
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

    // Single-occupant lock for vertical Aisles 1..6 (acquired while waiting at (AISLE_X-1.08, 8.85) BEFORE stepping onto AISLE_X) and North-wall stubs
    const needVerticalLock = wp.aisle && wp.aisle !== 'hwy' && wp.aisle !== 'park' && wp.aisle !== 'hwy_wall' && Math.abs(v.x - (AISLE_X[wp.aisle] || v.x)) > 0.4 && Math.abs(wp.x - (AISLE_X[wp.aisle] || wp.x)) < 0.2 && v.heldAisle !== wp.aisle;
    const hwyHoldDist = (v.carryingSpec?.L_mm >= 3500 || v.task?.sku?.L_mm >= 3500) ? 4.4 : 2.2;
    const needHwyBayLock = wp.aisle === 'hwy_wall' && wp.lockKey && v.z >= HWY_Z_IN - 0.15 && wp.z <= HWY_Z_IN && v.heldAisle !== wp.lockKey && Math.abs(wp.x - v.x) < hwyHoldDist;
    const lockKeyNeeded = needVerticalLock ? wp.aisle : (needHwyBayLock ? wp.lockKey : null);

    if (lockKeyNeeded) {
      const occ = sim.aisleOccupant.get(lockKeyNeeded);
      if (occ && occ !== v.id) {
        const wasWaiting = v.waitAccum > 0;
        v.waitAccum += dt;
        v.blockWait = (v.blockWait || 0) + dt;
        if (!wasWaiting) sim.aisleWaits += 1;
        if (v.mesh.userData.beacon) v.mesh.userData.beacon.material.color.setHex(0xef4444);
        // Only yield off Highway if holding a North-wall lock on HWY_Z_IN AND another vehicle is waiting behind us!
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
      const exitedVertical = !v.heldAisle.startsWith('hwy_bay:') && (Math.abs(v.x - (AISLE_X[v.heldAisle] ?? v.x)) > 1.25 || v.z <= HWY_Z_IN + 0.25);
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

    // East-Dock (50.5..53.5, 5.45) Mutex: prevent SHUTTER_IN loaders (51.2) and SHUTTER_OUT returners (53.0)
    // from sandwiching back-to-back at (51.2, 5.45) & (52.9, 5.45) while holding long loads.
    if (v.z >= 7.35 && wp.z <= HWY_Z_IN + 0.3 && wp.x >= 50.5) {
      const isPutLoader = v.state === 'to_pickup' && v.task?.kind === 'put';
      const eastDockBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || o.z < 4.9 || o.z > 7.25) return false;
        return isPutLoader ? o.x >= 51.3 : o.x >= 49.6;
      });
      if (eastDockBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // North-Wall Pull-Through Yield: wait safely at HWY_WALL_Z (4.10, clear above 5.45) until target Highway span
    // and any adjacent vertical aisle exit conflict are open
    if (v.z <= HWY_WALL_Z + 0.25 && wp.z >= HWY_Z_IN - 0.1) {
      const spanHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.86;
      const wallMinX = v.x - spanHalf - 0.55;
      const wallMaxX = v.x + spanHalf + 0.55;
      const targetMaxZ = wp.z >= HWY_Z_OUT - 0.3 ? 8.65 : 6.15;
      const exitLaneBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || (o.state === 'idle' && !o.returningHome)) return false;
        // Never yield to a vehicle queuing to enter our own bay lock — we must exit so it can enter!
        if (v.heldAisle && o.waypoints.some((w) => w.lockKey === v.heldAisle)) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        if (oAabb.maxX > wallMinX && oAabb.minX < wallMaxX && oAabb.maxZ > 4.9 && oAabb.minZ < targetMaxZ) return true;
        // Also yield if an adjacent vertical aisle occupant is actively exiting past the mouth (z <= 9.9) within our swing span
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        if (wp.z >= HWY_Z_OUT - 0.3 && o.heldAisle && !o.heldAisle.startsWith('hwy_bay:') && oWp && oWp.z < o.z && o.z <= 9.9) {
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

    // Vertical Aisle Exit Yield: right before stepping out past z=10.6 onto HWY_Z_OUT (7.95), ensure turning radius along
    // [v.x - spanHalf - 0.65 .. v.x + spanHalf + 0.65] on Highway is clear of horizontal 7.95 traffic & descending North-wall exits
    if (v.heldAisle && !v.heldAisle.startsWith('hwy_bay:') && v.z >= 10.45 && v.z <= 10.95 && wp.z < v.z && wp.z <= 8.8) {
      const spanHalf = v.carryingSpec ? Math.max(v.carryingSpec.halfX, v.carryingSpec.halfZ) : 0.86;
      const mouthMinX = v.x - spanHalf - 0.65;
      const mouthMaxX = v.x + spanHalf + 0.65;
      const mouthBusy = sim.vehicles.some((o) => {
        if (o.uid === v.uid || (o.state === 'idle' && !o.returningHome)) return false;
        const oWp = o.waypoints && o.waypoints[o.wpIdx];
        const isHwyOutMover = o.z >= 7.1 && o.z <= 8.45 && (!oWp || Math.abs(oWp.x - o.x) > 0.35);
        const isWallDescending = o.heldAisle?.startsWith('hwy_bay:') && o.z > HWY_WALL_Z + 0.35 && oWp && oWp.z >= HWY_Z_OUT - 0.3;
        if (!isHwyOutMover && !isWallDescending) return false;
        const oAabb = getVehicleWorldAABB(o.x, o.z, o.yaw, o.carryingSpec);
        return oAabb.maxX > mouthMinX && oAabb.minX < mouthMaxX;
      });
      if (mouthBusy) {
        v.blockWait = (v.blockWait || 0) + dt;
        return;
      }
    }

    // Highway South-Crossing Yield (non-heldAisle only): before stepping south from HWY_Z_IN (5.45) across Eastbound HWY_Z_OUT (7.95),
    // wait cleanly at z<=5.75 if Eastbound traffic on 7.95 is within our crossing width (never stop in mid-crossover at z=6.10!)
    if (!v.heldAisle && v.z <= HWY_Z_IN + 0.30 && wp.z >= HWY_Z_OUT - 0.15 && Math.abs(wp.x - v.x) < 0.35 && wp.aisle !== 'hwy_wall') {
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
        return;
      }
    }

    // Never allow a 2nd entrant to queue across HWY_Z_OUT blocking an occupied aisle's wait buffer (AISLE_X - 1.30, 9.95)
    if (!v.bypassing && wp.aisle && wp.aisle !== 'hwy' && wp.aisle !== 'park' && wp.aisle !== 'hwy_wall' && v.z <= HWY_Z_OUT + 0.45 && Math.abs(wp.z - 9.95) < 0.2) {
      const bufferBusy = sim.vehicles.some((o) => o.uid !== v.uid && Math.abs(o.x - wp.x) < 0.9 && o.z >= 8.2 && o.z <= 10.6);
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

    const guard = computeSafeAdvance(v, nx, nz, dx / dist, dz / dist, wp);
    if (guard.blocked) {
      v.blockWait = (v.blockWait || 0) + dt;
      if (guard.reason === 'vehicle') sim.collisionsAvoided += 1;
      if (v.mesh.userData.beacon) v.mesh.userData.beacon.material.color.setHex(0xef4444);
      // If an active bypass path itself becomes blocked, abort bypass cleanly and resume primary route
      if (v.bypassing && v.blockWait > 4.0) {
        resumeFromBypass(v);
        return;
      }
      // Trigger Highway pull-out bypass ONLY for genuine mutual opposing/crossing blockades (or prolonged >12s gridlock), not normal same-direction queues
      const by = guard.by;
      const opposingOrCross = by && (by.blockWait || 0) > 2.5 && by.state !== 'dwell_pickup' && by.state !== 'dwell_drop' && Math.cos((v.yaw || 0) - (by.yaw || 0)) < 0.35;
      const longMutualGridlock = by && (by.blockWait || 0) > 8.0 && by.state !== 'dwell_pickup' && by.state !== 'dwell_drop';
      if (!v.bypassing && ((opposingOrCross && v.blockWait > 4.5) || (longMutualGridlock && v.blockWait > 12.0)) && tryStartBypass(v)) return;
      return;
    }

    v.blockWait = 0;
    v.x = nx;
    v.z = nz;
    v.yaw = getMoveYaw(v, dx, dz, wp);
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

  function updatePhaseBanner() {
    if (sim.scenario === 's1') {
      const done = sim.taskQueue.length === 0 && sim.vehicles.every((v) => v.state === 'idle');
      sim.phaseLabel = done
        ? 'S1 Complete — Full Day 0 (225 / 225)'
        : `S1: Putaway IN ← (${sim.inCount} / 225)`;
      return;
    }
    let day = 1;
    for (const b of sim.outboundBatches) {
      if (sim.outCount >= b.cumOut && day < 5) day = b.day + 1;
    }
    const allDone = sim.taskQueue.length === 0 && sim.vehicles.every((v) => v.state === 'idle');
    if (sim.scenario === 's2') {
      sim.phaseLabel = allDone
        ? 'S2 Complete — Day 5 End (53 remaining)'
        : `S2: Day ${day} Take-Out OUT → (${sim.outCount} picked)`;
    } else {
      sim.phaseLabel = allDone
        ? `S3 Complete — OUT ${sim.outCount} / IN Refill ${sim.inCount}`
        : `S3 Day ${day}: OUT → ${sim.outCount} & IN ← Refill ${sim.inCount}`;
    }
  }

  function resetScenario() {
    sim.running = false;
    sim.lastTs = 0;
    if (dom.playBtn) dom.playBtn.textContent = '▶ Play';
    sim.simTimeSec = 0;
    sim.inCount = 0;
    sim.outCount = 0;
    sim.aisleWaits = 0;
    sim.collisionsAvoided = 0;
    sim.bypassClaims.clear();
    sim.bypassCount = 0;

    buildDay0SlotModel();
    planScenarioQueues();
    spawnFleet();
    updateFleetUI();
    updateTelemetry();
  }

  function animate(ts) {
    if (!sim.active) return;
    sim.rafId = requestAnimationFrame(animate);

    const rawDt = sim.lastTs ? Math.max(0, Math.min(0.05, (ts - sim.lastTs) / 1000)) : 0.016;
    sim.lastTs = ts;

    const pulse = 1 + 0.06 * Math.sin(ts * 0.005);
    if (sim.inArrow) sim.inArrow.scale.set(pulse, 1, pulse);
    if (sim.outArrow) sim.outArrow.scale.set(pulse, 1, pulse);

    if (sim.running) {
      const dt = rawDt * sim.speed;
      const substeps = sim.speed >= 5 ? 5 : 2;
      const sdt = dt / substeps;
      for (let s = 0; s < substeps; s++) {
        sim.simTimeSec += sdt;
        for (const v of sim.vehicles) stepVehicle(v, sdt);
      }
      updatePhaseBanner();
      updateTelemetry();

      if (sim.taskQueue.length === 0 && sim.vehicles.every((v) => v.state === 'idle')) {
        sim.running = false;
        if (dom.playBtn) dom.playBtn.textContent = '▶ Replay';
      }
    }

    sim.controls.update();
    sim.renderer.render(sim.scene, sim.camera);
  }

  function resize() {
    if (!sim.initialized || !sim.active) return;
    const w = container.clientWidth || 960;
    const h = container.clientHeight || 610;
    sim.camera.aspect = w / h;
    sim.camera.updateProjectionMatrix();
    sim.renderer.setSize(w, h);
  }

  function adjustFleet(deltaJacks, deltaStackers) {
    const nextJ = sim.jacksCount + deltaJacks;
    const nextS = sim.stackersCount + deltaStackers;
    if (nextJ < 0 || nextS < 0) return;
    if (nextJ + nextS < 1 || nextJ + nextS > 10) return;
    sim.jacksCount = nextJ;
    sim.stackersCount = nextS;
    updateFleetUI();

    if (!sim.initialized) return;
    // Preserve all existing active vehicles! Only add/remove the delta vehicle!
    if (deltaJacks > 0) createSingleVehicle('jack', findFreeParkingStallIdx());
    else if (deltaJacks < 0) removeOneVehicle('jack');
    if (deltaStackers > 0) createSingleVehicle('stacker', findFreeParkingStallIdx());
    else if (deltaStackers < 0) removeOneVehicle('stacker');
  }

  if (dom.scenario) {
    dom.scenario.addEventListener('change', () => {
      sim.scenario = dom.scenario.value;
      resetScenario();
    });
  }
  dom.jackDec?.addEventListener('click', () => adjustFleet(-1, 0));
  dom.jackInc?.addEventListener('click', () => adjustFleet(1, 0));
  dom.stackDec?.addEventListener('click', () => adjustFleet(0, -1));
  dom.stackInc?.addEventListener('click', () => adjustFleet(0, 1));
  dom.speedSel?.addEventListener('change', () => { sim.speed = Number(dom.speedSel.value) || 2; });
  dom.camOverview?.addEventListener('click', () => setCameraPreset('overview'));
  dom.camShutter?.addEventListener('click', () => setCameraPreset('shutter'));
  dom.camAisles?.addEventListener('click', () => setCameraPreset('aisles'));

  dom.playBtn?.addEventListener('click', () => {
    if (!sim.initialized) return;
    if (sim.taskQueue.length === 0 && sim.vehicles.every((v) => v.state === 'idle')) {
      resetScenario();
    }
    sim.running = !sim.running;
    dom.playBtn.textContent = sim.running ? '⏸ Pause' : '▶ Play';
  });

  dom.resetBtn?.addEventListener('click', () => resetScenario());

  return {
    async activate() {
      sim.active = true;
      await initThreeScene();
      resize();
      sim.lastTs = 0;
      if (!sim.rafId) sim.rafId = requestAnimationFrame(animate);
    },
    deactivate() {
      sim.active = false;
      if (sim.rafId) {
        cancelAnimationFrame(sim.rafId);
        sim.rafId = null;
      }
    },
    setTheme(theme) {
      applySceneTheme(theme);
    },
    onDataUpdated() {
      if (sim.initialized && sim.simTimeSec === 0) {
        buildStaticRacksFromData();
        resetScenario();
      }
    },
    resize,
  };
}
