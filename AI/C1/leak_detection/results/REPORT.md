# AquaFlow leak detection — results
30 simulated households (SIMDEUM + loop sensor model), 180 injected anomalies. 6-fold cross-validation by household: every household is tested once by a model that never saw it. Values are mean ± standard deviation across folds; delays are medians in minutes. Alarm false-alarm budget when tuning: 0.05/day per alarm.
## Detectors compared
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| Random Forest | 99% ± 2% | 92% ± 4% | 0.08 ± 0.05 | 10 | 19 | 119/120 leaks, 55/60 bursts |
| Gradient boosting | 100% ± 0% | 90% ± 9% | 0.14 ± 0.08 | 9 | 23 | 120/120 leaks, 54/60 bursts |
| Isolation Forest (no labels) | 92% ± 7% | 75% ± 10% | 0.16 ± 0.04 | 59 | 33 | 111/120 leaks, 45/60 bursts |
| Current backend rules | 0% ± 0% | 0% ± 0% | 0.00 ± 0.00 | – | – | 0/120 leaks, 0/60 bursts |

## Ablation (Random Forest)
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| all features | 99% ± 2% | 92% ± 4% | 0.08 ± 0.05 | 10 | 19 | 119/120 leaks, 55/60 bursts |
| without time of day | 99% ± 2% | 90% ± 6% | 0.09 ± 0.04 | 9 | 18 | 119/120 leaks, 54/60 bursts |
| without time & flow level | 99% ± 2% | 92% ± 8% | 0.08 ± 0.04 | 30 | 19 | 119/120 leaks, 55/60 bursts |
| without house baseline | 100% ± 0% | 92% ± 4% | 0.09 ± 0.05 | 9 | 19 | 120/120 leaks, 55/60 bursts |

## By anomaly shape
```
              caught  total  median_delay_min  recall
type                                                 
burst             55     60              19.0    0.92
cistern_leak      38     39              26.0    0.97
growing_leak      39     39               6.0    1.00
steady_leak       42     42               9.0    1.00
```

## False alarms per day by routine
{"day": 0.072, "night_shift": 0.114}

## False alarms per day by household type
{"family": 0.1, "one_person": 0.076, "two_person": 0.062}

## Final model on other data
- **original single-household dataset**: micro-leaks 3/3, bursts 2/2, false alarms/day 0.00

Final alarm settings (threshold, minutes): {"micro_leak": [0.8, 2], "burst": [0.5, 20]}
