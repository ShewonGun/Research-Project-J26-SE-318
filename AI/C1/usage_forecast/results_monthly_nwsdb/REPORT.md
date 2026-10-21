# Next-month usage forecast on real NWSDB bills

2919 bills from 105 households. Test: 1060 bills from 2025-09 on, each household tested once (6 folds); models never see the test households or any bill from the test period.

## Forecast accuracy (litres/day of the next bill)

```
            forecast  mae_lpd  mae_m3_month  wape_pct  median_ape_pct  coverage_80
          last month    155.4          4.72      20.7            11.8          NaN
      mean of last 3    155.0          4.71      20.6            12.2          NaN
same month last year    209.4          6.37      27.8            18.7          NaN
     12-month median    152.4          4.63      20.3            12.4          NaN
   gradient boosting    137.2          4.17      18.2            11.3        0.796
```
WAPE = total absolute error ÷ total actual use. mae_m3_month ≈ error in billed units (m³) for a 30-day month.

## Real seasonality (usage ÷ household median)

```
       median    q25    q75  bills
month                             
1       0.995  0.850  1.155    281
2       1.013  0.887  1.150    379
3       1.042  0.916  1.206    380
4       1.069  0.933  1.212    381
5       1.000  0.874  1.116    374
6       0.979  0.857  1.118    377
7       1.000  0.872  1.144    375
8       1.028  0.909  1.161    376
9       1.000  0.875  1.137    328
10      0.980  0.873  1.079    277
11      0.967  0.833  1.073    279
12      0.938  0.815  1.052    227
```

## Weather

Not run here: the weather archive could not be reached. Run this script on a machine with internet access to add the weather model and the weather-vs-usage fit.
