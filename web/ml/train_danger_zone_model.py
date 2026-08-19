from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


SECTORS = [
    {"id": "new-washington-outer-bay", "name": "New Washington Outer Bay", "lat": 11.6845, "lng": 122.4475, "radius": 1550},
    {"id": "lagatik-offshore-corridor", "name": "Lagatik Offshore Corridor", "lat": 11.6975, "lng": 122.4215, "radius": 1250},
    {"id": "batan-channel-approach", "name": "Batan Channel Approach", "lat": 11.672, "lng": 122.476, "radius": 1800},
    {"id": "tambak-coastal-waters", "name": "Tambak Coastal Waters", "lat": 11.680, "lng": 122.414, "radius": 600},
    {"id": "poblacion-coastal-waters", "name": "Poblacion Coastal Waters", "lat": 11.666, "lng": 122.431, "radius": 600},
    {"id": "pinamuk-an-coastal-waters", "name": "Pinamuk-an Coastal Waters", "lat": 11.652, "lng": 122.448, "radius": 600},
    {"id": "ochando-coastal-waters", "name": "Ochando Coastal Waters", "lat": 11.638, "lng": 122.465, "radius": 600},
    {"id": "fatima-coastal-waters", "name": "Fatima Coastal Waters", "lat": 11.624, "lng": 122.482, "radius": 600},
]

SCAN_CANDIDATES = [
    {
        "id": f"aklan-offshore-{lat:.2f}-{lng:.2f}".replace(".", "-"),
        "name": f"Aklan Offshore {lat:.2f}\u00b0N, {lng:.2f}\u00b0E",
        "lat": lat,
        "lng": lng,
        "radius": 5500,
    }
    for lat in (11.64, 11.70, 11.76, 11.82, 11.88, 11.94, 12.00)
    for lng in (121.88, 121.98, 122.08, 122.18, 122.28, 122.38, 122.48, 122.58)
]

FEATURES = [
    "wind_speed_10m",
    "wind_gusts_10m",
    "precipitation",
    "weather_code",
    "wave_height",
    "wave_period",
    "depth_m",
    "month_sin",
    "month_cos",
]

OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_MARINE = "https://marine-api.open-meteo.com/v1/marine"
OPEN_TOPO_DATA = "https://api.opentopodata.org/v1/gebco2020"
IBTRACS_CSV = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.last3years.list.v04r01.csv"


