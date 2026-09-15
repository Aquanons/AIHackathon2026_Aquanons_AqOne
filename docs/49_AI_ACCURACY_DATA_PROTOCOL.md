# 49 — AI Accuracy and Data Protocol

> **Status:** Frozen baseline protocol for Phase 1 and Phase 2 preparation.  
> **Prepared:** 2026-09-15.  
> **Applicability:** All AI, simulation, statistical, and advisory services across backend, mobile, web, and firmware.

---

## 1. Operating Domain and Boundary (D1)

### 1.1 Named Geographic Domain
- **Primary Operational Area:** New Washington and Batan Estuary / Bay coastal waters, Aklan Province, Philippines.
- **Bounding Box:** 11.60°N to 11.75°N, 122.40°E to 122.55°E.
- **Named Local Sectors:**
  - New Washington Outer Bay (11.6845°N, 122.4475°E)
  - Lagatik Offshore Corridor (11.6975°N, 122.4215°E)
  - Batan Channel Approach (11.6720°N, 122.4760°E)
  - Tambak Coastal Waters (11.6800°N, 122.4140°E)
  - Poblacion Coastal Waters (11.6660°N, 122.4310°E)
  - Pinamuk-an Coastal Waters (11.6520°N, 122.4480°E)
  - Ochando Coastal Waters (11.6380°N, 122.4650°E)
  - Fatima Coastal Waters (11.6240°N, 122.4820°E)

### 1.2 Target Vessel Classes
- Small non-motorized outrigger bancas (< 5 metres length).
- Small motorized outrigger bancas (pumpboats with single-cylinder gasoline/diesel engine, < 3 GT, length 6-10 metres).
- These vessels have low freeboard (< 0.5 m) and are sensitive to steep wind-chop (> 1.0 m) and breaking swell (> 1.5 m).

### 1.3 Climatological Context
- **Amihan (Northeast Monsoon):** November to April; dominant winds from NE/E, persistent coastal swell.
- **Habagat (Southwest Monsoon):** June to October; prevailing SW winds, frequent convective squalls and tropical cyclone passages.
- **Inter-monsoon transitions:** May and October-November; localized thermal convective squalls.

---

## 2. Communications and Observation Time Semantics (D2, D4)

### 2.1 Five Distinct Timestamps
To prevent future leakage in historical replay and preserve honest delivery accounting, the system strictly separates:

1. **Observation Time (`observed_at`):**
   The instant the physical phenomenon occurred or the sensor took the measurement.
2. **Position-Fix Time (`fix_at` / `client_ts`):**
   The instant the GNSS fix was acquired on the mobile device or buoy, independent of when it was transmitted.
3. **Forecast Valid Interval (`valid_start`, `valid_end`):**
   The interval over which a meteorological forecast applies (e.g. preceding-hour gust maximum or instantaneous wave sample).
4. **Receipt Time (`created_at` / `first_seen_at`):**
   The instant the backend database recorded the packet after crossing gateway/mesh transport.
5. **Decision Time (`as_of`):**
   The cutoff instant for an evaluation, query, or decision.
   No data with `created_at > as_of` or `observed_at > as_of` may be inspected during historical replay.

### 2.2 Warning and Downlink Hierarchy
- Official MDRRMO sea condition declarations and PAGASA gale warnings take absolute precedence over model outputs.
- Model advisories are explicitly labeled as informational guidance; they never issue automatic forced return deadlines or fabricate safe return routes.

---

## 3. Physical Hazard Targets and Decision Cutoffs (D3)

### 3.1 Single-Condition Exceedance Target (Hazard / Danger)
An environmental hazard is declared at a monitoring sector if any of the following physical thresholds is exceeded:
- Wind gusts >= 40.0 km/h (approx 22 knots).
- Sustained wind speed >= 30.0 km/h (approx 16 knots).
- Significant wave height >= 2.0 metres.
- Recognized convective storm code (WMO codes 95, 96, 99: thunderstorms).

