const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    nic: {
      type: String,
      required: [true, "O NIC é obrigatório."],
      trim: true,
    },
    nome: {
      type: String,
      required: [true, "O nome do paciente é obrigatório."],
      trim: true,
    },
    genero: {
      type: String,
      enum: ["Masculino", "Feminino", "Outro"],
      required: true,
    },
    idade: {
      type: Number,
      required: true,
    },
    documento: {
      type: String,
      default: null,
      trim: true,
    },
    endereco: {
      type: String,
      default: null,
      trim: true,
    },
    corEtnia: {
      type: String,
      default: null,
      trim: true,
    },
    odontograma: {
      type: Object, // Usar Object permite uma estrutura flexível (JSON)
      default: {},
    },
    anotacoesAnatomicas: {
      type: String,
      default: "",
    },
    case: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      required: [true, "É necessário vincular o paciente a um caso"],
      // A restrição 'unique' foi REMOVIDA. Isso é o que permite que um 'Case'
      // seja referenciado por múltiplos pacientes.
      // unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Os virtuais agora usam o novo campo 'nome'.
patientSchema.virtual("isIdentified").get(function () {
  return !!this.nome;
});

patientSchema.virtual("identificationStatus").get(function () {
  return this.nome ? "Paciente identificado" : "Paciente não identificado";
});

// Middleware mantido como estava
patientSchema.pre("save", function (next) {
  if (this.isNew) {
    this.updatedBy = this.createdBy;
  }
  next();
});

// <<< MIDDLEWARE ATUALIZADO (post save) >>>
// Agora, em vez de substituir, ele adiciona o ID do novo paciente ao array 'patients' do caso.
// $addToSet para garantir que o mesmo paciente não seja adicionado duas vezes.
patientSchema.post("save", async function (doc) {
  await mongoose
    .model("Case")
    .findByIdAndUpdate(doc.case, { $addToSet: { patients: doc._id } });
});

// <<< MIDDLEWARE ATUALIZADO (pre remove) >>>
// Ao remover um paciente, ele será retirado ($pull) do array 'patients' do caso.
patientSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      await mongoose
        .model("Case")
        .findByIdAndUpdate(this.case, { $pull: { patients: this._id } });
      next();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = mongoose.model("Patient", patientSchema);
