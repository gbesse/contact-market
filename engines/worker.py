import contextlib

import hashlib

import importlib.metadata

import io

import json

import math

import os

from pathlib import Path

import subprocess

import sys

import tempfile

def sha(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def verified(runtime, name):
    manifest = json.loads((Path(__file__).parent / "datasets.json").read_text())
    data = next(x for x in manifest["datasets"] if x["id"] == name)
    path = runtime / data["file"]
    if path.stat().st_size != data["bytes"] or sha(path) != data["sha256"]:
        raise ValueError("DATASET_INTEGRITY")
    return path, data

def version(name):
    return importlib.metadata.version(name)

def satellite(runtime):
    from sgp4.api import Satrec
    path, data = verified(runtime, "iss-2026-10-10")
    lines = path.read_text().splitlines()
    sat = Satrec.twoline2rv(lines[1], lines[2])
    return sat, data

def contact_windows(runtime):
    import numpy as np
    from sgp4.api import Satrec
    from sgp4.functions import jday
    from sgp4.propagation import gstime
    sat, source = satellite(runtime)
    # Scenario antennas at city coordinates, not operational station claims.
    stations = [("paris", 48.8566, 2.3522, 2), ("tenerife", 28.2916, -16.6291, 1), ("canberra", -35.2809, 149.13, 3)]
    contacts = []
    for name, latitude, longitude, price in stations:
        lat, lon = math.radians(latitude), math.radians(longitude)
        n = 6378137 / math.sqrt(1 - .00669437999014 * math.sin(lat) ** 2)
        ground = np.array([n * math.cos(lat) * math.cos(lon), n * math.cos(lat) * math.sin(lon), n * (1 - .00669437999014) * math.sin(lat)])
        up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
        active = []
        def close():
            if len(active) >= 3:
                contacts.append({"id": f"{name}-{active[0][0]}", "station": name, "start": active[0][0], "end": active[-1][0], "maxElevationDeg": max(x[1] for x in active), "latencySec": max(x[2] for x in active) / 299792458, "rateBytesPerSec": 64000, "pricePerMbUnits": price})
        for t in range(0, 86401, 30):
            error, r, _ = sat.sgp4(sat.jdsatepoch, sat.jdsatepochF + t / 86400)
            if error: raise ValueError("SGP4")
            angle = gstime(sat.jdsatepoch + sat.jdsatepochF + t / 86400)
            c, s = math.cos(angle), math.sin(angle)
            fixed = np.array([c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]]) * 1000
            los = fixed - ground; distance = float(np.linalg.norm(los))
            elevation = math.degrees(math.asin(float(np.dot(los, up)) / distance))
            if elevation >= 10: active.append((t, elevation, distance))
            elif active: close(); active = []
        close()
    contacts.sort(key=lambda x: (x["start"], x["id"]))
    return contacts, source, sat.jdsatepoch + sat.jdsatepochF

