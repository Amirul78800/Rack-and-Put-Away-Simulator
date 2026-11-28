"""Level 2 Area 3 Rack Visualizer Backend (Python 3.12 stdlib, zero external deps)."""

import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_PATH = os.path.join(APP_DIR, "rack_master.json")

with open(MASTER_PATH, "r", encoding="utf-8") as _f:
    MASTER = json.load(_f)

LOCATIONS = MASTER["locations"]
SKUS = MASTER["skus"]
DAYS = MASTER["days"]
META = MASTER["meta"]

OPENMES_URL = os.getenv("OPENMES_URL", "https://openmes.my-edu.my").rstrip("/")
OPENMES_HOST_HDR = os.getenv("OPENMES_HOST_HEADER", "").strip()
OPENMES_ERP_KEY = os.getenv("OPENMES_ERP_KEY", "").strip()
ADMIN_PIN = os.getenv("RACKVIZ_ADMIN_PIN", "").strip()
PORT = int(os.getenv("PORT", "8111"))

_LIVE_CACHE = {"ts": 0.0, "data": None}
CACHE_TTL_SEC = 8.0


def openmes_request(method: str, path: str, payload: dict | None = None) -> dict:
    url = f"{OPENMES_URL}{path}"
    headers = {
        "X-Api-Key": OPENMES_ERP_KEY,
        "Accept": "application/json",
        "User-Agent": "L2A3-RackViz/1.0",
    }
    if OPENMES_HOST_HDR:
        headers["Host"] = OPENMES_HOST_HDR
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_openmes_live(force: bool = False) -> dict:
    now = time.time()
    if not force and _LIVE_CACHE["data"] is not None and (now - _LIVE_CACHE["ts"]) < CACHE_TTL_SEC:
        return _LIVE_CACHE["data"]

    if not OPENMES_ERP_KEY:
        raise RuntimeError("OPENMES_ERP_KEY is not configured")

    def paginate(endpoint: str) -> list:
        rows = []
        cursor = None
        while True:
            qs = urllib.parse.urlencode({"per_page": 100, **({"cursor": cursor} if cursor else {})})
            body = openmes_request("GET", f"/api/v1/erp/{endpoint}?{qs}")
            rows.extend(body.get("data", []))
            meta = body.get("meta", {})
            if not meta.get("has_more"):
                break
            cursor = meta.get("next_cursor")
        return rows

    warehouses = paginate("warehouses")
    stocks = paginate("stock")

    lot_map = {}
    for s in stocks:
        ln = s.get("lot_number")
        if not ln:
            continue
        lot_map[ln] = {
            "lot_number": ln,
            "location_id": s.get("warehouse_code"),
            "tag": s.get("material_code"),
            "qty": float(s.get("quantity") or 0.0),
        }

    result = {
        "warehouses_count": len(warehouses),
        "lots": lot_map,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
    }
    _LIVE_CACHE["ts"] = now
    _LIVE_CACHE["data"] = result
    return result


