const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { getDigitalTwin, buildDigitalTwin, readCsv } = require("../services/householdService");
const { rankHouseholds, rankZones } = require("../services/priorityService");
const dataRoot = path.resolve(__dirname, "../../../AI/C3/data");
const files = {
  mapping: "network/C3_Household_Node_Mapping_PP1.csv",
  forecasts: "outputs/C3_Household_Demand_Forecasts.csv",
  storage: "outputs/C3_Household_Storage_Estimates_PP1.csv",
  security: "outputs/C3_Household_Water_Security_PP1.csv",
  zones: "outputs/C3_Zone_Water_Security_Summary_PP1.csv",
};
const tables = Promise.all(Object.entries(files).map(async ([key, filename]) => [key, await readCsv(path.join(dataRoot, filename), [])])).then(Object.fromEntries);

test("current PP1 exports reconcile and preserve zero storage", async () => {
  const result = await getDigitalTwin();
  assert.deepEqual([result.summary.MappedHouseholds, result.summary.Normal, result.summary.Warning, result.summary.Critical, result.summary.RepresentativeNodes], [99, 97, 1, 1, 19]);
  assert.equal(result.history.length, 1782);
  assert.deepEqual(result.householdPriority.slice(0, 2).map((h) => h.HouseholdID), ["H049", "H050"]);
  assert.equal(result.householdPriority[0].EndOfDayStoragePercent, 0);
  assert.equal(result.zonePriority[0].Zone, "Zone B");
  assert.equal(result.zones.find((z) => z.Zone === "Zone A").AverageStoragePercent.toFixed(2), "92.17");
  assert.equal(result.zones.find((z) => z.Zone === "Zone B").AverageStoragePercent.toFixed(2), "87.28");
  assert.deepEqual(result.summary.ForecastDates, ["2026-09-01", "2026-10-01"]);
});

test("ranking responds to arbitrary IDs, statuses and storage rather than fixed households/zones", () => {
  const ranked = rankHouseholds([
    { HouseholdID: "sample-b", SecurityStatus: "Normal", EndOfDayStoragePercent: 0 },
    { HouseholdID: "sample-z", SecurityStatus: "Warning", EndOfDayStoragePercent: 30 },
    { HouseholdID: "sample-a", SecurityStatus: "Warning", EndOfDayStoragePercent: 25 },
    { HouseholdID: "sample-q", SecurityStatus: "Critical", EndOfDayStoragePercent: null },
  ]);
  assert.deepEqual(ranked.map((h) => h.HouseholdID), ["sample-q", "sample-a", "sample-z", "sample-b"]);
  const zones = [
    { Zone: "First", Critical: 0, Warning: 2, AttentionHouseholds: 2, AverageStoragePercent: 10 },
    { Zone: "Second", Critical: 1, Warning: 0, AttentionHouseholds: 1, AverageStoragePercent: 90 },
  ];
  assert.equal(rankZones(zones)[0].Zone, "Second");
  assert.equal(rankZones(zones.map((z) => ({ ...z, Critical: 0, Warning: 0, AttentionHouseholds: 0 })))[0].Zone, "First");
});

test("optional values remain unavailable rather than becoming zero", async () => {
  const input = structuredClone(await tables);
  input.storage[0].HistoricalDailyInflowProxy_L = "";
  input.security[0].HistoricalDailyInflowProxy_L = "";
  input.storage[0].InflowProxySource = "";
  const result = buildDigitalTwin(input);
  assert.equal(result.households[0].HistoricalDailyInflowProxy_L, null);
  assert.equal(result.households[0].InflowProxySource, null);
});

test("rejects duplicate IDs, missing households, inconsistent dates, summaries and storage", async () => {
  for (const mutate of [
    (x) => x.forecasts.push(x.forecasts[0]),
    (x) => x.security.pop(),
    (x) => { x.storage[0].ForecastDate = "2099-01-01"; },
    (x) => { x.zones[0].Normal = "0"; },
    (x) => { x.security[0].EndOfDayStoragePercent = "5"; },
  ]) {
    const input = structuredClone(await tables);
    mutate(input);
    assert.throws(() => buildDigitalTwin(input));
  }
});

test("missing required CSV fails explicitly; absent optional history returns a warning", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "c3-pp1-"));
  await assert.rejects(getDigitalTwin(fixture), (e) => e.status === 503 && /Cannot read/.test(e.message));
  for (const filename of Object.values(files)) {
    await fs.mkdir(path.dirname(path.join(fixture, filename)), { recursive: true });
    await fs.copyFile(path.join(dataRoot, filename), path.join(fixture, filename));
  }
  const result = await getDigitalTwin(fixture);
  assert.equal(result.history.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.households.length, 99);
  // Fixtures are written only to the OS temporary directory, never project data.
});

test("HTTP snapshot and registry work; internal calculator remains available", async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ["server.js"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Backend startup timeout")), 10000);
      child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
      child.once("error", (e) => { clearTimeout(timer); reject(e); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Backend exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}/api/c3`;
    const response = await fetch(`${base}/twin`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.summary.Normal, 97);
    const registry = await (await fetch(`${base}/households`)).json();
    assert.equal(registry.count, 99);
    assert.ok(registry.data.every((h) => h.SecurityStatus && h.ForecastDate));
    const calculation = await fetch(`${base}/households/calculate-security`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previousStorage: 200, inflow: 100, consumption: 50, tankCapacity: 500 }) });
    assert.equal(calculation.status, 200);
    assert.equal((await calculation.json()).data.estimatedStorage, 250);
  } finally { child.kill(); }
});
