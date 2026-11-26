"""Generate rack_master.json for the Level 2 Area 3 2D/3D Rack Visualizer."""

import json
import os
import re
import sys

sys.path.append("/home/amirul/app/pentamaster")
import simulate_l2a3_openmes as sim


def parse_layout_coords(loc: dict) -> dict:
    lid = loc["location_id"]
    if lid.startswith("HWY-FLOOR-"):
        idx = int(lid.split("-")[-1])
        return {"group_key": "HWY-FLOOR", "group_label": "Zone 3 · Highway Floor", "bay": idx, "tier": 1}
    if lid.startswith("CANT-R"):
        m = re.match(r"CANT-R(\d+)-L(\d+)", lid)
        return {
            "group_key": f"CANT-R{m.group(1)}",
            "group_label": f"Zone 3 · Cantilever Bay R{m.group(1)}",
            "bay": int(m.group(1)),
            "tier": int(m.group(2)),
        }
    m = re.match(r"R(\d+)-R(\d+)-L(\d+)", lid)
    if m:
        row_n, rack_n, tier_n = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return {
            "group_key": f"ROW-{row_n:02d}",
            "group_label": f"{loc['zone']} · Row {row_n} ({loc['rack_type']})",
            "row_num": row_n,
            "bay": rack_n,
            "tier": tier_n,
        }
    return {"group_key": "OTHER", "group_label": loc["zone"], "bay": 1, "tier": 1}


def main() -> None:
    data = sim.load_workbooks()
    val = sim.validate_slotting_rules(data)
    assert val["violations"] == []

    pnm_codes = {
        "PNM 16ft MID - GPN 1257042": "PNM-16FT-MID",
        "PNM 16ft OT - GPN 1257045": "PNM-16FT-OT",
        "PNM 21ft OT - GPN 1257046": "PNM-21FT-OT",
        "PNM 24ft CM - GPN 1257048 / 1257050": "PNM-24FT-CM",
    }

    sku_kits = {}
    for pnm_name, comps in data["pnm_boms"].items():
        code = pnm_codes[pnm_name]
        for tag in comps:
            sku_kits.setdefault(tag, []).append(code)

    locations_out = []
    for loc in data["locations"]:
        coords = parse_layout_coords(loc)
        locations_out.append({**loc, **coords})

    skus_out = {}
    for tag, s in sorted(data["skus"].items()):
        skus_out[tag] = {
            **s,
            "pnm_kits": sorted(sku_kits.get(tag, [])),
            "burndown": {str(d): data["burndown_5d"][tag][d] for d in range(6)},
        }

    days_out = {}
    for d in range(6):
        lots, info = sim.allocate_day_quantities(data["skus"], val["unit_slots"], data["burndown_5d"], d)
        # Compute exact mass from active lots
        active_lots = [l for l in lots if l["quantity_available"] > 1e-6]
        exact_mass = round(sum(l["unit_wt_kg"] for l in active_lots), 2)
        slot_sum = sim.summarize_slots(data["locations"], info["occupied_by_loc"])
        slot_sum["active_mass_kg"] = exact_mass

        lot_map = {
            l["lot_number"]: {
                "lot_number": l["lot_number"],
                "location_id": l["location_id"],
                "slot_pos": l["slot_pos"],
                "tag": l["tag"],
                "qty": l["quantity_available"],
                "unit_wt_kg": l["unit_wt_kg"],
                "status": l["status"],
            }
            for l in lots
        }
        days_out[str(d)] = {
            "day": d,
            "summary": {
                **slot_sum,
                "total_pieces": round(sum(l["quantity_available"] for l in lots), 2),
                "slot_cap": val["totals"]["slot_cap"],
            },
            "lots": lot_map,
            "reorder_alerts": info["reorder_alerts"],
        }

    out = {
        "meta": {
            "title": "Level 2 Area 3 — 5D Raw Material Racking Plan (Rev 01.15)",
            "audit_baseline": val["totals"],
            "pnm_kits": [
                {"code": code, "name": name, "sku_count": len(data["pnm_boms"][name])}
                for name, code in sorted(pnm_codes.items(), key=lambda x: x[1])
            ],
        },
        "locations": locations_out,
        "skus": skus_out,
        "days": days_out,
    }

    os.makedirs("/home/amirul/app/pentamaster/rack-viz/app", exist_ok=True)
    out_path = "/home/amirul/app/pentamaster/rack-viz/app/rack_master.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {out_path} ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    main()