def market(runtime, config):
    from ortools.sat.python import cp_model
    if config["budgetUnits"] not in [50, 100, 200] or config["outage"] not in ["none", "paris", "tenerife", "canberra"]: raise ValueError("CONFIG")
    contacts, source, epoch = contact_windows(runtime)
    active = [c for c in contacts if c["station"] != config["outage"]]
    # Declared scientific requests and valuations; geometric opportunities come from the TLE.
    state = config["seed"] & 0xffffffff
    def rand():
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xffffffff
        return state
    requests = [{"id": f"science-{i+1}", "bytes": (4 + rand() % 9) * 1000000, "value": 10 + rand() % 91, "releaseAt": (i // 4) * 12000, "deadline": min(86400, (i // 4) * 12000 + 26000)} for i in range(16)]
    model = cp_model.CpModel(); choices = []; intervals = []
    by_request = {r["id"]: [] for r in requests}
    for r in requests:
        for c in active:
            duration = math.ceil(r["bytes"] / c["rateBytesPerSec"])
            first = max(r["releaseAt"], c["start"]); last = min(r["deadline"], c["end"]) - duration
            if last < first: continue
            take = model.new_bool_var(r["id"] + "/" + c["id"])
            start = model.new_int_var(first, last, "s-" + r["id"] + "/" + c["id"])
            end = model.new_int_var(first + duration, last + duration, "e-" + r["id"] + "/" + c["id"])
            interval = model.new_optional_interval_var(start, duration, end, take, "i-" + r["id"] + "/" + c["id"])
            cost = math.ceil(r["bytes"] / 1e6) * c["pricePerMbUnits"]
            choices.append((r, c, take, start, end, cost)); intervals.append(interval); by_request[r["id"]].append(take)
    for values in by_request.values(): model.add(sum(values) <= 1)
    model.add_no_overlap(intervals)
    model.add(sum(x[2] * x[5] for x in choices) <= config["budgetUnits"])
    model.maximize(sum(x[2] * (x[0]["value"] * 1000000 - x[5]) for x in choices))
    solver = cp_model.CpSolver(); solver.parameters.num_search_workers = 1; solver.parameters.random_seed = config["seed"] % 2147483647; solver.parameters.max_time_in_seconds = 5
    status = solver.solve(model)
    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]: raise ValueError("SOLVER_NO_SOLUTION")
    awards = [{"requestId": r["id"], "contactId": c["id"], "station": c["station"], "start": solver.value(start), "end": solver.value(end), "bytes": r["bytes"], "scienceValue": r["value"], "costUnits": cost, "latencySec": c["latencySec"]} for r, c, take, start, end, cost in choices if solver.value(take)]
    awards.sort(key=lambda a: (a["start"], a["requestId"]))
    spent = sum(a["costUnits"] for a in awards)
    # First-come-first-served baseline using the same opportunities and constraints.
    baseline = []; left = config["budgetUnits"]; delivered = set(); free_at = 0
    for c in active:
        cursor = max(c["start"], free_at)
        for r in requests:
            cost = math.ceil(r["bytes"] / 1e6) * c["pricePerMbUnits"]
            start = max(cursor, r["releaseAt"]); end = start + math.ceil(r["bytes"] / c["rateBytesPerSec"])
            if r["id"] in delivered or cost > left or end > min(r["deadline"], c["end"]): continue
            baseline.append({"requestId":r["id"], "start":start, "end":end, "value":r["value"], "costUnits":cost})
            delivered.add(r["id"]); left -= cost; cursor = end; free_at = end
    # Validate the realized schedule independently of the optimizer's success code.
    valid = spent <= config["budgetUnits"] and len(set(a["requestId"] for a in awards)) == len(awards)
    for i, a in enumerate(awards):
        r = next(r for r in requests if r["id"] == a["requestId"]); c = next(c for c in active if c["id"] == a["contactId"])
        valid = valid and a["start"] >= max(r["releaseAt"], c["start"]) and a["end"] <= min(r["deadline"], c["end"]) and a["end"] - a["start"] >= math.ceil(a["bytes"] / c["rateBytesPerSec"]) and (i == 0 or awards[i-1]["end"] <= a["start"])
    if not valid: raise ValueError("SCHEDULE_INVARIANT")
    return {"engines": [{"name": "SGP4", "version": version("sgp4")}, {"name": "OR-Tools CP-SAT", "version": version("ortools")}], "sources": [source], "epochJulianDate": epoch, "contacts": contacts, "requests": requests, "awards": awards, "solverStatus": solver.status_name(status), "objectiveBound": solver.best_objective_bound, "objectiveValue": solver.objective_value, "scienceValue": sum(a["scienceValue"] for a in awards), "spentUnits": spent, "remainingUnits": config["budgetUnits"] - spent, "invariantsPassed": valid, "baseline": {"method":"first-come-first-served", "awards":baseline, "scienceValue":sum(a["value"] for a in baseline), "spentUnits":config["budgetUnits"]-left}}

def main():
    runtime = Path(sys.argv[1]).resolve()
    kind = sys.argv[2]
    config = json.loads(sys.stdin.read(4096))
    with contextlib.redirect_stdout(io.StringIO()):
        result = {"market": market}[kind](runtime, config)
    print(json.dumps(result, allow_nan=False, separators=(",", ":")))

if __name__ == "__main__":
    main()
