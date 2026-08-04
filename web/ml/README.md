# AqOne marine hazard model

This folder contains the reproducible training pipeline and model card for the dashboard's experimental marine hazard classifier.

The model is a gradient-boosted decision-tree classifier trained on real historical weather and marine reanalysis for the three displayed sea sectors. Hazard labels combine NOAA IBTrACS tropical-cyclone proximity with conservative environmental proxy thresholds. The model does not predict verified vessel casualties and must not be used for navigation or emergency decisions.

## Data sources

- Open-Meteo Historical Weather API
- Open-Meteo Marine API using ERA5-Ocean
- NOAA IBTrACS v04r01 tropical-cyclone tracks
- GEBCO 2020 bathymetry accessed through OpenTopoData

The generated model card records the training dates, data hash, evaluation metrics, feature importance, label definition, and limitations.

## Retraining

Run `train_danger_zone_model.py` with a disposable cache directory, an output path for `dangerZoneModel.js`, and an output path for `model-card.json`. The training environment requires NumPy and scikit-learn.

Do not describe this model as validated until it has been retrained and independently tested with verified local incident outcomes, production AqOne buoy histories, and licensed AIS route data.
