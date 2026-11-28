// Motorized RC Heavy-Duty Machinery Skates (PM40T-style 2-skate system + Respawn Box)
// Used for >4.5m long items (5.8m-7.5m pipes & 6.1m Cantilever Unistrut highway transit).

export const SKATE_RESPAWN_BOX = { x: 51.8, z: 2.6 };

export function buildMotorizedSkateUnit(THREE) {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.45, roughness: 0.4 });
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.5, roughness: 0.45 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });
  const chockMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

  // Red motorized drive deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.46), deckMat);
  deck.position.set(0, -0.01, 0);
  g.add(deck);

  // Dark slate battery / RC control pack at outer edge (+z)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.22), packMat);
  pack.position.set(0, -0.005, 0.34);
  g.add(pack);

  // Circular black turntable bearing pad + blue saddle chocks
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.04, 16), padMat);
  turntable.position.set(0, 0.045, 0);
  g.add(turntable);

  const chockGeo = new THREE.BoxGeometry(0.08, 0.04, 0.22);
  for (const cx of [-0.17, 0.17]) {
    const chock = new THREE.Mesh(chockGeo, chockMat);
    chock.position.set(cx, 0.065, 0);
    g.add(chock);
  }

  // Side drive rollers (red)
  const rollerGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10);
  for (const rx of [-0.32, 0.32]) {
    for (const rz of [-0.12, 0.12]) {
      const r = new THREE.Mesh(rollerGeo, rollerMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(rx, -0.02, rz);
      g.add(r);
    }
  }

  // Caster wheels underneath
  const wheelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10);
  for (const wx of [-0.24, 0.24]) {
    for (const wz of [-0.16, 0.38]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, -0.06, wz);
      g.add(w);
    }
  }

  return g;
}

export function buildDualSkateCradle(THREE, L_m, W_m) {
  const g = new THREE.Group();
  const halfSpan = Math.min(Math.max(L_m * 0.34, 1.35), 2.35);
  const scaleX = Math.min(Math.max((W_m || 0.84) / 0.84, 0.85), 1.25);

  const frontSkate = buildMotorizedSkateUnit(THREE);
  frontSkate.position.set(0, 0, halfSpan);
  frontSkate.scale.x = scaleX;
  g.add(frontSkate);

  const rearSkate = buildMotorizedSkateUnit(THREE);
  rearSkate.position.set(0, 0, -halfSpan);
  rearSkate.rotation.y = Math.PI;
  rearSkate.scale.x = scaleX;
  g.add(rearSkate);

  return g;
}

export function createSkateManager({ THREE, sim, makeLabelTexture }) {
  const activePairs = new Set();
  const parkedPairMeshes = [];
  const maxPairs = 2;

  function initBox(scene) {
    const { x, z } = SKATE_RESPAWN_BOX;
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.22 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.01, z);
    scene.add(pad);

    const lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.55),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('SKATE BOX', 'rgba(15,23,42,0.85)', '#fca5a5', 192, 56), transparent: true })
    );
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(x, 0.016, z - 0.85);
    scene.add(lbl);

    parkedPairMeshes.length = 0;
    for (let i = 0; i < maxPairs; i++) {
      const pair = new THREE.Group();
      const s1 = buildMotorizedSkateUnit(THREE);
      s1.position.set(0, 0.10, -0.36);
      const s2 = buildMotorizedSkateUnit(THREE);
      s2.position.set(0, 0.10, 0.36);
      s2.rotation.y = Math.PI;
      pair.add(s1, s2);
      pair.position.set(x - 0.48 + i * 0.96, 0, z + 0.15);
      scene.add(pair);
      parkedPairMeshes.push(pair);
    }
    syncBox();
  }

  function syncBox() {
    sim.activeSkateCount = activePairs.size;
    for (let i = 0; i < parkedPairMeshes.length; i++) {
      parkedPairMeshes[i].visible = i >= activePairs.size;
    }
  }

  function checkoutSkates(uid) {
    activePairs.add(uid);
    syncBox();
  }

  function returnSkates(uid) {
    if (activePairs.delete(uid)) {
      syncBox();
    }
  }

  function resetSkates() {
    activePairs.clear();
    syncBox();
  }

  return { initBox, checkoutSkates, returnSkates, resetSkates };
}
