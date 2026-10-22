const severity = { Critical: 0, Warning: 1, Normal: 2 };
const lowFirst = (value) => value == null ? Infinity : value;

function rankHouseholds(households) {
  return [...households].sort((a, b) =>
    (severity[a.SecurityStatus] ?? 3) - (severity[b.SecurityStatus] ?? 3)
    || lowFirst(a.EndOfDayStoragePercent) - lowFirst(b.EndOfDayStoragePercent)
    || a.HouseholdID.localeCompare(b.HouseholdID))
    .map((h, index) => ({ ...h, PriorityRank: index + 1 }));
}

function rankZones(zones) {
  return [...zones].sort((a, b) =>
    b.Critical - a.Critical || b.Warning - a.Warning
    || (b.AttentionHouseholds ?? -1) - (a.AttentionHouseholds ?? -1)
    || lowFirst(a.AverageStoragePercent) - lowFirst(b.AverageStoragePercent)
    || a.Zone.localeCompare(b.Zone))
    .map((z, index) => ({ ...z, PriorityRank: index + 1 }));
}

module.exports = { rankHouseholds, rankZones };
