const express = require("express");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const path = require("path");
const reportRoutes = require("./routes/reportRoutes");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

// 1. Importa o pacote 'cors'
const cors = require("cors");

require("dotenv").config();

const app = express();

connectDB();

// 2. Define as opções de CORS corretamente
const corsOptions = {
  origin: "http://localhost:3000", // Permite requisições apenas do seu frontend
  credentials: true, // Permite que o frontend envie cookies/tokens
};

// 3. Habilita o CORS com as opções corretas e o parser de JSON
app.use(cors(corsOptions));
app.use(express.json());

// Define a rota estática para a pasta de uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Definição das suas rotas de API
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/cases", require("./routes/caseRoutes"));
app.use("/api/evidences", require("./routes/evidenceRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/dental-records", require("./routes/dentalRecordRoutes"));
app.use("/api/patients", require("./routes/patientRoutes"));
app.use("/api", reportRoutes);

app.get("/", (req, res) => {
  res.send("API do OdontoLegal está no ar!");
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
