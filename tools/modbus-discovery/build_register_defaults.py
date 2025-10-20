#!/usr/bin/env python3
"""
Generate modbus-register-defaults.json from Sungrow CSV exports.

Usage:
    python3 tools/modbus-discovery/build_register_defaults.py
"""

from __future__ import annotations

import json
import csv
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List
from datetime import datetime

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
OUTPUT_PATH = ROOT / "modbus-register-defaults.json"


@dataclass
class CsvDefinition:
    inverter_type: str
    path: Path


CSV_DEFINITIONS: List[CsvDefinition] = [
    CsvDefinition("STRING", ROOT / "sungrow_string_v1.1.66.csv"),
    CsvDefinition("HYBRID", ROOT / "sungrow_hybrid_v1.1.4.csv"),
]


def sanitize_key(value: str) -> str:
    return (
        value.lower()
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("/", " ")
        .replace("-", " ")
        .replace("(", " ")
        .replace(")", " ")
        .replace(".", " ")
        .replace(",", " ")
        .replace(":", " ")
        .replace(";", " ")
        .replace("%", " percent ")
    )


def slugify(value: str) -> str:
    sanitized = sanitize_key(value)
    sanitized = re.sub(r"[^a-z0-9]+", "_", sanitized)
    return sanitized.strip("_") or "register"


def parse_float(value: str | None) -> float:
    if not value:
        return 1.0
    try:
        return float(value)
    except ValueError:
        return 1.0


def load_rows(path: Path) -> Iterable[Dict[str, str]]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            yield {key.lower(): (value or "").strip() for key, value in row.items()}


def build_registers(definition: CsvDefinition) -> Dict[str, object]:
    registers = []
    source_version = ""
    for row in load_rows(definition.path):
        address_start = row.get("address_start")
        if not address_start:
            continue
        try:
            start = int(address_start)
        except ValueError:
            continue

        address_end = row.get("address_end") or address_start
        try:
            end = int(address_end)
        except ValueError:
            end = start

        register_type = (row.get("register_type") or "3X").upper()
        register_kind = "holding" if register_type.startswith("4") else "input"

        if not source_version:
            source_version = row.get("source_version") or ""

        registers.append(
            {
                "id": slugify(row.get("name", "")),
                "no": row.get("no", ""),
                "name": row.get("name", ""),
                "address": start,
                "length": max(1, end - start + 1),
                "data_type": (row.get("data_type") or "").upper(),
                "data_range": row.get("data_range") or None,
                "unit": row.get("unit") or None,
                "scale_factor": parse_float(row.get("scale_factor")),
                "register_type": register_kind,
                "note": row.get("note") or None,
            }
        )

    registers.sort(key=lambda entry: (entry["address"], entry["length"]))

    return {
        "source_version": source_version or None,
        "registers": registers,
    }


def build_payload() -> Dict[str, object]:
    payload = {
        "metadata": {
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "source": {},
        },
        "inverter_types": {},
    }

    for definition in CSV_DEFINITIONS:
        payload["metadata"]["source"][definition.inverter_type] = definition.path.name
        payload["inverter_types"][definition.inverter_type] = build_registers(definition)

    return payload


def main() -> None:
    payload = build_payload()
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
