const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const { rankHouseholds, rankZones } = require("./priorityService");
const DATA_ROOT = path.resolve(__dirname, "../../../AI/C3/data");
const FILES = {
  mapping: "network/C3_Household_Node_Mapping_PP1.csv",
  forecasts: "outputs/C3_Household_Demand_Forecasts.csv",
  storage: "outputs/C3_Household_Storage_Estimates_PP1.csv",
  security: "outputs/C3_Household_Water_Security_PP1.csv",
  zones: "outputs/C3_Zone_Water_Security_Summary_PP1.csv",
  history: "processed/C3_Household_Consumption_Cleaned.csv",
};
const STATUSES = ["Normal", "Warning", "Critical"];

function readCsv(filename, requiredHeaders) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const input = fs.createReadStream(filename);
    const parser = csv({
      strict: true,
      mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim(),
      mapValues: ({ value }) => value.trim(),
    });
    const fail = (error) => {
      input.destroy();
      parser.destroy();
      const wrapped = new Error(`Cannot read ${path.basename(filename)}: ${error.message}`);
      wrapped.status = 503;
      wrapped.code = error.code;
      reject(wrapped);
    };
    input.on("error", fail);
    parser.on("error", fail);
    parser.on("headers", (headers) => {
      const missing = requiredHeaders.filter((h) => !headers.includes(h));
      if (missing.length) fail(new Error(`Missing columns: ${missing.join(", ")}`));
    });
    parser.on("data", (row) => rows.push(row));
    parser.on("end", () => rows.length ? resolve(rows) : fail(new Error("CSV has no records")));
    input.pipe(parser);
  });
}

