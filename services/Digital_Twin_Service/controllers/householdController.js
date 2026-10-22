const householdService = require("../services/householdService");
const { calculateStorage } = require("../services/storageService");
const { getSecurityStatus } = require("../services/securityService");

const getHouseholds = async (req, res) => {
  try {
    const households = await householdService.getHouseholds();

    res.status(200).json({
      success: true,
      count: households.length,
      data: households,
    });
  } catch (error) {
    console.error("Error getting households:", error);

    res.status(error.status || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const calculateHouseholdSecurity = async (req, res) => {
  try {
    const { householdId, previousStorage, inflow, consumption, tankCapacity } = req.body;

    if (
      previousStorage === undefined ||
      inflow === undefined ||
      consumption === undefined ||
      tankCapacity === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required calculation parameters: previousStorage, inflow, consumption, tankCapacity",
      });
    }

    const storageResult = calculateStorage({
      previousStorage,
      inflow,
      consumption,
      tankCapacity,
    });

    const securityStatus = getSecurityStatus(storageResult.storagePercent);

    return res.status(200).json({
      success: true,
      data: {
        householdId: householdId || null,
        tankCapacity: Number(tankCapacity),
        previousStorage: Number(previousStorage),
        inflow: Number(inflow),
        consumption: Number(consumption),
        estimatedStorage: storageResult.estimatedStorage,
        storagePercent: storageResult.storagePercent,
        securityStatus,
      },
    });
  } catch (error) {
    console.error("Error calculating household security:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to calculate household security",
    });
  }
};

module.exports = {
  getHouseholds,
  calculateHouseholdSecurity,
  getDigitalTwin: async (req, res) => {
    try {
      res.json({ success: true, data: await householdService.getDigitalTwin() });
    } catch (error) {
      console.error("C3 output loading failed:", error.message);
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },
};
