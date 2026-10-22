const getSecurityStatus = (storagePercent) => {
  const percent = Number(storagePercent);

  if (percent <= 20) {
    return "Critical";
  }

  if (percent <= 40) {
    return "Warning";
  }

  return "Normal";
};

module.exports = {
  getSecurityStatus,
};