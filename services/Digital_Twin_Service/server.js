const express = require("express");
const cors = require("cors");
const householdRoutes = require("./routes/householdRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/c3/households", householdRoutes);
app.get("/api/c3/twin", require("./controllers/householdController").getDigitalTwin);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