def build_state(mode: str, force_refresh: bool = False) -> dict:
    live_connected = False
    live_error = None
    fetched_at = None
    warehouses_count = len(LOCATIONS)

    if mode == "live":
        try:
            live = fetch_openmes_live(force=force_refresh)
            lot_map = live["lots"]
            warehouses_count = live["warehouses_count"]
            fetched_at = live["fetched_at"]
            live_connected = True
        except Exception as exc:
            live_error = str(exc)
            lot_map = DAYS["0"]["lots"]
    else:
        day_num = mode.replace("day", "") if mode.startswith("day") else "0"
        if day_num not in DAYS:
            day_num = "0"
        lot_map = DAYS[day_num]["lots"]

    # Aggregate lot_map by location and by SKU
    sku_qty = {tag: 0.0 for tag in SKUS}
    sku_units = {tag: 0 for tag in SKUS}

    enriched_locs = []
    total_units = 0
    total_pieces = 0.0
    total_mass = 0.0
    strict_used = 0
    phys_used = 0
    freed_locs = 0
    swl_breaches = 0

    for loc in LOCATIONS:
        lid = loc["location_id"]
        s1_lot = lot_map.get(f"{lid}-S1")
        s2_lot = lot_map.get(f"{lid}-S2")

        s1_qty = float(s1_lot["qty"]) if s1_lot else 0.0
        s2_qty = float(s2_lot["qty"]) if s2_lot else 0.0
        s1_active = s1_qty > 1e-6
        s2_active = s2_qty > 1e-6

        if s1_active and s1_lot:
            t = s1_lot["tag"]
            if t in sku_qty:
                sku_qty[t] += s1_qty
                sku_units[t] += 1
        if s2_active and s2_lot:
            t = s2_lot["tag"]
            if t in sku_qty:
                sku_qty[t] += s2_qty
                sku_units[t] += 1

        occ_u = (1 if s1_active else 0) + (1 if s2_active else 0)
        loc_pieces = round(s1_qty + s2_qty, 3)

        loc_mass = 0.0
        if s1_active:
            loc_mass += loc["slot1_wt_kg"]
        if s2_active:
            loc_mass += loc["slot2_wt_kg"]
        loc_mass = round(loc_mass, 2)

        if loc["units_on_level"] == 0 or occ_u == 0:
            loc_strict = 0
            loc_phys = 0
            if loc["units_on_level"] > 0:
                freed_locs += 1
        elif occ_u == loc["units_on_level"]:
            loc_strict = loc["strict_slots_used"]
            loc_phys = loc["phys_slots_used"]
        else:
            if loc["slot_mode"] == "CANT":
                loc_strict = 3
                loc_phys = 3
            else:
                loc_strict = 1
                loc_phys = 1

        swl = loc["level_swl_kg"] or 1.0
        swl_pct = round(loc_mass / swl * 100.0, 1)
        if loc_mass > swl + 1e-6:
            swl_breaches += 1

        total_units += occ_u
        total_pieces += loc_pieces
        total_mass += loc_mass
        strict_used += loc_strict
        phys_used += loc_phys

        enriched_locs.append({
            **loc,
            "active_units": occ_u,
            "active_pieces": loc_pieces,
            "active_mass_kg": loc_mass,
            "swl_pct": swl_pct,
            "active_strict_slots": loc_strict,
            "active_phys_slots": loc_phys,
            "slot1_qty": round(s1_qty, 3),
            "slot2_qty": round(s2_qty, 3),
            "slot1_active": s1_active,
            "slot2_active": s2_active,
        })

    enriched_skus = []
    reorder_alerts = 0
    for tag, s in SKUS.items():
        d0_qty = float(s["burndown"]["0"]["qty"])
        rem_q = round(sku_qty[tag], 3)
        pct_left = round((rem_q / d0_qty * 100.0), 1) if d0_qty > 0 else 0.0
        is_alert = (rem_q <= 1e-6 or pct_left <= 25.0) and mode != "day0" and not (mode == "live" and abs(total_units - 225) == 0)
        if is_alert:
            reorder_alerts += 1
        enriched_skus.append({
            **s,
            "live_qty": rem_q,
            "live_units": sku_units[tag],
            "d0_qty": d0_qty,
            "pct_left": pct_left,
            "reorder_alert": is_alert,
        })

    slot_cap = META["audit_baseline"]["slot_cap"]
    return {
        "mode": mode,
        "live_connected": live_connected,
        "live_error": live_error,
        "fetched_at": fetched_at,
        "admin_enabled": bool(ADMIN_PIN),
        "summary": {
            "warehouses_count": warehouses_count,
            "slot_cap": slot_cap,
            "active_units": total_units,
            "total_pieces": round(total_pieces, 2),
            "active_mass_kg": round(total_mass, 2),
            "strict_slots_used": strict_used,
            "phys_slots_used": phys_used,
            "strict_spare_slots": slot_cap - strict_used,
            "freed_locations": freed_locs,
            "swl_breaches": swl_breaches,
            "reorder_alerts": reorder_alerts,
        },
        "meta": META,
        "locations": enriched_locs,
        "skus": enriched_skus,
    }


class RackHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        pass

    def send_json(self, status: int, data: dict, head_only: bool = False) -> None:
        raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(raw)

    def send_bytes(self, raw: bytes, content_type: str, cache_control: str = "no-cache", head_only: bool = False) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(raw)

    def send_file(self, filename: str, content_type: str, head_only: bool = False) -> None:
        path = os.path.join(APP_DIR, filename)
        with open(path, "rb") as f:
            raw = f.read()
        self.send_bytes(raw, content_type, cache_control="no-store, no-cache, must-revalidate", head_only=head_only)

    def _handle_get_or_head(self, head_only: bool = False) -> None:
        parsed = urllib.parse.urlparse(self.path)
        p = parsed.path
        if p == "/api/health":
            self.send_json(200, {"status": "ok"}, head_only=head_only)
            return
        if p == "/api/rack-state":
            qs = urllib.parse.parse_qs(parsed.query)
            mode = (qs.get("mode") or ["live"])[0]
            force = (qs.get("refresh") or ["0"])[0] == "1"
            self.send_json(200, build_state(mode, force_refresh=force), head_only=head_only)
            return
        if p in ("/", "/index.html"):
            self.send_file("index.html", "text/html; charset=utf-8", head_only=head_only)
            return
        if p == "/styles.css":
            self.send_file("styles.css", "text/css; charset=utf-8", head_only=head_only)
            return
        if p == "/app.js":
            self.send_file("app.js", "application/javascript; charset=utf-8", head_only=head_only)
            return
        if p in ("/sim3d.js", "/sim-geometry.js", "/sim-meshes.js", "/sim-traffic.js"):
            self.send_file(p.lstrip("/"), "application/javascript; charset=utf-8", head_only=head_only)
            return
        if p == "/robots.txt":
            robots = b"User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://rack.my-edu.my/sitemap.xml\n"
            self.send_bytes(robots, "text/plain; charset=utf-8", cache_control="public, max-age=3600", head_only=head_only)
            return
        if p == "/sitemap.xml":
            sitemap = (
                b'<?xml version="1.0" encoding="UTF-8"?>\n'
                b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                b"  <url>\n"
                b"    <loc>https://rack.my-edu.my/</loc>\n"
                b"    <changefreq>daily</changefreq>\n"
                b"    <priority>1.0</priority>\n"
                b"  </url>\n"
                b"</urlset>\n"
            )
            self.send_bytes(sitemap, "application/xml; charset=utf-8", cache_control="public, max-age=3600", head_only=head_only)
            return
        if p == "/favicon.svg":
            svg = (
                b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                b'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
                b'<stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#06b6d4"/>'
                b'</linearGradient></defs>'
                b'<rect width="64" height="64" rx="14" fill="url(#g)"/>'
                b'<path d="M14 18h8v28h-8zm28 0h8v28h-8zM14 28h36v6H14zm0 12h36v6H14z" fill="#fff"/>'
                b'</svg>'
            )
            self.send_bytes(svg, "image/svg+xml", cache_control="public, max-age=86400", head_only=head_only)
            return
        self.send_json(404, {"error": "Not found"}, head_only=head_only)

    def do_GET(self) -> None:
        self._handle_get_or_head(head_only=False)

    def do_HEAD(self) -> None:
        self._handle_get_or_head(head_only=True)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/admin/stage-day":
            self.send_json(404, {"error": "Not found"})
            return
        if not ADMIN_PIN:
            self.send_json(403, {"error": "Admin staging is disabled (no RACKVIZ_ADMIN_PIN configured)"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        pin = str(body.get("pin") or "")
        if not hmac.compare_digest(pin, ADMIN_PIN):
            self.send_json(403, {"error": "Invalid PIN"})
            return

        day = str(body.get("day", "0"))
        if day not in DAYS:
            self.send_json(400, {"error": "day must be 0..5"})
            return

        lots_payload = [
            {
                "material_code": lt["tag"],
                "lot_number": lt["lot_number"],
                "warehouse_code": lt["location_id"],
                "quantity_available": lt["qty"],
                "unit_of_measure": "pcs",
                "status": lt["status"],
                "supplier_reference": f"{lt['unit_wt_kg']}kg|{next((l['slot_mode'] for l in LOCATIONS if l['location_id']==lt['location_id']), '')}|{lt['slot_pos']}",
            }
            for lt in DAYS[day]["lots"].values()
        ]
        try:
            res = openmes_request("POST", "/api/v1/erp/material-lots/import", {"strategy": "update_or_create", "lots": lots_payload})
            _LIVE_CACHE["ts"] = 0.0
            self.send_json(200, {"ok": True, "day": int(day), "result": res.get("data", {})})
        except Exception as exc:
            self.send_json(502, {"error": str(exc)})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), RackHandler)
    print(f"L2A3 Rack Visualizer listening on 0.0.0.0:{PORT}")
    srv.serve_forever()
