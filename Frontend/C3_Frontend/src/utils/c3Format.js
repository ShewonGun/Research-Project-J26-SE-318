export const formatValue = (value, digits = 2, suffix = "") =>
  value != null && value !== "" && Number.isFinite(Number(value))
    ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}${suffix}`
    : "Not available";

export const statusRisk = (status) => ({ Normal: "Low", Warning: "Medium", Critical: "High" })[status] || "Pending";
// Colours describe average storage only, not the security of every household.
export const storageRisk = (percentage) => {
  if (percentage == null || !Number.isFinite(Number(percentage))) return "Pending";
  if (Number(percentage) <= 20) return "High";
  if (Number(percentage) <= 40) return "Medium";
  return "Low";
};
