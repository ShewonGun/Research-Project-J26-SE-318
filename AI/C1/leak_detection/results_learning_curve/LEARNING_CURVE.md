# Learning curve — calibrated households
Test: 20 households (H80–H99, 120 anomalies), never trained on. Validation (alarm tuning): H70–H79. Model rf, features no_baseline, budget 0.05/day per alarm. Mean over draws (min–max in the chart).

```
                  draws  micro_leak_recall  burst_recall  burst_recall_min  burst_recall_max  false_alarms_per_day  fa_min  fa_max  micro_leak_delay_min  burst_delay_min
train_households                                                                                                                                                         
10                    3                1.0         0.842             0.800             0.875                 0.094   0.081   0.102                28.000           20.667
20                    3                1.0         0.833             0.775             0.900                 0.095   0.076   0.117                23.667           19.000
30                    3                1.0         0.850             0.800             0.875                 0.087   0.076   0.095                24.333           18.500
50                    3                1.0         0.875             0.850             0.900                 0.071   0.067   0.076                23.167           19.333
70                    1                1.0         0.950             0.950             0.950                 0.095   0.095   0.095                21.500           17.000
```
