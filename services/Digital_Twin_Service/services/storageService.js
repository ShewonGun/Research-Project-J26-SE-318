const calculateStorage = ({
  previousStorage,
  inflow,
  consumption,
  tankCapacity,
}) => {
  let estimatedStorage =
    Number(previousStorage) +
    Number(inflow) -
    Number(consumption);

  estimatedStorage = Math.max(
    0,
    Math.min(estimatedStorage, Number(tankCapacity))
  );

  const storagePercent =
    (estimatedStorage / Number(tankCapacity)) * 100;

  return {
    estimatedStorage: Number(estimatedStorage.toFixed(2)),
    storagePercent: Number(storagePercent.toFixed(2)),
  };
};

module.exports = {
  calculateStorage,
};