def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "AqOne-Hazard-Model/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def cached_bytes(url: str, path: Path) -> bytes:
    if path.exists():
        return path.read_bytes()
    payload = request_bytes(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return payload


def cached_json(url: str, path: Path):
    return json.loads(cached_bytes(url, path))


def query_url(base: str, params: dict[str, str]) -> str:
    return base + "?" + urllib.parse.urlencode(params, safe=",")


def load_bathymetry(cache_dir: Path) -> tuple[list[dict], list[dict]]:
    candidates = SECTORS + SCAN_CANDIDATES
    locations = "|".join(f"{sector['lat']},{sector['lng']}" for sector in candidates)
    url = query_url(OPEN_TOPO_DATA, {"locations": locations})
    data = cached_json(url, cache_dir / "gebco2020-model-and-scan-v2.json")
    sectors = []
    scan_sectors = []
    for index, (sector, result) in enumerate(zip(candidates, data["results"], strict=True)):
        elevation = result.get("elevation")
        if index < len(SECTORS) and (elevation is None or elevation >= 0):
            raise ValueError(f"No ocean bathymetry returned for {sector['name']}")
        if elevation is None or elevation >= 0:
            continue
        enriched = {**sector, "depth_m": abs(float(elevation)), "bathymetry_dataset": result["dataset"]}
        if index < len(SECTORS):
            sectors.append(enriched)
        else:
            scan_sectors.append(enriched)
    if not scan_sectors:
        raise ValueError("No offshore GEBCO scan cells were returned")
    return sectors, scan_sectors


def load_weather(cache_dir: Path, start_date: str, end_date: str):
    params = {
        "latitude": ",".join(str(sector["lat"]) for sector in SECTORS),
        "longitude": ",".join(str(sector["lng"]) for sector in SECTORS),
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "wind_speed_10m,wind_gusts_10m,precipitation,weather_code",
        "cell_selection": "sea",
        "timezone": "UTC",
    }
    return cached_json(query_url(OPEN_METEO_ARCHIVE, params), cache_dir / f"weather-new-washington-grid-v2-{start_date}-{end_date}.json")


def load_marine(cache_dir: Path, start_date: str, end_date: str):
    params = {
        "latitude": ",".join(str(sector["lat"]) for sector in SECTORS),
        "longitude": ",".join(str(sector["lng"]) for sector in SECTORS),
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "wave_height,wave_period",
        "models": "era5_ocean",
        "timezone": "UTC",
    }
    return cached_json(query_url(OPEN_METEO_MARINE, params), cache_dir / f"marine-new-washington-grid-v2-{start_date}-{end_date}.json")


def parse_number(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def load_ibtracs(cache_dir: Path, start_year: int, end_year: int):
    path = cache_dir / "ibtracs.last3years.list.v04r01.csv"
    payload = cached_bytes(IBTRACS_CSV, path)
    rows_by_hour = defaultdict(list)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            iso_time = row.get("ISO_TIME", "")
            try:
                observed_at = datetime.strptime(iso_time, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if not start_year <= observed_at.year <= end_year:
                continue
            lat = parse_number(row.get("LAT"))
            lng = parse_number(row.get("LON"))
            if lat is None or lng is None or not (0 <= lat <= 30 and 105 <= lng <= 135):
                continue
            wind_values = [
                parse_number(row.get("WMO_WIND")),
                parse_number(row.get("USA_WIND")),
                parse_number(row.get("TOKYO_WIND")),
                parse_number(row.get("JTWC_WIND")),
            ]
            wind_kt = max((value for value in wind_values if value is not None), default=0)
            rounded = observed_at.replace(minute=0, second=0, microsecond=0)
            rows_by_hour[rounded].append((lat, lng, wind_kt))
    return rows_by_hour, hashlib.sha256(payload).hexdigest()


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    to_rad = math.pi / 180
    d_lat = (b_lat - a_lat) * to_rad
    d_lng = (b_lng - a_lng) * to_rad
    value = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * to_rad) * math.cos(b_lat * to_rad) * math.sin(d_lng / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def cyclone_hazard(rows_by_hour, observed_at: datetime, lat: float, lng: float) -> bool:
    for offset in range(-3, 4):
        hour = observed_at + timedelta(hours=offset)
        for storm_lat, storm_lng, wind_kt in rows_by_hour.get(hour, []):
            if wind_kt >= 34 and haversine_km(lat, lng, storm_lat, storm_lng) <= 350:
                return True
    return False


def hourly_value(hourly: dict, name: str, index: int) -> float | None:
    value = hourly.get(name, [None])[index]
    return None if value is None else float(value)


def build_dataset(sectors: list[dict], weather, marine, storm_rows):
    weather_locations = weather if isinstance(weather, list) else [weather]
    marine_locations = marine if isinstance(marine, list) else [marine]
    samples = []
    labels = []
    timestamps = []
    label_counts = {"cyclone": 0, "observed_conditions": 0}

    for sector, weather_location, marine_location in zip(sectors, weather_locations, marine_locations, strict=True):
        weather_hourly = weather_location["hourly"]
        marine_hourly = marine_location["hourly"]
        marine_index = {timestamp: index for index, timestamp in enumerate(marine_hourly["time"])}
        for weather_index in range(0, len(weather_hourly["time"]), 3):
            timestamp = weather_hourly["time"][weather_index]
            if timestamp not in marine_index:
                continue
            wave_index = marine_index[timestamp]
            values = {
                "wind_speed_10m": hourly_value(weather_hourly, "wind_speed_10m", weather_index),
                "wind_gusts_10m": hourly_value(weather_hourly, "wind_gusts_10m", weather_index),
                "precipitation": hourly_value(weather_hourly, "precipitation", weather_index),
                "weather_code": hourly_value(weather_hourly, "weather_code", weather_index),
                "wave_height": hourly_value(marine_hourly, "wave_height", wave_index),
                "wave_period": hourly_value(marine_hourly, "wave_period", wave_index),
            }
            if any(value is None for value in values.values()):
                continue
            observed_at = datetime.fromisoformat(timestamp).replace(tzinfo=timezone.utc)
            cyclone = cyclone_hazard(storm_rows, observed_at, sector["lat"], sector["lng"])
            observed_hazard = (
                values["wave_height"] >= 2.0
                or values["wind_gusts_10m"] >= 40
                or values["wind_speed_10m"] >= 30
                or values["weather_code"] >= 95
            )
            if cyclone:
                label_counts["cyclone"] += 1
            if observed_hazard:
                label_counts["observed_conditions"] += 1
            angle = 2 * math.pi * (observed_at.month - 1) / 12
            feature_values = {
                **values,
                "depth_m": sector["depth_m"],
                "month_sin": math.sin(angle),
                "month_cos": math.cos(angle),
            }
            samples.append([feature_values[name] for name in FEATURES])
            labels.append(int(cyclone or observed_hazard))
            timestamps.append(observed_at)

    return np.asarray(samples, dtype=float), np.asarray(labels, dtype=int), np.asarray(timestamps), label_counts


def metrics_for(model, x_test, y_test):
    probabilities = model.predict_proba(x_test)[:, 1]
    predictions = probabilities >= 0.5
    matrix = confusion_matrix(y_test, predictions, labels=[0, 1])
    return {
        "roc_auc": round(float(roc_auc_score(y_test, probabilities)), 4),
        "average_precision": round(float(average_precision_score(y_test, probabilities)), 4),
        "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, predictions, zero_division=0)), 4),
        "brier": round(float(brier_score_loss(y_test, probabilities)), 4),
        "confusion_matrix": matrix.tolist(),
    }


def export_model(model, sectors, scan_sectors, metadata, output_path: Path):
    trees = []
    for estimator in model.estimators_[:, 0]:
        tree = estimator.tree_
        trees.append({
            "children_left": tree.children_left.tolist(),
            "children_right": tree.children_right.tolist(),
            "feature": tree.feature.tolist(),
            "threshold": [round(float(value), 8) for value in tree.threshold],
            "value": [round(float(value), 10) for value in tree.value[:, 0, 0]],
        })
    base_raw = float(model._raw_predict_init(np.zeros((1, len(FEATURES))))[0, 0])
    artifact = {
        "schema_version": 1,
        "model_id": "aqone-marine-hazard-gbdt",
        "version": "2026.08.04-new-washington-grid-v2",
        "model_type": "GradientBoostingClassifier",
        "features": FEATURES,
        "sectors": sectors,
        "scan_sectors": scan_sectors,
        "ensemble": {
            "learning_rate": model.learning_rate,
            "base_raw_score": base_raw,
            "trees": trees,
        },
        "metadata": metadata,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("window.AqOneDangerZoneModel = " + json.dumps(artifact, separators=(",", ":")) + ";\n", encoding="utf-8")
    return artifact


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-card", type=Path, required=True)
    parser.add_argument("--start-date", default="2023-08-01")
    parser.add_argument("--end-date", default="2025-12-31")
    args = parser.parse_args()

    sectors, scan_sectors = load_bathymetry(args.cache_dir)
    weather = load_weather(args.cache_dir, args.start_date, args.end_date)
    marine = load_marine(args.cache_dir, args.start_date, args.end_date)
    storm_rows, ibtracs_sha256 = load_ibtracs(args.cache_dir, int(args.start_date[:4]), int(args.end_date[:4]))
    x, y, timestamps, label_counts = build_dataset(sectors, weather, marine, storm_rows)

    split_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    train_mask = timestamps < split_at
    test_mask = ~train_mask
    x_train, y_train = x[train_mask], y[train_mask]
    x_test, y_test = x[test_mask], y[test_mask]
    class_counts = np.bincount(y_train, minlength=2)
    sample_weight = np.where(y_train == 1, len(y_train) / (2 * class_counts[1]), len(y_train) / (2 * class_counts[0]))

    model = GradientBoostingClassifier(
        n_estimators=90,
        learning_rate=0.06,
        max_depth=2,
        min_samples_leaf=30,
        subsample=0.85,
        random_state=42,
    )
    model.fit(x_train, y_train, sample_weight=sample_weight)
    metrics = metrics_for(model, x_test, y_test)
    feature_importance = sorted(
        ({"feature": feature, "importance": round(float(importance), 6)} for feature, importance in zip(FEATURES, model.feature_importances_, strict=True)),
        key=lambda item: item["importance"],
        reverse=True,
    )
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_period": {"start": args.start_date, "end": args.end_date},
        "train_rows": int(train_mask.sum()),
        "test_rows": int(test_mask.sum()),
        "positive_rows": int(y.sum()),
        "label_counts": label_counts,
        "metrics": metrics,
        "feature_importance": feature_importance,
        "label_definition": "NOAA IBTrACS tropical cyclone within 350 km at >=34 kt, or observed wave >=2.0 m, gust >=40 km/h, wind >=30 km/h, or WMO thunderstorm code >=95",
        "limitations": [
            "Hazard labels are environmental proxies, not verified local casualty or vessel-incident outcomes.",
            "No historical AIS route or production AqOne buoy time series was available in the repository.",
            "GEBCO depth and global forecast grids are not suitable for coastal navigation.",
        ],
        "sources": [
            {"name": "Open-Meteo Historical Weather API", "url": "https://open-meteo.com/en/docs/historical-weather-api"},
            {"name": "Open-Meteo Marine API / ERA5-Ocean", "url": "https://open-meteo.com/en/docs/marine-weather-api"},
            {"name": "NOAA IBTrACS v04r01", "url": "https://www.ncei.noaa.gov/products/international-best-track-archive", "sha256": ibtracs_sha256},
            {"name": "GEBCO 2020 via OpenTopoData", "url": "https://www.opentopodata.org/datasets/gebco2020/"},
        ],
    }
    artifact = export_model(model, sectors, scan_sectors, metadata, args.output)
    args.model_card.parent.mkdir(parents=True, exist_ok=True)
    args.model_card.write_text(json.dumps({key: artifact[key] for key in ("model_id", "version", "model_type", "features", "sectors", "scan_sectors", "metadata")}, indent=2), encoding="utf-8")
    print(json.dumps({"version": artifact["version"], "metrics": metrics, "rows": len(y), "positives": int(y.sum()), "class_counts": class_counts.tolist()}, indent=2))


if __name__ == "__main__":
    main()
