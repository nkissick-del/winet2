"""Generate modbus-metric-definitions.json from Sungrow CSV exports."""
from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT.parent
OUTPUT_PATH = PROJECT_ROOT / "modbus-metric-definitions.json"

CSV_DEFINITIONS = [
    {
        "family": "String",
        "model": "SG50RS",
        "path": ROOT / "sungrow_string_v1.1.37.csv",
    },
    {
        "family": "Hybrid",
        "model": "HYBRID",
        "path": ROOT / "sungrow_hybrid_v1.1.4.csv",
    },
]

NUMERIC_TYPES = {
    "U16": ("uint16", 1),
    "S16": ("int16", 1),
    "U32": ("uint32", 2),
    "S32": ("int32", 2),
    "U64": ("uint64", 4),
    "IEEE754": ("float32", 2),
    "FLOAT": ("float32", 2),
}

UNIT_CATEGORY = {
    "v": "voltage",
    "kv": "voltage",
    "a": "current",
    "ka": "current",
    "hz": "frequency",
    "kwh": "energy",
    "wh": "energy",
    "mwh": "energy",
    "kw": "power",
    "w": "power",
    "kvar": "reactive_power",
    "kvarh": "reactive_energy",
    "kva": "apparent_power",
    "percent": "percentage",
    "%": "percentage",
    "℃": "temperature",
    "c": "temperature",
    "kΩ": "resistance",
    "kohm": "resistance",
}

DISCOVERY_BY_CATEGORY = {
    "power": {"method": "power"},
    "energy": {"method": "energy"},
    "voltage": {"method": "voltage"},
    "current": {"method": "current"},
    "frequency": {"method": "frequency"},
}

SPECIAL_DISCOVERY = {
    "meter_power": {
        "method": "power",
        "prompt": "Meter Active Power (kW) [press Enter to skip]: ",
        "input_unit": "kW",
        "expected_range": {"min": -20000, "max": 20000},
        "tolerance_watts": 1500,
    },
    "grid_import_energy": {
        "method": "energy",
        "prompt": "Forward Active Energy (MWh) [press Enter to skip]: ",
        "input_unit": "MWh",
        "tolerance": {"absolute_kwh": 2, "relative": 0.01},
    },
    "grid_export_energy": {
        "method": "energy",
        "prompt": "Reverse Active Energy (MWh) [press Enter to skip]: ",
        "input_unit": "MWh",
        "tolerance": {"absolute_kwh": 2, "relative": 0.01},
    },
}

FALLBACK_METRICS = {
    "meter_power": {"SG50RS": 5600},
    "grid_import_energy": {"SG50RS": 5098},
    "grid_export_energy": {"SG50RS": 5094},
}


def sanitise_metric_id(name: str) -> str:
    metric_id = name.strip().lower().replace(" ", "_").replace("-", "_")
    metric_id = re.sub(r"[^a-z0-9_]", "", metric_id)
    metric_id = re.sub(r"_+", "_", metric_id).strip("_")
    return metric_id


def base_unit(unit: str) -> str:
    if not unit:
        return ""
    match = re.search(r"([a-zA-ZΩ%℃]+)$", unit)
    return match.group(1) if match else unit


def classify_unit(unit: str) -> Optional[str]:
    key = unit.lower()
    return UNIT_CATEGORY.get(key)


def load_rows(path: Path) -> Iterable[dict]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        yield from reader


def build_definitions() -> dict:
    metrics: Dict[str, dict] = {}

    for definition in CSV_DEFINITIONS:
        path = definition["path"]
        if not path.exists():
            raise FileNotFoundError(path)
        model = definition["model"]
        for row in load_rows(path):
            data_type = row["data_type"].strip().upper()
            if data_type not in NUMERIC_TYPES:
                continue
            address_start = row.get("address_start")
            try:
                register = int(address_start) if address_start else None
            except ValueError:
                register = None
            if register is None:
                continue
            metric_id = sanitise_metric_id(row["name"])
            if not metric_id:
                continue
            type_name, default_words = NUMERIC_TYPES[data_type]
            words = default_words
            address_end = row.get("address_end")
            if address_end:
                try:
                    words = max(words, int(address_end) - register + 1)
                except ValueError:
                    pass
            scale_factor = 1.0
            scale_raw = row.get("scale_factor")
            if scale_raw:
                try:
                    scale_factor = float(scale_raw)
                except ValueError:
                    pass
            unit_raw = row.get("unit", "").strip()
            engineering_unit = base_unit(unit_raw)
            category = classify_unit(engineering_unit) if engineering_unit else None
            metric = metrics.setdefault(
                metric_id,
                {
                    "id": metric_id,
                    "name": row["name"].strip(),
                    "unit": engineering_unit or None,
                    "category": category,
                    "default": {},
                    "models": {},
                    "read": {
                        "function": "input" if row["register_type"].strip() == "3X" else "holding",
                        "words": words,
                        "type": type_name,
                        "scale": scale_factor,
                    },
                },
            )
            metric["models"].setdefault(model, {})["register"] = register

    for metric_id, overrides in FALLBACK_METRICS.items():
        metric = metrics.setdefault(
            metric_id,
            {
                "id": metric_id,
                "name": metric_id.replace("_", " ").title(),
                "unit": "W" if "power" in metric_id else "kWh",
                "category": "power" if "power" in metric_id else "energy",
                "default": {},
                "models": {},
                "read": {
                    "function": "input",
                    "words": 1 if metric_id == "meter_power" else 2,
                    "type": "int16" if metric_id == "meter_power" else "uint32le",
                    "scale": 1 if metric_id == "meter_power" else 0.1,
                },
            },
        )
        for model, register in overrides.items():
            metric["models"].setdefault(model, {})["register"] = register

    for metric in metrics.values():
        models = metric.get("models", {})
        if models:
            first_model = next(iter(models))
            register = models[first_model].get("register")
            if isinstance(register, int):
                metric["default"]["register"] = register

        metric_id = metric["id"]
        discovery = SPECIAL_DISCOVERY.get(metric_id)
        if not discovery:
            category = metric.get("category")
            if category in DISCOVERY_BY_CATEGORY:
                discovery = DISCOVERY_BY_CATEGORY[category].copy()
        if discovery:
            metric["discovery"] = discovery

    output = {
        "version": 1,
        "metrics": sorted(metrics.values(), key=lambda m: m["id"]),
    }
    return output


def main() -> None:
    definitions = build_definitions()
    OUTPUT_PATH.write_text(json.dumps(definitions, indent=2))
    print(f"Wrote {len(definitions['metrics'])} metric definitions to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
