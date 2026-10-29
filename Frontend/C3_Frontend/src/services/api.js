const API_BASE_URL = import.meta.env.VITE_C3_API_URL || "http://localhost:5000/api/c3";

export const getDigitalTwin = async ({ signal } = {}) => {
  const response = await fetch(`${API_BASE_URL}/twin`, { signal });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "C3 outputs could not be loaded");
  return result.data;
};

export const getHouseholds = async () => {
  const response = await fetch(`${API_BASE_URL}/households`);

  if (!response.ok) {
    throw new Error(`Failed to fetch household data (${response.status})`);
  }

  const result = await response.json();
  return result.data || [];
};

export const calculateHouseholdSecurity = async ({
  householdId,
  previousStorage,
  inflow,
  consumption,
  tankCapacity,
}) => {
  const response = await fetch(`${API_BASE_URL}/households/calculate-security`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      householdId,
      previousStorage: Number(previousStorage),
      inflow: Number(inflow),
      consumption: Number(consumption),
      tankCapacity: Number(tankCapacity),
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Calculation request failed with status ${response.status}`);
  }

  const result = await response.json();
  return result.data;
};

export const getZoneSummary = async () => {
  return (await getDigitalTwin()).zones;
};
