const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      required: true,
    },
    type: { type: String, enum: ["imagem", "texto"], required: true },
    filePaths: [{ type: String }], // Alterado para array de caminhos
    content: { type: String },
    annotations: [{ type: String }],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // --- ALTERAÇÕES AQUI ---
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: false,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: false,
      },
    },
    address: {
      type: String, // Campo de endereço
      required: false,
    },
    // --- FIM DAS ALTERAÇÕES ---
  },
  { timestamps: true }
);

// Criar um índice geoespacial para otimizar buscas por localização
evidenceSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Evidence", evidenceSchema);
