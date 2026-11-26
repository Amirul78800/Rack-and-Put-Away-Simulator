# Rack & Putaway Visualizer (`Level 2 Area 3 — Rev 01.15`)

An interactive **2D Floor Map, Rack-by-Rack Elevation, and 3D Isometric Warehouse Visualizer** wired live to **OpenMES** (`/api/v1/erp/warehouses` and `/api/v1/erp/stock`) for the Level 2 Area 3 Raw Material 5-Day Buffer (`221` rack-levels, `500` slots, `58` active SKUs, `146,316.9 kg`).

## Features
- **Live OpenMES Mode + 5D Playback Slider (`Day 0`–`Day 5`):** Inspect live lot/location balances or step through 5-day buffer burn-down (`82 → 400` spare slots).
- **2D Floor & Rack Map:** Rows 1–6 Blue (`2.7×1.2 m`), Rows 7–10 Magenta (`3.3×1.2 m`), Rows 11–12 Yellow Floor (`4.0×1.5 m`), Cantilever `CANT-R01..R03` (3-tier), and Highway Floor (`HWY-FLOOR-01..02`) anchored to the Main Transport Highway.
- **3D Isometric Warehouse (Three.js):** Orbit, pan, zoom, and click any rack bay or floor pallet to open the Location Inspector.
- **Location Inspector & SWL Checks:** Shows `Level SWL (kg)`, `Active Load`, `SWL Margin`, `L1 Clear (mm)`, `Frame Height (mm)`, `Slot Mode` (`SPAN`, `2x1`, `1+SP`, `FL3`, `CANT`, `HWY`), SKU dimensions/SPQ, and Day 0–5 burn-down.
- **Light / Dark Theme Toggle:** Defaults to dark mode with persistent `localStorage` state and dynamic 3D scene theming.
- **PIN-Protected OpenMES Sync:** Push Day 0–5 states back into OpenMES via `POST /api/admin/stage-day`.

## Quick Start (Docker Compose)
```bash
cp .env.example .env
# Edit .env with your OPENMES_URL, OPENMES_ERP_KEY, and RACKVIZ_ADMIN_PIN
docker compose -f compose.example.yml up -d
```

Open `http://localhost:8111`.

## Regenerating `app/rack_master.json`
```bash
uv run --with openpyxl --with requests python3 build_rack_data.py
```
