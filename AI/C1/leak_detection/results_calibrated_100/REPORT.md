# AquaFlow leak detection — results
100 simulated households (SIMDEUM + loop sensor model), 600 injected anomalies. 6-fold cross-validation by household: every household is tested once by a model that never saw it. Values are mean ± standard deviation across folds; delays are medians in minutes. Alarm false-alarm budget when tuning: 0.05/day per alarm.
## Detectors compared
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| Random Forest | 100% ± 0% | 91% ± 5% | 0.10 ± 0.03 | 15 | 19 | 400/400 leaks, 181/200 bursts |
| Gradient boosting | 100% ± 0% | 92% ± 5% | 0.09 ± 0.02 | 19 | 18 | 400/400 leaks, 184/200 bursts |
| Isolation Forest (no labels) | 85% ± 3% | 64% ± 4% | 0.14 ± 0.06 | 66 | 36 | 342/400 leaks, 127/200 bursts |
| Current backend rules | 0% ± 0% | 0% ± 0% | 0.00 ± 0.00 | – | – | 0/400 leaks, 0/200 bursts |

## Ablation (Gradient boosting)
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| all features | 100% ± 0% | 92% ± 5% | 0.09 ± 0.02 | 19 | 18 | 400/400 leaks, 184/200 bursts |
| without time of day | 100% ± 0% | 92% ± 5% | 0.09 ± 0.03 | 17 | 19 | 400/400 leaks, 184/200 bursts |
| without time & flow level | 100% ± 0% | 83% ± 10% | 0.10 ± 0.03 | 19 | 23 | 400/400 leaks, 165/200 bursts |
| without house baseline | 100% ± 0% | 92% ± 5% | 0.10 ± 0.02 | 16 | 18 | 400/400 leaks, 183/200 bursts |

## By anomaly shape
```
              caught  total  median_delay_min  recall
type                                                 
burst            184    200              18.0    0.92
cistern_leak     151    151              31.0    1.00
growing_leak     132    132              15.0    1.00
steady_leak      117    117              17.0    1.00
```

## False alarms per day by routine
{"day": 0.094, "night_shift": 0.083}

## False alarms per day by household type
{"family": 0.11, "one_person": 0.085, "two_person": 0.082}

## Final model on other data
- **original single-household dataset**: micro-leaks 3/3, bursts 2/2, false alarms/day 0.00

Final alarm settings of the saved model (threshold, minutes): {"micro_leak": [0.9, 10], "burst": [0.7, 15]}

(The saved leak_model.joblib was rebuilt for numpy 1.26 after this report was written; the rebuild re-tuned the final alarms on the same tuning households, from {"micro_leak": [0.9, 15], "burst": [0.8, 15]}. The cross-validation results above are unchanged: each fold tunes its own alarms. `GET /health` on the model service shows the values in use.)
