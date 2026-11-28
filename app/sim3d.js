// CAD-Accurate 3D Warehouse Simulation Engine (Level 2 Area 3 — v9 Option 1)
// Dynamically imported when the "3D Simulation" tab is activated.
import * as geom from './sim-geometry.js';
export * from './sim-geometry.js';
import { setMeshThree, makeLabelTexture, buildCargoMesh, buildEquipmentMesh, buildDollyCradleMesh, buildFloorMarkingsAndShutter, buildStaticRacksFromData } from './sim-meshes.js';
import { createTrafficEngine } from './sim-traffic.js';
import { createSkateManager } from './sim-skate.js';

const { WH_WIDTH, WH_DEPTH, HWY_Z_IN, HWY_Z_OUT, PARK_Z, AISLE_X, PARKING_STALLS, COLUMNS_POS, normalizeSkusMap, tierNum, getBayPose, tierElevation, buildObstacleBoxes, usesLongDolly, isWideCrosswise, hwyWideZ, getCargoCarrySpec, getVehicleWorldAABB, buildCorridorPath, slotWorldPos } = geom;

let THREE = null;
let OrbitControls = null;

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
    setMeshThree(THREE);
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

    buildFloorMarkingsAndShutter(scene, sim);

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

    sim.skateManager = createSkateManager({ THREE, sim, makeLabelTexture });
    sim.skateManager.initBox(scene);
    buildStaticRacksFromData(sim, getData);
    resetScenario();
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
      taskHistory: [],
      activeTaskStartSec: null,
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
    sim.skateManager?.resetSkates();
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
      v.activeTaskStartSec = null;
    }
    if (v.heldAisle && sim.aisleOccupant.get(v.heldAisle) === v.id) {
      sim.aisleOccupant.delete(v.heldAisle);
    }
    if (v.bypassClaimKey) sim.bypassClaims.delete(v.bypassClaimKey);
    sim.skateManager?.returnSkates(v.uid);
    sim.fleetGroup.remove(v.mesh);
    sim.vehicles.splice(idx, 1);
  }

  function attachCargoToVehicle(v, tag, sku, slot, useWide, carryMode = null) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    const spec = getCargoCarrySpec(tag, sku, slot.currentWt || v.task?.wt, v.type, carryMode);
    const carryPose = { axis: spec.carryAxis, len: slot.pose.len, dep: slot.pose.dep, kind: slot.pose.kind };
    const mesh = buildCargoMesh(tag, sku, carryPose, useWide, slot.isCant, 1);
    mesh.scale.setScalar(0.84);
    const defaultMountZ = v.type === 'stacker' ? 0.80 : 0.68;
    const localZ = spec.offsetZ - defaultMountZ;
    mesh.position.z = localZ;
    if (spec.carryMode === 'dolly') {
      mesh.position.y = 0.05;
      const dolly = buildDollyCradleMesh((spec.L_mm / 1000) * 0.84, (spec.W_mm / 1000) * 0.84);
      dolly.position.z = localZ;
      mount.add(dolly);
      sim.skateManager?.checkoutSkates(v.uid);
    } else {
      sim.skateManager?.returnSkates(v.uid);
    }
    mount.add(mesh);
    v.carryingMesh = mesh;
    v.carryingSpec = spec;
  }

  function clearVehicleCargo(v) {
    const mount = v.mesh.userData.cargoMount;
    while (mount.children.length > 0) mount.remove(mount.children[0]);
    v.carryingMesh = null;
    v.carryingSpec = null;
    sim.skateManager?.returnSkates(v.uid);
  }

  const { assignTaskToVehicle, getEffectiveSpeed, computeSafeAdvance, tryStartBypass, resumeFromBypass, beginDwellPhase, updateDwellAnimation, stepVehicle } = createTrafficEngine({ sim, setSlotCargo, attachCargoToVehicle, clearVehicleCargo, updatePhaseBanner });

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
