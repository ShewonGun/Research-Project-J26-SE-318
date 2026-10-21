# AquaFlow leak detection — results
30 simulated households (SIMDEUM + loop sensor model), 180 injected anomalies. 6-fold cross-validation by household: every household is tested once by a model that never saw it. Values are mean ± standard deviation across folds; delays are medians in minutes. Alarm false-alarm budget when tuning: 0.05/day per alarm.
## Detectors compared
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| Random Forest | 100% ± 0% | 82% ± 8% | 0.11 ± 0.05 | 20 | 19 | 120/120 leaks, 49/60 bursts |
| Gradient boosting | 100% ± 0% | 87% ± 12% | 0.12 ± 0.06 | 22 | 18 | 120/120 leaks, 52/60 bursts |
| Isolation Forest (no labels) | 83% ± 8% | 70% ± 14% | 0.11 ± 0.07 | 73 | 37 | 100/120 leaks, 42/60 bursts |
| Current backend rules | 0% ± 0% | 0% ± 0% | 0.00 ± 0.00 | – | – | 0/120 leaks, 0/60 bursts |

## Ablation (Gradient boosting)
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| all features | 100% ± 0% | 87% ± 12% | 0.12 ± 0.06 | 22 | 18 | 120/120 leaks, 52/60 bursts |
| without time of day | 100% ± 0% | 83% ± 8% | 0.10 ± 0.05 | 17 | 18 | 120/120 leaks, 50/60 bursts |
| without time & flow level | 100% ± 0% | 80% ± 6% | 0.14 ± 0.07 | 21 | 26 | 120/120 leaks, 48/60 bursts |
| without house baseline | 100% ± 0% | 87% ± 8% | 0.15 ± 0.13 | 18 | 18 | 120/120 leaks, 52/60 bursts |

## By anomaly shape
```
              caught  total  median_delay_min  recall
type                                                 
burst             52     60              17.5    0.87
cistern_leak      42     42              34.0    1.00
growing_leak      39     39              16.0    1.00
steady_leak       39     39              17.0    1.00
```

## False alarms per day by routine
{"day": 0.118, "night_shift": 0.105}

## False alarms per day by household type
{"family": 0.176, "one_person": 0.053, "two_person": 0.119}

## Final model on other data
- **original single-household dataset**: micro-leaks 3/3, bursts 1/2, false alarms/day 0.00

Final alarm settings (threshold, minutes): {"micro_leak": [0.7, 8], "burst": [0.98, 5]}
