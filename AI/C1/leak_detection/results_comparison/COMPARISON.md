# Original vs calibrated simulation — leak detector comparison
Model: rf, features: no_baseline, false-alarm budget 0.05/day per alarm. Same 30 households and the same 6 folds; mean ± sd across folds; delays are medians (minutes).

## 1. Realism — litres/day per household
| source | p10 | p25 | median | p75 | p90 |
|---|---|---|---|---|---|
| Real NWSDB households | 235.0 | 387.0 | 593.0 | 806.0 | 1106.0 |
| Original simulation | 124.0 | 158.0 | 259.0 | 340.0 | 405.0 |
| Calibrated simulation | 247.0 | 382.0 | 600.0 | 833.0 | 1005.0 |

Share of normal minutes with water flowing (loop scale): {"original": 0.056, "calibrated": 0.119}

## 2. Cross-evaluation
| setting | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught |
|---|---|---|---|---|---|---|
| trained on original → tested on calibrated | 100% ± 0% | 82% ± 12% | 0.82 ± 0.72 | 10.0 | 19.0 | 120/120 leaks, 49/60 bursts |
| trained on calibrated → tested on calibrated | 100% ± 0% | 83% ± 5% | 0.13 ± 0.09 | 18.5 | 17.5 | 120/120 leaks, 50/60 bursts |
| trained on original → tested on original | 100% ± 0% | 87% ± 10% | 0.08 ± 0.04 | 9.0 | 19.0 | 120/120 leaks, 52/60 bursts |
| trained on calibrated → tested on original | 100% ± 0% | 88% ± 8% | 0.06 ± 0.03 | 16.0 | 17.0 | 120/120 leaks, 53/60 bursts |

## 3. Held-out seeds (loop single-household simulator)
| setting | micro_leaks | bursts | false_alarms_per_day | micro_leak_delay_min | burst_delay_min |
|---|---|---|---|---|---|
| trained on original → held-out seeds (8) | 24/24 | 15/16 | 0.0 | 8.0 | 20.0 |
| trained on calibrated → held-out seeds (8) | 24/24 | 16/16 | 0.048 | 10.5 | 16.5 |

Final alarm settings: {"original": {"alarms": {"micro_leak": [0.8, 2], "burst": [0.6, 20]}}, "calibrated": {"alarms": {"micro_leak": [0.7, 5], "burst": [0.8, 10]}}}
