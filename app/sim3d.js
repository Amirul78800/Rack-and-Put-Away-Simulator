// CAD-Accurate 3D Warehouse Simulation Engine (Level 2 Area 3)
// Dynamically imported when the "3D Simulation" tab is activated.

let THREE = null;
let OrbitControls = null;

// CAD Warehouse Geometry Constants (1 unit = 1 meter)
// Origin (0, 0): North-West corner of Level 2 Area 3
// +x = East (toward Shutter Door), +z = South (Row 1 -> 12 depth), +y = Up
const WH_WIDTH = 53.5;
const WH_DEPTH = 46.0;
const HWY_Z_IN = 5.6;     // Westbound inbound lane from Shutter Door
const HWY_Z_OUT = 7.8;    // Eastbound outbound lane toward Shutter Door
const SHUTTER_X = 52.6;
const ROW_TOP_Z = 11.2;

// X positions for Rows 1-12 & working Aisles 1-6 (matches uploaded CAD drawing)
const AISLE_X = {
  aisle1: 4.3,
  aisle2: 12.1,
  aisle3: 18.8,
  aisle4: 25.5,
  aisle5: 32.2,
  aisle6: 39.4,
};

// Bay coordinate calculator from rack_master.json location record
function getBayPose(loc) {
  const row = loc.row_line;
  const bay = Number(loc.bay) || 1;

  // Zone 3 North Highway Wall (Left -> Right: Row 1 corner -> HWY-FLOOR-01 -> HWY-FLOOR-02 -> CANT-R01..R03)
  if (row === 'Highway Floor') {
    if (bay === 1) {
      return {
        key: 'HWY-FLOOR-01',
        x: 14.8,
        z: 2.1,
        len: 5.8,
        dep: 2.1,
        axis: 'x',
        aisleKey: 'hwy',
        aisleX: 14.8,
        aisleZ: 4.5,
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
      aisleX: 24.4,
      aisleZ: 4.5,
      faceX: 0,
      faceZ: -1,
      kind: 'floor',
    };
  }

  if (row === 'Line 1 (Cant)') {
    const cx = 33.6 + (bay - 1) * 6.5;
    return {
      key: `CANT-R0${bay}`,
      x: cx,
      z: 1.8,
      len: 6.1,
      dep: 1.2,
      axis: 'x',
      aisleKey: 'hwy',
      aisleX: cx,
      aisleZ: 4.5,
      faceX: 0,
      faceZ: -1,
      kind: 'cant',
    };
  }

  // Row 1: Vertical 1..12 along West wall + Top-Left Corner horizontal 13..14
  if (row === 'Row 1') {
    if (bay >= 13) {
      const idx = bay - 13; // 0 or 1
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
        aisleZ: 4.5,
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

  // Row 2: Blue 2.7x1.2, 7 bays with structural North Split (1-3) + pillar gap + South Split (4-7)
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

  // Row 3: Blue 2.7x1.2, 9 bays continuous + pillar gap + South Split Bay 10
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

  // Row 4 & 5: Back-to-back Blue 2.7x1.2 (11 bays each)
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

  // Row 6: Blue 2.7x1.2, North Split (1-3) + pillar gap + South Split (4-10)
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

  // Row 7, 8, 9: Magenta 3.3x1.2 (9 bays each, 9*3.3 = 29.7m matches 11*2.7m!)
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

  // Row 10: Magenta 3.3x1.2, North Split (1-3) + pillar gap + South Split (4-8)
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

  // Row 11 & 12: Yellow Floor 4.0x1.5 (7 bays each = 28.0m)
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

function tierElevation(loc) {
  if (loc.zone === 'Zone 3' && loc.row_line === 'Line 1 (Cant)') {
    if (loc.tier === 'L3') return 2.48;
    if (loc.tier === 'L2') return 1.35;
    return 0.16;
  }
  if (loc.rack_type.includes('Floor')) return 0.04;
  return loc.tier === 'L2' ? 1.92 : 0.06;
}

function slotWorldPos(pose, loc, slotIndex, slotMode) {
  const y = tierElevation(loc);
  const offsetSign = slotIndex === 0 ? -1 : 1;
  const isSingle = slotMode !== '2x1' && slotMode !== 'CANT' && slotMode !== '1+SP';
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

function buildCargoMesh(tag, sku, pose, isWide, isCant) {
  const group = new THREE.Group();
  const method = sku?.method || 'Pallet';
  const rawL = Math.max(0.8, Math.min((sku?.L_mm || 1100) / 1000, isWide ? pose.len * 0.88 : pose.len * 0.44));
  const rawW = Math.max(0.7, Math.min((sku?.W_mm || 1000) / 1000, pose.dep * 0.85));
  const rawH = Math.max(0.65, Math.min((sku?.H_mm || 1150) / 1000, 1.55));

  const alongZ = pose.axis === 'z';
  const sx = alongZ ? rawW : rawL;
  const sz = alongZ ? rawL : rawW;

  if (isCant) {
    // Strapped Unistrut / Conduit metallic bundle on green cantilever
    const bundleLen = Math.max(2.2, Math.min((sku?.L_mm || 3000) / 1000, 2.75));
    const bx = alongZ ? 0.65 : bundleLen;
    const bz = alongZ ? bundleLen : 0.65;
    const metal = new THREE.Mesh(
      new THREE.BoxGeometry(bx, 0.36, bz),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.55, roughness: 0.38 })
    );
    metal.position.y = 0.22;
    group.add(metal);
    // Steel straps
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    for (const f of [-0.32, 0, 0.32]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(alongZ ? 0.68 : 0.06, 0.39, alongZ ? 0.06 : 0.68),
        strapMat
      );
      strap.position.set(alongZ ? 0 : f * bundleLen, 0.22, alongZ ? f * bundleLen : 0);
      group.add(strap);
    }
    return group;
  }

  if (method === 'Crating') {
    // Timber dunnage skids + slatted wooden crate for long/busway/busplug items
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.78 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
    const skids = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.96, 0.1, sz * 0.96), frameMat);
    skids.position.y = 0.05;
    group.add(skids);

    const body = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.94, rawH * 0.82, sz * 0.94), woodMat);
    body.position.y = 0.1 + (rawH * 0.82) / 2;
    group.add(body);

    // Horizontal & vertical reinforcing timber battens
    const topBand = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, 0.08, sz * 0.98), frameMat);
    topBand.position.y = 0.1 + rawH * 0.82 - 0.04;
    group.add(topBand);
    const midBand = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, 0.07, sz * 0.98), frameMat);
    midBand.position.y = 0.1 + rawH * 0.42;
    group.add(midBand);
    return group;
  }

  // Standard Method = Pallet (wooden pallet deck + stacked corrugated boxes + SKU color strap/label)
  const palletMat = new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.85 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), palletMat);
  deck.position.y = 0.06;
  group.add(deck);

  const boxColor = skuPaletteColor(tag);
  const cartonMat = new THREE.MeshStandardMaterial({ color: 0xd6b084, roughness: 0.72 });
  const accentMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.5 });

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
  // Colored shrink/strapping collar for instant visual SKU cue
  const strap = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.94, 0.09, sz * 0.94), accentMat);
  strap.position.y = 0.13 + boxH * 1.15;
  group.add(strap);

  return group;
}

