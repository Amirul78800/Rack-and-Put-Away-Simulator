let THREE = null;
let OrbitControls = null;

const state = {
  mode: 'live',
  view: '2d',
  search: '',
  kit: 'all',
  statusFilter: 'all',
  colorMode: 'mode',
  selectedLocId: 'R02-R01-L1',
  data: null,
  three: null,
};

const els = {
  btnLive: document.getElementById('btn-mode-live'),
  btnPlayback: document.getElementById('btn-mode-playback'),
  liveDot: document.getElementById('live-dot'),
  sliderWrap: document.getElementById('slider-wrap'),
  daySlider: document.getElementById('day-slider'),
  dayLabel: document.getElementById('day-label'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  btnAdminToggle: document.getElementById('btn-admin-toggle'),
  liveBanner: document.getElementById('live-banner'),
  kitFilter: document.getElementById('kit-filter'),
  statusFilter: document.getElementById('status-filter'),
  colorMode: document.getElementById('color-mode'),
  searchInput: document.getElementById('search-input'),
  rackGridRoot: document.getElementById('rack-grid-root'),
  skuTableBody: document.getElementById('sku-table-body'),
  threeContainer: document.getElementById('three-container'),
  btnResetCam: document.getElementById('btn-reset-cam'),
  inspLocId: document.getElementById('insp-loc-id'),
  inspBadge: document.getElementById('insp-badge'),
  inspBody: document.getElementById('insp-body'),
  adminModal: document.getElementById('admin-modal'),
  adminDay: document.getElementById('admin-day'),
  adminPin: document.getElementById('admin-pin'),
  adminMsg: document.getElementById('admin-msg'),
  btnAdminCancel: document.getElementById('btn-admin-cancel'),
  btnAdminSubmit: document.getElementById('btn-admin-submit'),
};

function fmtNum(n, dec = 0) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function modeColor(loc) {
  if (loc.active_units === 0) return '#1e293b';
  if (state.colorMode === 'swl') {
    if (loc.swl_pct > 100) return '#ef4444';
    if (loc.swl_pct >= 85) return '#f59e0b';
    if (loc.swl_pct >= 55) return '#3b82f6';
    return '#10b981';
  }
  if (state.colorMode === 'fill') {
    const skuMap = state.data ? Object.fromEntries(state.data.skus.map((s) => [s.tag, s])) : {};
    const s1 = skuMap[loc.slot1_tag];
    const s2 = skuMap[loc.slot2_tag];
    if ((s1 && s1.reorder_alert) || (s2 && s2.reorder_alert)) return '#ef4444';
    return loc.active_units < loc.units_on_level ? '#f59e0b' : '#22c55e';
  }
  switch (loc.slot_mode) {
    case 'SPAN': return '#7c3aed';
    case 'FL3': return '#ca8a04';
    case 'CANT': return '#059669';
    case 'HWY': return '#0891b2';
    case '1+SP': return '#0284c7';
    default: return '#2563eb';
  }
}

function swlBarColor(pct) {
  if (pct > 100) return '#ef4444';
  if (pct >= 85) return '#f59e0b';
  if (pct >= 60) return '#3b82f6';
  return '#22c55e';
}

function matchesLocation(loc, skuMap) {
  const q = state.search.trim().toLowerCase();
  if (q) {
    const hay = [
      loc.location_id, loc.zone, loc.row_line, loc.rack_type,
      loc.slot1_tag, loc.slot1_desc, loc.slot2_tag, loc.slot2_desc,
    ].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (state.kit !== 'all') {
    const s1 = skuMap[loc.slot1_tag];
    const s2 = skuMap[loc.slot2_tag];
    const ok = (s1 && s1.pnm_kits.includes(state.kit)) || (s2 && s2.pnm_kits.includes(state.kit));
    if (!ok) return false;
  }
  switch (state.statusFilter) {
    case 'occupied': return loc.active_units > 0;
    case 'spare': return loc.active_units === 0;
    case 'span': return loc.slot_mode === 'SPAN';
    case 'heavy': return loc.active_mass_kg >= 1500 || loc.level_swl_kg >= 2000;
    case 'floor': return ['FL3', 'CANT', 'HWY'].includes(loc.slot_mode);
    case 'alert': {
      const s1 = skuMap[loc.slot1_tag];
      const s2 = skuMap[loc.slot2_tag];
      return Boolean((s1 && s1.reorder_alert) || (s2 && s2.reorder_alert));
    }
    default: return true;
  }
}

function renderKPIs() {
  const d = state.data;
  const s = d.summary;
  document.getElementById('kpi-locations').textContent = fmtNum(s.warehouses_count);
  document.getElementById('kpi-units').textContent = fmtNum(s.active_units);
  document.getElementById('kpi-pieces').textContent = `${fmtNum(s.total_pieces, 1)} pcs`;
  document.getElementById('kpi-mass').textContent = `${fmtNum(s.active_mass_kg, 1)} kg`;
  const pct = ((s.strict_slots_used / s.slot_cap) * 100).toFixed(1);
  document.getElementById('kpi-strict').textContent = `${s.strict_slots_used} / ${s.slot_cap} (${pct}%)`;
  document.getElementById('kpi-phys').textContent = `Physical: ${s.phys_slots_used} slots`;
  document.getElementById('kpi-spare').textContent = fmtNum(s.strict_spare_slots);
  document.getElementById('kpi-freed').textContent = `Freed occupied bays: ${s.freed_locations}`;
  const brEl = document.getElementById('kpi-breaches');
  brEl.textContent = fmtNum(s.swl_breaches);
  brEl.className = `kpi-val ${s.swl_breaches > 0 ? 'accent-red' : 'accent-green'}`;
  document.getElementById('kpi-alerts').textContent = `Reorder watch (<=25%): ${s.reorder_alerts}`;

  if (d.mode === 'live') {
    els.liveDot.classList.toggle('offline', !d.live_connected);
    if (d.live_error) {
      els.liveBanner.textContent = `OpenMES live fetch fallback (${d.live_error}) — showing Day 0 baseline.`;
      els.liveBanner.classList.remove('hidden');
    } else {
      els.liveBanner.classList.add('hidden');
    }
  } else {
    els.liveBanner.textContent = `Playback Mode: Viewing end-of-Day ${d.mode.replace('day', '')} simulation snapshot (not modifying OpenMES).`;
    els.liveBanner.classList.remove('hidden');
  }
}

function render2D() {
  const d = state.data;
  const skuMap = Object.fromEntries(d.skus.map((s) => [s.tag, s]));

  // Organize into Zone 1 (Rows 1..6), Zone 2 (Rows 7..12), Zone 3 (Cantilever + Highway Floor)
  const zones = [
    { title: 'Zone 1 — Blue Selective Racking (2.7×1.2 m · 2-Tier · 2,700 mm Frame)', rows: [1, 2, 3, 4, 5, 6] },
    { title: 'Zone 2 — Magenta Selective (Rows 7–10 · 3.3×1.2 m) & Yellow Floor (Rows 11–12 · 4.0×1.5 m)', rows: [7, 8, 9, 10, 11, 12] },
    { title: 'Zone 3 — Yellow Highway Floor Bays & Green 6.1 m Cantilever (3-Tier)', special: true },
  ];

  const byRow = {};
  const zone3Groups = { 'CANT-R01': [], 'CANT-R02': [], 'CANT-R03': [], 'HWY-FLOOR': [] };
  for (const loc of d.locations) {
    if (loc.row_num) {
      byRow[loc.row_num] = byRow[loc.row_num] || {};
      byRow[loc.row_num][loc.bay] = byRow[loc.row_num][loc.bay] || [];
      byRow[loc.row_num][loc.bay].push(loc);
    } else if (loc.group_key in zone3Groups) {
      zone3Groups[loc.group_key].push(loc);
    }
  }

  let html = '';
  for (const z of zones) {
    html += `<div class="zone-section"><div class="zone-title"><span>${escapeHtml(z.title)}</span></div>`;
    if (!z.special) {
      for (const rnum of z.rows) {
        const bays = byRow[rnum] || {};
        const bayKeys = Object.keys(bays).map(Number).sort((a, b) => a - b);
        const firstLoc = bays[bayKeys[0]]?.[0];
        const rowLoad = Object.values(bays).flat().reduce((acc, l) => acc + l.active_mass_kg, 0);
        const rowUnits = Object.values(bays).flat().reduce((acc, l) => acc + l.active_units, 0);
        html += `<div class="row-block">
          <div class="row-header">
            <span>Row ${rnum} · ${escapeHtml(firstLoc?.rack_type || '')} · ${bayKeys.length} bays</span>
            <span>${rowUnits} units · ${fmtNum(rowLoad, 1)} kg</span>
          </div>
          <div class="bays-strip">`;

        for (const b of bayKeys) {
          const levels = bays[b].slice().sort((x, y) => y.tier - x.tier);
          html += `<div class="bay-col"><div class="bay-col-title">R${String(b).padStart(2, '0')}</div>`;
          for (const loc of levels) {
            html += renderLevelCard(loc, skuMap);
          }
          html += `</div>`;
        }
        html += `</div></div>`;
      }
    } else {
      html += `<div class="bays-strip">`;
      const hwyFloors = zone3Groups['HWY-FLOOR'].slice().sort((a, b) => a.bay - b.bay);
      for (const loc of hwyFloors) {
        html += `<div class="bay-col" style="min-width:165px"><div class="bay-col-title">${loc.location_id}</div>`;
        html += renderLevelCard(loc, skuMap);
        html += `</div>`;
      }
      for (const gKey of ['CANT-R01', 'CANT-R02', 'CANT-R03']) {
        const levels = zone3Groups[gKey].slice().sort((x, y) => y.tier - x.tier);
        html += `<div class="bay-col" style="min-width:145px"><div class="bay-col-title">${gKey} (3-Tier)</div>`;
        for (const loc of levels) html += renderLevelCard(loc, skuMap);
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  els.rackGridRoot.innerHTML = html;

  for (const el of els.rackGridRoot.querySelectorAll('.level-card')) {
    el.addEventListener('click', () => selectLocation(el.dataset.locId));
  }
}

function renderLevelCard(loc, skuMap) {
  const matched = matchesLocation(loc, skuMap);
  const selected = loc.location_id === state.selectedLocId;
  const col = modeColor(loc);
  const isSpanLike = ['SPAN', 'FL3', 'HWY'].includes(loc.slot_mode);

  let slotsHtml = '';
  if (loc.active_units === 0) {
    slotsHtml = `<div class="slot-pill wide empty">${loc.units_on_level > 0 ? 'EMPTIED' : 'SPARE'}</div>`;
  } else if (isSpanLike) {
    const tag = loc.slot1_active ? loc.slot1_tag : loc.slot2_tag;
    const qty = loc.slot1_active ? loc.slot1_qty : loc.slot2_qty;
    slotsHtml = `<div class="slot-pill wide" style="background:${col}">${escapeHtml(tag)} · ${fmtNum(qty)}</div>`;
  } else {
    const s1Html = loc.slot1_active
      ? `<div class="slot-pill" style="background:${col}">${escapeHtml(loc.slot1_tag)}</div>`
      : `<div class="slot-pill empty">—</div>`;
    const s2Html = loc.slot2_active
      ? `<div class="slot-pill" style="background:${col}">${escapeHtml(loc.slot2_tag)}</div>`
      : `<div class="slot-pill empty">SPARE</div>`;
    slotsHtml = s1Html + s2Html;
  }

  const tierShort = `L${loc.tier}`;
  return `<div class="level-card ${selected ? 'selected' : ''} ${matched ? '' : 'dimmed'}" data-loc-id="${escapeHtml(loc.location_id)}">
    <div class="level-top"><span class="level-tier">${tierShort}</span><span class="level-mode">${escapeHtml(loc.slot_mode)}</span></div>
    <div class="slots-row">${slotsHtml}</div>
    <div class="level-load">${fmtNum(loc.active_mass_kg)} / ${fmtNum(loc.level_swl_kg)} kg</div>
    <div class="swl-bar"><div class="swl-bar-fill" style="width:${Math.min(100, loc.swl_pct)}%;background:${swlBarColor(loc.swl_pct)}"></div></div>
  </div>`;
}

function renderInspector() {
  const d = state.data;
  const loc = d.locations.find((l) => l.location_id === state.selectedLocId);
  if (!loc) return;
  const skuMap = Object.fromEntries(d.skus.map((s) => [s.tag, s]));

  els.inspLocId.textContent = loc.location_id;
  els.inspBadge.textContent = loc.active_units === 0 ? 'SPARE' : `${loc.slot_mode} · ${loc.swl_pct}% SWL`;

  const renderSlotBox = (slotNum, tag, desc, wt, qty, active) => {
    if (!tag || tag === 'SPARE' || tag.startsWith('[')) {
      return `<div class="slot-box"><h4><span>Slot ${slotNum}</span><span class="muted">${tag || 'SPARE'}</span></h4><p class="muted" style="margin:0">${escapeHtml(desc || 'Available capacity')}</p></div>`;
    }
    const sku = skuMap[tag];
    const bd = sku ? sku.burndown : null;
    const d0q = bd ? bd['0'].qty : qty;
    let bdHtml = '';
    if (bd) {
      bdHtml = `<div class="mini-bars">` + [0, 1, 2, 3, 4, 5].map((day) => {
        const dq = bd[String(day)].qty;
        const pct = d0q > 0 ? Math.min(100, (dq / d0q) * 100) : 0;
        return `<div class="mini-bar-row"><span>Day ${day}</span><div class="mini-track"><div class="mini-fill" style="width:${pct}%"></div></div><span>${fmtNum(dq, 1)}</span></div>`;
      }).join('') + `</div>`;
    }
    return `<div class="slot-box">
      <h4><span>Slot ${slotNum}: <strong>${escapeHtml(tag)}</strong></span><span class="${active ? 'accent-green' : 'accent-amber'}">${active ? `${fmtNum(qty, 1)} pcs` : 'CONSUMED (0 pcs)'}</span></h4>
      <div style="font-size:11px;margin-bottom:6px">${escapeHtml(desc)}</div>
      <div class="insp-grid" style="margin-bottom:4px">
        <div class="insp-kv"><span>Unit Weight / SPQ</span><strong>${fmtNum(wt, 1)} kg · ${sku ? fmtNum(sku.spq) : '—'} pcs</strong></div>
        <div class="insp-kv"><span>L × W × H (mm)</span><strong>${sku ? `${sku.L_mm}×${sku.W_mm}×${sku.H_mm}` : '—'}</strong></div>
      </div>
      ${sku && sku.pnm_kits.length ? `<div class="muted" style="font-size:11px">Kits: ${escapeHtml(sku.pnm_kits.join(', '))}</div>` : ''}
      ${bdHtml}
    </div>`;
  };

  els.inspBody.innerHTML = `
    <div class="insp-grid">
      <div class="insp-kv"><span>Zone &amp; Row</span><strong>${escapeHtml(loc.zone)} · ${escapeHtml(loc.row_line)}</strong></div>
      <div class="insp-kv"><span>Rack Type</span><strong>${escapeHtml(loc.rack_type)}</strong></div>
      <div class="insp-kv"><span>Active Load / SWL</span><strong>${fmtNum(loc.active_mass_kg, 1)} / ${fmtNum(loc.level_swl_kg)} kg</strong></div>
      <div class="insp-kv"><span>SWL Margin</span><strong class="${loc.level_swl_kg - loc.active_mass_kg < 0 ? 'accent-red' : 'accent-green'}">${fmtNum(loc.level_swl_kg - loc.active_mass_kg, 1)} kg</strong></div>
      <div class="insp-kv"><span>Frame / L1 Clear</span><strong>${loc.frame_height_mm} mm / ${loc.l1_clear_mm} mm</strong></div>
      <div class="insp-kv"><span>Slots (Strict / Cap)</span><strong>${loc.active_strict_slots} / ${loc.slot_cap} (Phys ${loc.active_phys_slots})</strong></div>
    </div>
    ${renderSlotBox(1, loc.slot1_tag, loc.slot1_desc, loc.slot1_wt_kg, loc.slot1_qty, loc.slot1_active)}
    ${renderSlotBox(2, loc.slot2_tag, loc.slot2_desc, loc.slot2_wt_kg, loc.slot2_qty, loc.slot2_active)}
    ${loc.notes ? `<div class="muted" style="font-size:11px;margin-top:6px">Note: ${escapeHtml(loc.notes)}</div>` : ''}
  `;
}

function renderTable() {
  const d = state.data;
  const q = state.search.trim().toLowerCase();
  const rows = d.skus.filter((s) => {
    if (state.kit !== 'all' && !s.pnm_kits.includes(state.kit)) return false;
    if (state.statusFilter === 'alert' && !s.reorder_alert) return false;
    if (q) {
      const hay = `${s.tag} ${s.category} ${s.description} ${s.assigned_rows}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  els.skuTableBody.innerHTML = rows.map((s) => {
    const pctCls = s.pct_left <= 25 ? (s.pct_left === 0 ? 'accent-red' : 'accent-amber') : 'accent-green';
    return `<tr>
      <td><strong>${escapeHtml(s.tag)}</strong></td>
      <td>${escapeHtml(s.category)}</td>
      <td>${escapeHtml(s.description)}</td>
      <td>${s.L_mm}×${s.W_mm}×${s.H_mm}</td>
      <td>${fmtNum(s.unit_wt_kg, 1)} kg</td>
      <td>${fmtNum(s.spq)}</td>
      <td>${s.live_units} / ${s.units_5d}</td>
      <td>${fmtNum(s.live_qty, 1)}</td>
      <td class="${pctCls}"><strong>${s.pct_left}%</strong></td>
      <td>${escapeHtml(s.assigned_zone)} · ${escapeHtml(s.assigned_rows)}</td>
    </tr>`;
  }).join('');
}

async function initThree() {
  if (state.three) return;
  const container = els.threeContainer;
  const w = container.clientWidth || 900;
  const h = container.clientHeight || 640;

  if (!THREE || !OrbitControls) {
    try {
      const [threeMod, ctrlMod] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      THREE = threeMod;
      OrbitControls = ctrlMod.OrbitControls;
    } catch (err) {
      container.innerHTML = `<div style="padding:20px;color:#fca5a5">3D renderer failed to load: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:#fca5a5">WebGL unavailable in this browser: ${escapeHtml(err.message)}</div>`;
    return;
  }
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isLight ? 0xe8eef7 : 0x090e17);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 300);
  camera.position.set(-18, 24, 34);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(16, 1.5, 16);
  controls.enableDamping = true;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(25, 45, 20);
  scene.add(dirLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 65),
    new THREE.MeshStandardMaterial({ color: isLight ? 0xdbe4f0 : 0x111827, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(20, 0, 17);
  scene.add(floor);

  const grid = new THREE.GridHelper(90, 45, isLight ? 0x94a3b8 : 0x263449, isLight ? 0xcbd5e1 : 0x182233);
  grid.position.set(20, 0.01, 17);
  scene.add(grid);

  // Highway strip along X = -4
  const hwy = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 46),
    new THREE.MeshStandardMaterial({ color: 0x0e7490, transparent: true, opacity: 0.25 })
  );
  hwy.rotation.x = -Math.PI / 2;
  hwy.position.set(-4.5, 0.02, 18);
  scene.add(hwy);

  const group = new THREE.Group();
  scene.add(group);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clickable = [];

  renderer.domElement.addEventListener('pointerdown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickable, false);
    if (hits.length > 0 && hits[0].object.userData.locId) {
      selectLocation(hits[0].object.userData.locId);
    }
  });

  const ro = new ResizeObserver(() => {
    const nw = container.clientWidth;
    const nh = container.clientHeight;
    if (nw > 0 && nh > 0) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
  });
  ro.observe(container);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  state.three = { scene, camera, controls, renderer, group, clickable, floor, grid };
}

async function render3D() {
  if (state.view !== '3d') return;
  await initThree();
  if (!state.three) return;

  const { group, clickable } = state.three;
  while (group.children.length) group.remove(group.children[0]);
  clickable.length = 0;

  const d = state.data;
  const skuMap = Object.fromEntries(d.skus.map((s) => [s.tag, s]));

  for (const loc of d.locations) {
    let x = 0, z = 0, w = 2.6, dep = 1.2, y = 0.4;
    if (loc.row_num) {
      const pitchX = loc.row_num <= 6 ? 2.9 : (loc.row_num <= 10 ? 3.5 : 4.2);
      w = loc.row_num <= 6 ? 2.6 : (loc.row_num <= 10 ? 3.2 : 3.9);
      dep = loc.row_num >= 11 ? 1.5 : 1.2;
      x = (loc.bay - 1) * pitchX;
      z = (loc.row_num - 1) * 3.0;
      y = loc.tier === 1 ? 0.55 : 2.1;
    } else if (loc.location_id.startsWith('CANT-R')) {
      w = 1.2;
      dep = 6.1;
      x = -8.5;
      z = 19.0 + (loc.bay - 1) * 7.0;
      y = 0.5 + (loc.tier - 1) * 1.1;
    } else if (loc.location_id.startsWith('HWY-FLOOR-')) {
      w = loc.location_id === 'HWY-FLOOR-01' ? 2.1 : 1.2;
      dep = loc.location_id === 'HWY-FLOOR-01' ? 5.8 : 7.5;
      x = -8.5;
      z = loc.location_id === 'HWY-FLOOR-01' ? 3.0 : 11.0;
      y = 0.45;
    }

    const matched = matchesLocation(loc, skuMap);
    const colHex = loc.location_id === state.selectedLocId ? '#facc15' : modeColor(loc);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colHex),
      transparent: !matched || loc.active_units === 0,
      opacity: !matched ? 0.14 : (loc.active_units === 0 ? 0.25 : 0.92),
      roughness: 0.45,
    });
    const h = loc.active_units === 0 ? 0.18 : 0.95;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
    mesh.position.set(x, y, z);
    mesh.userData.locId = loc.location_id;
    group.add(mesh);
    clickable.push(mesh);
  }
}

function selectLocation(locId) {
  state.selectedLocId = locId;
  render2D();
  renderInspector();
  if (state.view === '3d') render3D();
}

function renderAll() {
  if (!state.data) return;
  renderKPIs();
  if (state.view === '2d') render2D();
  else if (state.view === '3d') render3D();
  else renderTable();
  renderInspector();
}

async function fetchState(force = false) {
  const qs = new URLSearchParams({ mode: state.mode, refresh: force ? '1' : '0' });
  const r = await fetch(`/api/rack-state?${qs.toString()}`);
  const body = await r.json();
  state.data = body;

  if (els.kitFilter.options.length <= 1 && body.meta?.pnm_kits) {
    for (const k of body.meta.pnm_kits) {
      const opt = document.createElement('option');
      opt.value = k.code;
      opt.textContent = `${k.name} (${k.sku_count} SKUs)`;
      els.kitFilter.appendChild(opt);
    }
  }
  renderAll();
}

// Event bindings
els.btnLive.addEventListener('click', () => {
  state.mode = 'live';
  els.btnLive.classList.add('active');
  els.btnPlayback.classList.remove('active');
  els.sliderWrap.classList.add('hidden');
  fetchState(true);
});

els.btnPlayback.addEventListener('click', () => {
  state.mode = `day${els.daySlider.value}`;
  els.btnPlayback.classList.add('active');
  els.btnLive.classList.remove('active');
  els.sliderWrap.classList.remove('hidden');
  fetchState();
});

els.daySlider.addEventListener('input', () => {
  els.dayLabel.textContent = els.daySlider.value;
  state.mode = `day${els.daySlider.value}`;
  fetchState();
});

els.btnRefresh.addEventListener('click', () => fetchState(true));

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.view = tab.dataset.view;
    document.getElementById('view-2d').classList.toggle('hidden', state.view !== '2d');
    document.getElementById('view-3d').classList.toggle('hidden', state.view !== '3d');
    document.getElementById('view-table').classList.toggle('hidden', state.view !== 'table');
    renderAll();
  });
}

