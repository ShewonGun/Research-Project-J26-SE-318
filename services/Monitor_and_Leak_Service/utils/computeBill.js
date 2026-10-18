// Compute a postpaid bill from metered consumption and a rising-block tariff.
//
// Consumption (litres) is converted to units and charged MARGINALLY: each block
// only prices the portion of usage that falls inside it, then a flat service
// charge is added. Returns the total plus a per-block breakdown for the UI.
//
//   computeBill(12500, tariff)  // 12.5 units
//     → { units: 12.5, usageCharge, fixedCharge, amount, breakdown: [...] }
export const computeBill = (liters, tariff) => {
    const unitLiters = tariff?.unitLiters || 1000;
    const fixedCharge = tariff?.fixedCharge || 0;
    const units = Math.max(0, (liters || 0) / unitLiters);

    // Ascending by upper bound; null (open-ended) always sorts last.
    const tiers = [...(tariff?.tiers || [])].sort(
        (a, b) => (a.maxUnits ?? Infinity) - (b.maxUnits ?? Infinity)
    );

    const breakdown = [];
    let usageCharge = 0;
    let lower = 0; // lower bound of the current block, in units

    for (const tier of tiers) {
        if (units <= lower) break;
        const upper = tier.maxUnits ?? Infinity;
        const blockUnits = Math.min(units, upper) - lower;
        if (blockUnits > 0) {
            const cost = blockUnits * tier.rate;
            usageCharge += cost;
            breakdown.push({
                from: lower,
                to: upper === Infinity ? null : upper,
                units: round2(blockUnits),
                rate: tier.rate,
                cost: round2(cost),
            });
        }
        lower = upper;
    }

    return {
        units: round2(units),
        usageCharge: round2(usageCharge),
        fixedCharge,
        amount: round2(usageCharge + fixedCharge),
        breakdown,
    };
};

const round2 = (n) => Math.round(n * 100) / 100;

export default computeBill;
