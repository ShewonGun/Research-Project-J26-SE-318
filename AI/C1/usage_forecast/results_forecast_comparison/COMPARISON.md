# Daily forecast: current vs NWSDB-calibrated training data

Test: 30 unseen calibrated households (H71–H100), last 21 days of origins, 3,780 forecasts (1–7 days ahead). 80 % ranges set on validation households H61–H70. Calibrated-model rows are means over 3 random draws of training households (1 draw at 60).

```
                         forecast  train_households  mae_lpd  wape_pct  mae_h1  mae_h7  week_total_wape_pct  coverage_80
same weekday last week (baseline)                 0    103.0      44.0   102.6   103.0                 22.5        0.692
   mean of last 7 days (baseline)                 0     82.9      35.4    77.3    84.6                 22.5        0.678
    CURRENT model (original data)                30     73.1      31.2    64.6    77.2                 18.4        0.680
 calibrated model (10 households)                10     77.1      32.9    70.1    81.6                 19.5        0.695
 calibrated model (20 households)                20     74.2      31.7    66.2    78.6                 19.2        0.705
 calibrated model (30 households)                30     73.5      31.4    66.2    77.2                 18.5        0.686
 calibrated model (60 households)                60     72.3      30.9    64.7    76.3                 18.4        0.681
```

## Check on the original households (H21–H30)

```
                      forecast  mae_lpd  wape_pct  mae_h1  mae_h7  week_total_wape_pct  coverage_80
   trained on original H01–H15     49.8      40.4    46.1    50.6                 28.3        0.778
 trained on calibrated H31–H60     49.0      39.8    43.8    50.7                 27.2        0.767
mean of last 7 days (baseline)     55.5      45.0    48.5    60.7                 33.9        0.726
```

Daily usage: {"original": {"median_litres_per_day": 112.8, "day_to_day_cv_median": 0.499}, "calibrated": {"median_litres_per_day": 237.8, "day_to_day_cv_median": 0.444}}