els.searchInput.addEventListener('input', () => { state.search = els.searchInput.value; renderAll(); });
els.kitFilter.addEventListener('change', () => { state.kit = els.kitFilter.value; renderAll(); });
els.statusFilter.addEventListener('change', () => { state.statusFilter = els.statusFilter.value; renderAll(); });
els.colorMode.addEventListener('change', () => { state.colorMode = els.colorMode.value; renderAll(); });

els.btnResetCam.addEventListener('click', () => {
  if (state.three) {
    state.three.camera.position.set(-18, 24, 34);
    state.three.controls.target.set(16, 1.5, 16);
    state.three.controls.update();
  }
});

els.btnAdminToggle.addEventListener('click', () => {
  els.adminMsg.textContent = '';
  els.adminModal.classList.remove('hidden');
});
els.btnAdminCancel.addEventListener('click', () => els.adminModal.classList.add('hidden'));
els.btnAdminSubmit.addEventListener('click', async () => {
  els.adminMsg.textContent = 'Syncing to OpenMES...';
  try {
    const r = await fetch('/api/admin/stage-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: Number(els.adminDay.value), pin: els.adminPin.value }),
    });
    const res = await r.json();
    if (!r.ok) {
      els.adminMsg.textContent = `Error: ${res.error || r.statusText}`;
      return;
    }
    els.adminMsg.textContent = `Synced Day ${res.day} (${res.result.updated ?? 0} updated, ${res.result.imported ?? 0} imported).`;
    if (state.mode === 'live') await fetchState(true);
  } catch (err) {
    els.adminMsg.textContent = `Failed: ${err.message}`;
  }
});

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('rackviz-theme', next); } catch (e) {}
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', next === 'light' ? '#f3f6fb' : '#0c111b');
  if (els.btnThemeToggle) {
    els.btnThemeToggle.textContent = next === 'light' ? '☾ Dark' : '☀ Light';
  }
  if (state.three) {
    const isLight = next === 'light';
    state.three.scene.background.setHex(isLight ? 0xe8eef7 : 0x090e17);
    state.three.floor.material.color.setHex(isLight ? 0xdbe4f0 : 0x111827);
  }
}

if (els.btnThemeToggle) {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  els.btnThemeToggle.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  });
}

fetchState(true);