function number(value, label) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number in ${label}`);
  return parsed;
}

function indexRows(rows, key, label) {
  const index = new Map();
  for (const row of rows) {
    if (!row[key] || index.has(row[key])) throw new Error(`Missing or duplicate ${key} in ${label}`);
    index.set(row[key], row);
  }
  return index;
}

function buildDigitalTwin({ mapping, forecasts, storage, security, zones, history = [] }) {
  const registry = indexRows(mapping, "HouseholdID", "PP1 mapping");
  const indices = Object.fromEntries(Object.entries({ forecasts, storage, security })
    .map(([name, rows]) => [name, indexRows(rows, "HouseholdID", name)]));
  for (const [name, index] of Object.entries(indices)) {
    if (index.size !== registry.size || [...index.keys()].some((id) => !registry.has(id))) {
      throw new Error(`Household IDs in ${name} do not match the PP1 mapping`);
    }
  }
  const households = mapping.map((record) => {
    const id = record.HouseholdID;
    const forecast = indices.forecasts.get(id);
    const estimate = indices.storage.get(id);
    const assessment = indices.security.get(id);
    if (!forecast.ForecastDate || forecast.ForecastDate !== estimate.ForecastDate || forecast.ForecastDate !== assessment.ForecastDate) {
      throw new Error(`Forecast dates disagree for ${id}`);
    }
    for (const row of [forecast, estimate, assessment]) {
      for (const field of ["Zone", "DMA", "EPANET_Node", "TankCapacityLitres"]) {
        if (row[field] && record[field] && (field === "TankCapacityLitres"
          ? Number(row[field]) !== Number(record[field]) : row[field] !== record[field])) {
          throw new Error(`${field} disagrees with PP1 mapping for ${id}`);
        }
      }
    }
    const result = { ...record, TankCapacityLitres: number(record.TankCapacityLitres, id),
      ForecastDate: forecast.ForecastDate, LastObservedDate: forecast.LastObservedDate || null,
      SecurityStatus: assessment.SecurityStatus };
    if (!STATUSES.includes(result.SecurityStatus)) throw new Error(`Unknown SecurityStatus for ${id}`);
    for (const field of ["EnhancedXGBoostForecast", "MA3Forecast", "LastActualConsumption"]) {
      result[field] = number(forecast[field], `${id}.${field}`);
    }
    for (const field of ["PredictedDailyDemand_L", "HistoricalDailyInflowProxy_L", "EndOfDayEstimatedStorage_L", "EndOfDayStoragePercent", "MinimumEstimatedStorage_L", "InitialStorage_L", "TotalOverflow_L"]) {
      result[field] = number(estimate[field], `${id}.${field}`);
      const securityValue = number(assessment[field], `${id}.${field}`);
      if (securityValue != null && result[field] != null && Math.abs(securityValue - result[field]) > 0.000001) {
        throw new Error(`Storage/security output disagreement for ${id}.${field}`);
      }
    }
    const exportedForecast = number(estimate.EnhancedXGBoostForecast, id);
    if (exportedForecast != null && result.EnhancedXGBoostForecast != null && Math.abs(exportedForecast - result.EnhancedXGBoostForecast) > 0.000001) {
      throw new Error(`Forecast/storage output disagreement for ${id}`);
    }
    result.InflowProxySource = estimate.InflowProxySource || null;
    const percent = result.EndOfDayStoragePercent;
    if (percent != null && (percent < 0 || percent > 100)) throw new Error(`Storage percent outside 0–100 for ${id}`);
    // Status is consumed from the exported C3 assessment, never from pressure.
    return result;
  });
  const zoneIndex = indexRows(zones, "Zone", "zone summary");
  const zoneNames = [...new Set(households.map((h) => h.Zone))];
  if (zoneIndex.size !== zoneNames.length || zoneNames.some((z) => !zoneIndex.has(z))) throw new Error("Zone summary does not match household zones");
  const zoneStates = zoneNames.map((name) => {
    const members = households.filter((h) => h.Zone === name);
    const row = zoneIndex.get(name);
    const zone = { Zone: name };
    for (const field of ["HouseholdCount", "AverageStoragePercent", "MinimumStoragePercent", "AverageDailyDemand_L", "TotalDailyDemand_L", "Normal", "Warning", "Critical", "AttentionHouseholds", "AttentionPercent"]) zone[field] = number(row[field], `${name}.${field}`);
    if (zone.HouseholdCount !== members.length || STATUSES.some((s) => zone[s] !== members.filter((h) => h.SecurityStatus === s).length)) throw new Error(`Zone counts disagree for ${name}`);
    const available = members.map((h) => h.EndOfDayStoragePercent);
    if (available.every((v) => v != null) && zone.AverageStoragePercent != null && Math.abs(zone.AverageStoragePercent - available.reduce((a, b) => a + b, 0) / members.length) > 0.01) throw new Error(`Zone storage average disagrees for ${name}`);
    const dmas = [...new Set(members.map((h) => h.DMA).filter(Boolean))];
    return { ...zone, DMA: dmas.join(", ") || null,
      ForecastDates: [...new Set(members.map((h) => h.ForecastDate))].sort(),
      SecurityStatus: zone.Critical > 0 ? "Critical" : zone.Warning > 0 ? "Warning" : "Normal" };
  });
  const nodes = [...new Set(households.map((h) => h.EPANET_Node).filter(Boolean))].map((id) => ({
    EPANET_Node: id,
    HouseholdIDs: households.filter((h) => h.EPANET_Node === id).map((h) => h.HouseholdID),
  }));
  return {
    households, zones: zoneStates,
    summary: { MappedHouseholds: households.length,
      ...Object.fromEntries(STATUSES.map((s) => [s, households.filter((h) => h.SecurityStatus === s).length])),
      RepresentativeNodes: nodes.length, ForecastDates: [...new Set(households.map((h) => h.ForecastDate))].sort() },
    householdPriority: rankHouseholds(households), zonePriority: rankZones(zoneStates),
    network: { nodes, mappingSource: FILES.mapping, coordinatesAvailable: false },
    history: history.filter((h) => registry.has(h.HouseholdID)).map((h) => ({ HouseholdID: h.HouseholdID, Date: h.Date, Consumption: number(h.Consumption, "historical consumption") })),
    sources: FILES,
  };
}

async function getDigitalTwin(dataRoot = DATA_ROOT) {
  try {
    const specifications = { mapping: ["HouseholdID", "Zone", "EPANET_Node"], forecasts: ["HouseholdID", "ForecastDate", "EnhancedXGBoostForecast"], storage: ["HouseholdID", "ForecastDate", "EndOfDayEstimatedStorage_L", "EndOfDayStoragePercent"], security: ["HouseholdID", "ForecastDate", "SecurityStatus"], zones: ["Zone", "HouseholdCount", "AverageStoragePercent", ...STATUSES] };
    const tables = Object.fromEntries(await Promise.all(Object.entries(specifications).map(async ([key, headers]) => [key, await readCsv(path.join(dataRoot, FILES[key]), headers)])));
    const warnings = [];
    try { tables.history = await readCsv(path.join(dataRoot, FILES.history), ["HouseholdID", "Date", "Consumption"]); }
    catch (error) { warnings.push(error.message); tables.history = []; }
    return { ...buildDigitalTwin(tables), warnings };
  } catch (error) {
    error.status = 503;
    throw error;
  }
}

const getHouseholds = async () => (await getDigitalTwin()).households;
module.exports = { getHouseholds, getDigitalTwin, buildDigitalTwin, readCsv };