function buildEquipmentMesh(type) {
  const root = new THREE.Group();
  const isStacker = type === 'stacker';
  const bodyColor = isStacker ? 0xf97316 : 0xeab308;
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.45 });
  const paintMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.15 });
  const forkMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 });

  // Vehicle local frame: +Z points forward (toward forks / direction of travel when putaway)
  if (isStacker) {
    // Counterbalanced/straddle pallet stacker chassis + overhead guard + 2.8m mast + movable carriage
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 1.35), paintMat);
    chassis.position.set(0, 0.42, -0.45);
    root.add(chassis);

    // Overhead operator guard posts + roof
    const postGeo = new THREE.BoxGeometry(0.06, 1.35, 0.06);
    for (const px of [-0.4, 0.4]) {
      for (const pz of [-1.05, -0.05]) {
        const p = new THREE.Mesh(postGeo, darkMetal);
        p.position.set(px, 1.4, pz);
        root.add(p);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.06, 1.08), darkMetal);
    roof.position.set(0, 2.08, -0.55);
    root.add(roof);

    // Tall twin-stage mast at z = +0.26
    const mastGeo = new THREE.BoxGeometry(0.08, 2.85, 0.1);
    const mastL = new THREE.Mesh(mastGeo, darkMetal);
    mastL.position.set(-0.34, 1.45, 0.26);
    const mastR = new THREE.Mesh(mastGeo, darkMetal);
    mastR.position.set(0.34, 1.45, 0.26);
    root.add(mastL, mastR);

    // Lifting fork carriage (moves vertically along mast)
    const carriage = new THREE.Group();
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.55, 0.06), darkMetal);
    backrest.position.set(0, 0.32, 0.34);
    carriage.add(backrest);

    const forkGeo = new THREE.BoxGeometry(0.11, 0.05, 1.12);
    const fL = new THREE.Mesh(forkGeo, forkMat);
    fL.position.set(-0.21, 0.05, 0.9);
    const fR = new THREE.Mesh(forkGeo, forkMat);
    fR.position.set(0.21, 0.05, 0.9);
    carriage.add(fL, fR);

    const cargoMount = new THREE.Group();
    cargoMount.position.set(0, 0.08, 0.92);
    carriage.add(cargoMount);
    root.add(carriage);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    beacon.position.set(0, 2.18, -0.55);
    root.add(beacon);

    root.userData.carriage = carriage;
    root.userData.cargoMount = cargoMount;
    root.userData.beacon = beacon;
  } else {
    // Walkie Electric Pallet Jack (low profile ground-only forks)
    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.62, 0.68), paintMat);
    drive.position.set(0, 0.36, -0.25);
    root.add(drive);

    const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), darkMetal);
    tiller.position.set(0, 0.95, -0.52);
    tiller.rotation.x = -0.35;
    root.add(tiller);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.08), darkMetal);
    handle.position.set(0, 1.38, -0.68);
    root.add(handle);

    const carriage = new THREE.Group();
    const forkGeo = new THREE.BoxGeometry(0.14, 0.06, 1.15);
    const fL = new THREE.Mesh(forkGeo, forkMat);
    fL.position.set(-0.2, 0.06, 0.65);
    const fR = new THREE.Mesh(forkGeo, forkMat);
    fR.position.set(0.2, 0.06, 0.65);
    carriage.add(fL, fR);

    const cargoMount = new THREE.Group();
    cargoMount.position.set(0, 0.09, 0.68);
    carriage.add(cargoMount);
    root.add(carriage);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    beacon.position.set(0, 0.72, -0.25);
    root.add(beacon);

    root.userData.carriage = carriage;
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
    scenario: 's1', // s1 | s2 | s3
    jacksCount: 2,
    stackersCount: 2,
    speed: 2,
    running: false,

    // Clock & stats
    simTimeSec: 0,
    inCount: 0,
    outCount: 0,
    aisleWaits: 0,
    phaseLabel: 'Ready — S1 Putaway',
    dayStage: 0,
    nextOutThreshold: 0,

    // Scene objects
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    floorMesh: null,
    inArrow: null,
    outArrow: null,
    highlightRing: null,

    // Indexed geometry & simulation entities
    bayPoses: new Map(),     // loc_id -> pose
    bayPickables: [],        // meshes with userData.locId
    slots: [],               // simulation slot objects
    slotsByLoc: new Map(),   // loc_id -> [slot]
    taskQueue: [],           // pending tasks { kind: 'put'|'pick', slot, sku, tierElev, needsStacker, ... }
    outboundBatches: [],     // S2 / S3 ordered daily batches
    refillTriggerCount: 0,
    vehicles: [],
    aisleOccupant: new Map(), // aisleKey -> vehicle.id
    cargoGroup: null,
    fleetGroup: null,
  };

  // DOM refs
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

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(38, 52, 28);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
    fill.position.set(-20, 22, -15);
    scene.add(fill);

    // Warehouse Concrete Slab
    const floorMat = new THREE.MeshStandardMaterial({
      color: isLight ? 0xcfd9e8 : 0x111a2b,
      roughness: 0.9,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WH_WIDTH + 4, WH_DEPTH + 4), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WH_WIDTH / 2 - 1, 0, WH_DEPTH / 2 - 1);
    scene.add(floor);
    sim.floorMesh = floor;

    // CAD Exterior Perimeter Wall Lines (North, West, East Shutter gap, South)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(51.2, 1.4, 0.25), wallMat);
    northWall.position.set(25.2, 0.7, 0.1);
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 44.0), wallMat);
    westWall.position.set(0.1, 0.7, 22.0);
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(51.2, 1.4, 0.25), wallMat);
    southWall.position.set(25.2, 0.7, 44.0);
    // East office wing & perimeter
    const officeBorder = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 31.8), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));
    officeBorder.position.set(47.2, 0.25, 27.5);
    scene.add(northWall, westWall, southWall, officeBorder);

    // Floor markings: Highway band, Aisles 1-6, Labels, Shutter Door + IN/OUT Arrows
    buildFloorMarkingsAndShutter(scene);

    // Structural concrete columns along CAD pillar grid lines
    const colGeo = new THREE.BoxGeometry(0.55, 4.2, 0.55);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
    for (const cx of [6.9, 9.3, 15.35, 22.05, 28.75, 35.4, 43.2]) {
      for (const cz of [0.5, 10.6, 20.6, 30.8, 40.9]) {
        const pillar = new THREE.Mesh(colGeo, colMat);
        pillar.position.set(cx, 2.1, cz);
        scene.add(pillar);
      }
    }

    // Selection highlight ring
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

    // Click raycasting on bays -> inspect in right panel
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
    // Highway Yellow Center Divider + Zone Labels
    const laneMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.28 });
    const hwyStrip = new THREE.Mesh(new THREE.PlaneGeometry(49.5, 4.4), laneMat);
    hwyStrip.rotation.x = -Math.PI / 2;
    hwyStrip.position.set(27.5, 0.008, 6.7);
    scene.add(hwyStrip);

    // Dashed centerline dividing IN lane (z=5.6) & OUT lane (z=7.8)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 });
    for (let x = 5.0; x < 50.5; x += 2.2) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.012, 6.7);
      scene.add(dash);
    }

    // Highway Floor Sign
    const hwyLbl = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 1.5),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('HIGHWAY CORRIDOR', 'rgba(15,23,42,0.72)', '#93c5fd', 320, 72), transparent: true })
    );
    hwyLbl.rotation.x = -Math.PI / 2;
    hwyLbl.position.set(22.5, 0.015, 6.7);
    scene.add(hwyLbl);

    // Aisles 1..6 floor runners & signs
    const aisleHighlight = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.14 });
    Object.entries(AISLE_X).forEach(([k, ax], idx) => {
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 31.0), aisleHighlight);
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(ax, 0.006, 26.0);
      scene.add(runner);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 0.75),
        new THREE.MeshBasicMaterial({ map: makeLabelTexture(`AISLE ${idx + 1}`, 'rgba(15,23,42,0.72)', '#e2e8f0', 192, 56), transparent: true })
      );
      sign.rotation.x = -Math.PI / 2;
      sign.position.set(ax, 0.015, 9.6);
      scene.add(sign);
    });

    // East Shutter Door Frame (x ~ 50.8, z = 4.3..9.3)
    const shutterFrameMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.4, roughness: 0.45 });
    const postN = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), shutterFrameMat);
    postN.position.set(50.8, 1.8, 4.1);
    const postS = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), shutterFrameMat);
    postS.position.set(50.8, 1.8, 9.3);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 5.6), shutterFrameMat);
    lintel.position.set(50.8, 3.65, 6.7);
    scene.add(postN, postS, lintel);

    // Vertical Shutter Door Label
    const shutterSign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.9),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('SHUTTER DOOR  IN ← / OUT →', '#0f172a', '#f8fafc', 360, 72), transparent: true })
    );
    shutterSign.position.set(50.8, 4.35, 6.7);
    shutterSign.rotation.y = -Math.PI / 2;
    scene.add(shutterSign);

    // Big Directional Floor + Floating Arrows (like CAD drawing!)
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

    // Group locations by physical bay (`row_line::bay`)
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
        // Painted yellow floor bay footprint + clickable hitbox
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
        // Green 6.1m Cantilever: 3 heavy spine columns along back wall + 3 tiers of horizontal arms
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
        // Transparent pick hit-volumes per L1/L2/L3 tier
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

      // Selective Steel Pallet Rack (Blue 2.7m or Magenta 3.3m): 4 corner uprights + cross braces + L2 load beams
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

      // Side depth tie-bars
      if (alongZ) {
        for (const sz of [-hz, hz]) {
          for (const ty of [0.85, 2.55]) {
            const tie = new THREE.Mesh(new THREE.BoxGeometry(wX - 0.1, 0.04, 0.04), braceMat);
            tie.position.set(pose.x, ty, pose.z + sz);
            rackGroup.add(tie);
          }
        }
        // Horizontal L2 safety-orange load beams (front & rear)
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

      // Clickable invisible volumes per L1 & L2
      for (const l of locs) {
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(wX * 0.92, 1.25, wZ * 0.92),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hit.position.set(pose.x, l.tier === 'L2' ? 2.45 : 0.75, pose.z);
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

    // Clear old cargo meshes
    while (sim.cargoGroup.children.length > 0) {
      sim.cargoGroup.remove(sim.cargoGroup.children[0]);
    }
    sim.slots = [];
    sim.slotsByLoc.clear();

    const skus = data.skus || {};
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

      // Represent every Day 0 unit as a slot item, plus track empty slots for S3 refill
      const capacity = isWide ? 1 : 2;
      for (let idx = 0; idx < capacity; idx++) {
        const spec = slotSpecs.find((s) => s.idx === idx) || null;
        const pos = slotWorldPos(pose, loc, idx, isWide ? 'SPAN' : (loc.slot_mode === 'CANT' ? 'CANT' : '2x1'));
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
    const t = slot.loc.tier;
    if (t === 'L2' || t === 'L3') return true;
    if (slot.isCant) return true;
    if ((wt || 0) > 1400) return true;
    return false;
  }

  function setSlotCargo(slot, tag, wt, occupied) {
    if (slot.mesh) {
      sim.cargoGroup.remove(slot.mesh);
      slot.mesh = null;
    }
    slot.occupied = Boolean(occupied);
    slot.currentTag = occupied ? tag : null;
    slot.currentWt = occupied ? (wt || 0) : 0;

    if (occupied && tag) {
      const skus = getData()?.skus || {};
      const sku = skus[tag];
      const mesh = buildCargoMesh(tag, sku, slot.pose, slot.isWide, slot.isCant);
      mesh.position.set(slot.pos.x, slot.pos.y, slot.pos.z);
      mesh.userData.locId = slot.locId;
      sim.cargoGroup.add(mesh);
      slot.mesh = mesh;
    }
  }

  function planScenarioQueues() {
    const data = getData();
    const skus = data?.skus || {};
    sim.taskQueue = [];
    sim.outboundBatches = [];
    sim.aisleOccupant.clear();

    const day0Slots = sim.slots.filter((s) => s.day0Tag);

    if (sim.scenario === 's1') {
      // Start completely empty; put away all 225 Day 0 units via Shutter Door IN <-
      for (const s of sim.slots) setSlotCargo(s, null, 0, false);

      // Interleave aisles & ground/L2 tasks cleanly so Jacks and Stackers immediately stay active
      const sorted = [...day0Slots].sort((a, b) => {
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
          requiresStacker: needsStacker(slot, slot.day0Wt),
        });
      }
      sim.phaseLabel = 'S1: Filling Day 0 Inbound (0 → 225)';
      return;
    }

    // Both S2 and S3 start full with Day 0 (225 units) on the racks
    for (const s of sim.slots) {
      if (s.day0Tag) setSlotCargo(s, s.day0Tag, s.day0Wt, true);
      else setSlotCargo(s, null, 0, false);
    }

    // Build Day 1 -> Day 5 burn-down pick schedule in Highway-end (lowest bay) priority!
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
            requiresStacker: needsStacker(slot, slot.currentWt),
          });
        }
      }
      // Sort picks inside day: Highway/Floor/Rack 01 priority
      dayPicks.sort((a, b) => (a.slot.loc.bay || 99) - (b.slot.loc.bay || 99));
      cumOut += dayPicks.length;
      sim.outboundBatches.push({ day, count: dayPicks.length, cumOut });

      // In S3, prepare simultaneous Inbound Replenishment arrivals for high-burn / depleted SKUs
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
          const isLong = (rSku.L_mm || 0) > 1200;
          // Find a valid spare slot matching SPAN / Cantilever / Floor / Selective rules
          const spare = sim.slots.find((cand) => {
            if (cand.occupied || cand.reservedInbound) return false;
            const l = cand.loc;
            if (l.zone === 'Zone 3' && l.row_line === 'Line 1 (Cant)') return rTag === 'U12' || rTag === 'U13' || rTag === 'U47';
            if (isLong) return l.rack_type.includes('Floor') || l.slot_mode === 'SPAN' || l.row_line.includes('Row 7') || l.row_line.includes('Row 8') || l.row_line.includes('Row 9') || l.row_line.includes('Row 10');
            if ((rSku.unit_wt_kg || 0) > 1500) return l.tier === 'L1';
            return !l.rack_type.includes('Cantilever');
          });
          if (spare) {
            spare.reservedInbound = true;
            dayRefills.push({
              kind: 'put',
              day,
              slot: spare,
              tag: rTag,
              wt: rSku.unit_wt_kg || 500,
              sku: rSku,
              requiresStacker: needsStacker(spare, rSku.unit_wt_kg || 500),
            });
          }
        }
      }

      // Interleave OUT picks and IN refills so S3 immediately shows concurrent traffic!
      let rIdx = 0;
      for (let i = 0; i < dayPicks.length; i++) {
        sim.taskQueue.push(dayPicks[i]);
        if (sim.scenario === 's3' && i % 3 === 1 && rIdx < dayRefills.length) {
          sim.taskQueue.push(dayRefills[rIdx++]);
        }
      }
      while (rIdx < dayRefills.length) sim.taskQueue.push(dayRefills[rIdx++]);
    }

    sim.phaseLabel = sim.scenario === 's2'
      ? 'S2: Day 1–5 Kitting Take-Out (OUT →)'
      : 'S3: Mixed Take-Out (OUT →) & Refill (IN ←)';
  }

  function spawnFleet() {
    while (sim.fleetGroup.children.length > 0) {
      sim.fleetGroup.remove(sim.fleetGroup.children[0]);
    }
    sim.vehicles = [];
    sim.aisleOccupant.clear();

    const specs = [];
    for (let i = 0; i < sim.jacksCount; i++) specs.push('jack');
    for (let i = 0; i < sim.stackersCount; i++) specs.push('stacker');

    const total = Math.min(10, specs.length);
    for (let i = 0; i < total; i++) {
      const type = specs[i];
      const mesh = buildEquipmentMesh(type);
      // Park idle vehicles cleanly along Highway North-West staging lane (like the two icons on CAD!)
      const homeX = 11.0 + (i % 5) * 2.4;
      const homeZ = i < 5 ? 5.2 : 8.3;
      mesh.position.set(homeX, 0, homeZ);
      sim.fleetGroup.add(mesh);

      sim.vehicles.push({
        id: `${type}-${i + 1}`,
        type, // 'jack' | 'stacker'
        mesh,
        x: homeX,
        z: homeZ,
        homeX,
        homeZ,
        yaw: 0,
        speed: type === 'jack' ? 4.4 : 3.9,
        state: 'idle', // idle | to_pickup | dwell_pickup | to_drop | dwell_drop | waiting
        task: null,
        waypoints: [],
        wpIdx: 0,
        dwellTimer: 0,
        forkY: 0,
        targetForkY: 0,
        carryingMesh: null,
        heldAisle: null,
        waitAccum: 0,
      });
    }
  }

  function buildPathPoints(fromX, fromZ, toX, toZ, fromAisle, toAisle, laneZ) {
    const pts = [];
    // If currently inside a vertical aisle, exit to Highway lane first
    if (fromAisle && fromAisle !== 'hwy' && fromZ > 9.5) {
      pts.push({ x: AISLE_X[fromAisle] || fromX, z: laneZ, aisle: fromAisle });
    }
    // Travel horizontally along Highway lane to target aisle mouth
    const targetEntranceX = (toAisle && toAisle !== 'hwy') ? AISLE_X[toAisle] : toX;
    if (Math.hypot(targetEntranceX - (pts.length ? pts[pts.length - 1].x : fromX), laneZ - (pts.length ? pts[pts.length - 1].z : fromZ)) > 0.35) {
      pts.push({ x: targetEntranceX, z: laneZ, aisle: 'hwy' });
    }
    // Travel straight down target aisle (or up to North wall Highway bay)
    pts.push({ x: toX, z: toZ, aisle: toAisle || 'hwy' });
    return pts;
  }

  function assignTaskToVehicle(v, task) {
    v.task = task;
    if (task.kind === 'put') {
      // Step 1: Go to Shutter Door IN <- staging point to pick up inbound load
      v.state = 'to_pickup';
      v.waypoints = buildPathPoints(v.x, v.z, SHUTTER_X - 1.8, HWY_Z_IN, null, 'hwy', HWY_Z_IN);
      v.wpIdx = 0;
    } else {
      // Pick outbound unit: Drive to occupied bay in aisle
      v.state = 'to_pickup';
      const p = task.slot.pose;
      v.waypoints = buildPathPoints(v.x, v.z, p.aisleX, p.aisleZ, null, p.aisleKey, HWY_Z_IN);
      v.wpIdx = 0;
    }
  }

  function attachCargoToVehicle(v, tag, sku, slot) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    const mesh = buildCargoMesh(tag, sku, { axis: 'z', len: slot.pose.len, dep: slot.pose.dep }, slot.isWide, slot.isCant);
    mesh.scale.setScalar(0.86);
    mount.add(mesh);
    v.carryingMesh = mesh;
  }

  function clearVehicleCargo(v) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    v.carryingMesh = null;
  }

  function stepVehicle(v, dt) {
    // Animate fork lift smoothly (Stackers raise forks to L2/L3; Jacks stay low)
    if (v.type === 'stacker' && v.mesh.userData.carriage) {
      v.forkY += (v.targetForkY - v.forkY) * Math.min(1, dt * 5.5);
      v.mesh.userData.carriage.position.y = v.forkY;
    }

    // Assign next eligible task if idle
    if (v.state === 'idle') {
      if (sim.taskQueue.length > 0) {
        const idx = sim.taskQueue.findIndex((t) => {
          if (t.requiresStacker && v.type !== 'stacker') return false;
          // In S3, avoid picking a slot currently targeted or refill before slot is free
          return true;
        });
        if (idx !== -1) {
          const [task] = sim.taskQueue.splice(idx, 1);
          assignTaskToVehicle(v, task);
          return;
        }
      }
      // Return gently toward staging spot if far away
      const distHome = Math.hypot(v.homeX - v.x, v.homeZ - v.z);
      if (distHome > 0.35) {
        const dx = v.homeX - v.x;
        const dz = v.homeZ - v.z;
        const step = Math.min(distHome, v.speed * 0.8 * dt);
        v.x += (dx / distHome) * step;
        v.z += (dz / distHome) * step;
        v.yaw = Math.atan2(dx, dz);
        v.mesh.position.set(v.x, 0, v.z);
        v.mesh.rotation.y = v.yaw;
      }
      return;
    }

    // Dwelling at pickup / dropoff (fork lift animation)
    if (v.state === 'dwell_pickup' || v.state === 'dwell_drop') {
      v.dwellTimer -= dt;
      if (v.dwellTimer > 0) return;

      const t = v.task;
      if (v.state === 'dwell_pickup') {
        v.targetForkY = 0.08;
        if (t.kind === 'put') {
          // Picked up from Shutter IN <- -> now drive to rack bay
          attachCargoToVehicle(v, t.tag, t.sku, t.slot);
          v.state = 'to_drop';
          const p = t.slot.pose;
          v.waypoints = buildPathPoints(v.x, v.z, p.aisleX, p.aisleZ, 'hwy', p.aisleKey, HWY_Z_IN);
          v.wpIdx = 0;
        } else {
          // Picked from rack bay -> clear slot & drive to Shutter Door OUT ->
          setSlotCargo(t.slot, null, 0, false);
          attachCargoToVehicle(v, t.tag, t.sku, t.slot);
          v.state = 'to_drop';
          v.waypoints = buildPathPoints(v.x, v.z, SHUTTER_X - 0.8, HWY_Z_OUT, t.slot.pose.aisleKey, 'hwy', HWY_Z_OUT);
          v.wpIdx = 0;
        }
      } else {
        // Finished dwell_drop
        v.targetForkY = 0;
        clearVehicleCargo(v);
        if (t.kind === 'put') {
          setSlotCargo(t.slot, t.tag, t.wt, true);
          t.slot.reservedInbound = false;
          sim.inCount += 1;
        } else {
          sim.outCount += 1;
        }
        // Release aisle reservation when back/done
        if (v.heldAisle && sim.aisleOccupant.get(v.heldAisle) === v.id) {
          sim.aisleOccupant.delete(v.heldAisle);
          v.heldAisle = null;
        }
        v.task = null;
        v.state = 'idle';
      }
      return;
    }

    // Moving along waypoints
    const wp = v.waypoints[v.wpIdx];
    if (!wp) return;

    // Aisle reservation check before entering Aisle 1..6 from Highway
    const enteringAisle = wp.aisle && wp.aisle !== 'hwy' && v.z < 9.5 && v.heldAisle !== wp.aisle;
    if (enteringAisle) {
      const occ = sim.aisleOccupant.get(wp.aisle);
      if (occ && occ !== v.id) {
        // Yield politely at aisle entrance
        const wasWaiting = v.waitAccum > 0;
        v.waitAccum += dt;
        if (!wasWaiting) sim.aisleWaits += 1;
        if (v.mesh.userData.beacon) v.mesh.userData.beacon.material.color.setHex(0xef4444);
        // Safety anti-deadlock timeout after 4.5s
        if (v.waitAccum < 4.5) return;
      }
      sim.aisleOccupant.set(wp.aisle, v.id);
      v.heldAisle = wp.aisle;
      v.waitAccum = 0;
    }

    // Release aisle lock once vehicle exits back into Highway (z <= 8.5)
    if (v.heldAisle && v.z <= 8.5 && wp.aisle === 'hwy') {
      if (sim.aisleOccupant.get(v.heldAisle) === v.id) {
        sim.aisleOccupant.delete(v.heldAisle);
      }
      v.heldAisle = null;
    }

    if (v.mesh.userData.beacon) {
      v.mesh.userData.beacon.material.color.setHex(v.type === 'stacker' ? 0xfbbf24 : 0x22c55e);
    }

    const dx = wp.x - v.x;
    const dz = wp.z - v.z;
    const dist = Math.hypot(dx, dz);
    const step = v.speed * dt;

    if (dist <= step) {
      v.x = wp.x;
      v.z = wp.z;
      v.mesh.position.set(v.x, 0, v.z);
      v.wpIdx += 1;

      if (v.wpIdx >= v.waypoints.length) {
        // Reached destination!
        const t = v.task;
        const atRack = (v.state === 'to_pickup' && t.kind === 'pick') || (v.state === 'to_drop' && t.kind === 'put');
        if (atRack) {
          // Turn forks toward rack face!
          const p = t.slot.pose;
          v.yaw = Math.atan2(p.faceX, p.faceZ);
          v.mesh.rotation.y = v.yaw;
          const elev = tierElevation(t.slot.loc);
          v.targetForkY = v.type === 'stacker' ? Math.max(0.05, Math.min(elev, 2.35)) : 0.06;
          v.dwellTimer = elev > 1.0 ? 1.15 : 0.7;
        } else {
          v.targetForkY = 0.05;
          v.dwellTimer = 0.45;
        }
        v.state = v.state === 'to_pickup' ? 'dwell_pickup' : 'dwell_drop';
      }
    } else {
      v.x += (dx / dist) * step;
      v.z += (dz / dist) * step;
      v.yaw = Math.atan2(dx, dz);
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.yaw;
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
    // Check burn-down milestones
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
    if (dom.playBtn) dom.playBtn.textContent = '▶ Play';
    sim.simTimeSec = 0;
    sim.inCount = 0;
    sim.outCount = 0;
    sim.aisleWaits = 0;

    buildDay0SlotModel();
    planScenarioQueues();
    spawnFleet();
    updateFleetUI();
    updateTelemetry();
  }

  function animate(ts) {
    if (!sim.active) return;
    sim.rafId = requestAnimationFrame(animate);

    const rawDt = sim.lastTs ? Math.min(0.05, (ts - sim.lastTs) / 1000) : 0.016;
    sim.lastTs = ts;

    // Gentle pulse on Shutter Door IN/OUT arrows
    const pulse = 1 + 0.06 * Math.sin(ts * 0.005);
    if (sim.inArrow) sim.inArrow.scale.set(pulse, 1, pulse);
    if (sim.outArrow) sim.outArrow.scale.set(pulse, 1, pulse);

    if (sim.running) {
      const dt = rawDt * sim.speed;
      // Substep at high speed (5x / 10x) so waypoints never overshoot
      const substeps = sim.speed >= 5 ? 4 : 2;
      const sdt = dt / substeps;
      for (let s = 0; s < substeps; s++) {
        sim.simTimeSec += sdt;
        for (const v of sim.vehicles) stepVehicle(v, sdt);
      }
      updatePhaseBanner();
      updateTelemetry();

      // Auto-pause cleanly on scenario completion
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
    let j = sim.jacksCount + deltaJacks;
    let s = sim.stackersCount + deltaStackers;
    if (j < 0 || s < 0) return;
    if (j + s < 1 || j + s > 10) return;
    sim.jacksCount = j;
    sim.stackersCount = s;
    updateFleetUI();
    if (sim.initialized) {
      // Respawn fleet cleanly on count change (preserve slot progress or clean restart if idle)
      if (!sim.running && sim.simTimeSec === 0) {
        spawnFleet();
      } else {
        // Preserve occupied inventory while reconfiguring fleet mid-run
        for (let i = sim.vehicles.length - 1; i >= 0; i--) {
          const v = sim.vehicles[i];
          if (v.task) {
            if (v.task.kind === 'pick' && (v.state === 'to_drop' || v.state === 'dwell_drop')) {
              setSlotCargo(v.task.slot, v.task.tag, v.task.wt, true);
            }
            sim.taskQueue.unshift(v.task);
          }
          if (v.heldAisle) sim.aisleOccupant.delete(v.heldAisle);
        }
        spawnFleet();
      }
    }
  }

  // Bind UI controls once
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
