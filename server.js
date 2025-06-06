const express = require("express");
const connectDB = require("./config/db");
const cors = require("./config/cors");
const errorHandler = require("./middleware/errorHandler");
const path = require("path");
const reportRoutes = require("./routes/reportRoutes");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json"); // Importa nosso arquivo JSON

require("dotenv").config();

const app = express();

connectDB();

app.use(express.json());
app.use(cors);
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
app.use(express.static(path.join(__dirname, "frontend/public")));
app.use("/src", express.static(path.join(__dirname, "frontend/src")));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/cases", require("./routes/caseRoutes"));
app.use("/api/evidences", require("./routes/evidenceRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/dental-records", require("./routes/dentalRecordRoutes"));
app.use("/api", reportRoutes);
app.use("/api/patients", require("./routes/patientRoutes"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend/public/login.html"));
});

app.get("*", (req, res) => {
  const filePath = path.join(__dirname, "frontend/public", `${req.path}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send("Página não encontrada");
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