### 3.2 Caution Thresholds
Conditions require caution when:
- Wind gusts >= 30.0 km/h or sustained wind >= 24.0 km/h.
- Significant wave height >= 1.4 metres.
- Heavy rain (precipitation >= 5.0 mm/h or daily rainfall >= 20.0 mm).
- Poor visibility (fog or dense drizzle).

### 3.3 Target Alignment
- Machine learning classifiers and browser predictors must evaluate against the exact same exceedance target.
- Communication health (such as buoy signal quality or offline status) is a telemetry diagnostic and must never inflate physical weather hazard probability.
- Mean wind and wind gusts must be reported with distinct units and labels; mean wind must never be labeled as "gusts".

---

## 4. Trip and Contact Monitoring Lifecycle (D5)

### 4.1 Trip States
- **Open:** Vessel has active contacts or an open voyage; departure time may be known or unknown.
- **Expected Return / Check-in:** Voluntary or scheduled expectation agreed with family or responders.
- **Returned Confirmed:** Vessel presence verified at landing port.
- **Safe Reported:** Fisher submitted self-reported safe status.
- **Contact Overdue:** Expected contact interval lapsed with no received packet; subject to network opportunity context.
- **Unaccounted For (Verification Pending):** Missed return deadline or escalated anomaly awaiting responder verification.

### 4.2 Handling Incomplete Evidence
- Silence on the mesh does not automatically mean distress (it may be a shadow zone or battery depletion).
- Shared network outages (e.g. gateway disconnection) must not erase outstanding overdue return obligations.
- Replaying trips chronologically must only use historical completed normal trips available before `as_of`.

---

## 5. Physical Drift Datum and Environmental Support (D6, D7)

### 5.1 Physical Datum Definition
- The initial datum for search and rescue (SAR) drift simulation is:
  - Latitude, longitude of the qualified position fix.
  - Fix timestamp (`client_ts` from SOS or `observed_at` from last verified buoy contact).
- Server receipt time (`created_at`) must NOT be used as the datum time when device `client_ts` is available.
- If the position fix is older than 60 minutes, datum uncertainty must be explicitly increased.

### 5.2 Environmental Support and Synthetic Exclusion
- Real responder-opened cases require qualified real observations and non-degraded wind forecasts (`allow_synthetic=False`).
- If buoy current observations are unavailable or fail the geometry check (< 2 buoys within 111 km), the system returns `insufficient_environmental_data`.
- It must NEVER silently fall back to synthetic equations for a real incident.
- Whole-run support must be tracked across every simulation particle step:
  $$\text{Observed Coverage} = \frac{\sum \text{observed particle-steps}}{\sum \text{total particle-steps}}$$
- A real incident with insufficient environmental data remains open and reviewable on the dashboard; its prior and posterior grids are `None`.

---

## 6. Model Output Classification and Wording

| Component | Technical Class | Operational Status | Public Wording Rule |
|---|---|---|---|
| Squall Nowcasting | Pattern recognition & plane-wave fit | Research signal (uncalibrated) | "Research squall pattern detector"; do not claim field-calibrated probability |
| Trip Anomaly | Statistical interval profile & rule | Verification support | "Overdue contact review"; do not claim distress probability |
| Drift Prediction | Monte Carlo physics advection | Conditional physical simulation | "Estimated drift distribution conditional on buoy currents"; do not claim validated containment |
| Danger Zone | Transparent exceedance rules | Environmental advisory | "Marine weather threshold advisory"; do not claim disaster prediction |
| Catch Aggregation | Spatial binning & privacy capping | Aggregated activity surface | "Relative reported catch activity"; do not claim fish abundance or biomass |
| Fishing Window | Deterministic horizon scanner | Weather preparation estimate | "Approximate time until forecast deterioration"; require assessable present interval |
| Buoy Current | Vector and scalar aggregation | Telemetry summary | Report both scalar speed and vector velocity, with oldest and newest timestamps |
