const express = require("express");
const router = express.Router();

const {
  getHouseholds,
  calculateHouseholdSecurity,
} = require("../controllers/householdController");

router.get("/", getHouseholds);
router.post("/calculate-security", calculateHouseholdSecurity);

module.exports = router;
