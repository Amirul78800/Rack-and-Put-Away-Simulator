// Three.js Procedural Textures, Warehouse Racks, Equipment & Dolly Meshes
import { WH_WIDTH, WH_DEPTH, HWY_Z_IN, HWY_Z_OUT, AISLE_X, PARKING_STALLS, COLUMNS_POS, tierNum, getBayPose, tierElevation, buildObstacleBoxes } from './sim-geometry.js';
import { buildDualSkateCradle } from './sim-skate.js';

let THREE = null;
export function setMeshThree(t) { THREE = t; }

export function makeLabelTexture(text, bg, fg, w = 256, h = 64, font = 'bold 28px Inter, system-ui, sans-serif') {
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

export function makeMastMeshTexture() {
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

export function makeFloorStripeTexture() {
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

export function skuPaletteColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  const palette = [0x2563eb, 0x0ea5e9, 0x10b981, 0x8b5cf6, 0x06b6d4, 0x3b82f6, 0x6366f1];
  return palette[hash % palette.length];
}

// Accurate cargo meshes preserving true L_mm for long Unistrut, Whip Pipe, Basket Tray, Busway Crates, and Standard Pallets
export function buildCargoMesh(tag, sku, pose, isWide, isCant, tier = 1) {
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

export function buildEquipmentMesh(type) {
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

export function buildDollyCradleMesh(L_m, W_m) {
    return buildDualSkateCradle(THREE, L_m, W_m);
  }

export function buildFloorMarkingsAndShutter(scene, sim) {
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

export function buildStaticRacksFromData(sim, getData) {
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
