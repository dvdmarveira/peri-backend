const Evidence = require("../models/Evidence");
const Case = require("../models/Case");
const ActivityLog = require("../models/ActivityLog");
const logger = require("../utils/logger");

exports.listarEvidencias = async (req, res) => {
  try {
    const { caseId } = req.query;
    const filtro = caseId ? { caseId } : {};

    const evidencias = await Evidence.find(filtro)
      .populate("uploadedBy", "name email")
      .populate("caseId", "title type");

    res.status(200).json({
      message: "Evidências recuperadas com sucesso",
      data: evidencias,
    });
  } catch (error) {
    logger.error("Erro ao listar evidências:", error);
    res.status(500).json({ message: "Erro ao buscar evidências" });
  }
};

exports.uploadEvidence = async (req, res) => {
  try {
    // --- ALTERAÇÃO AQUI ---
    const { caseId, type, content, annotations, latitude, longitude, address } =
      req.body;
    // --- FIM DA ALTERAÇÃO ---
    const files = req.files;

    if (!caseId || !type) {
      return res.status(400).json({
        message: "Campos obrigatórios: caseId e type.",
      });
    }

    const caso = await Case.findById(caseId);
    if (!caso) {
      return res.status(404).json({ message: "Caso não encontrado." });
    }

    if (type === "texto" && !content) {
      return res.status(400).json({
        message: "Conteúdo é obrigatório para evidências do tipo texto.",
      });
    }

    const parsedAnnotations =
      annotations && typeof annotations === "string"
        ? annotations.split(",").map((a) => a.trim())
        : [];

    // Monta o objeto da nova evidência
    const evidenceData = {
      caseId,
      type,
      content: content || "",
      annotations: parsedAnnotations,
      uploadedBy: req.user.id,
      // MODIFICAÇÃO: Salvar apenas o nome do arquivo (file.filename) em vez do caminho completo (file.path)
      filePaths: files ? files.map((file) => file.filename) : [],
      // --- ALTERAÇÃO AQUI ---
      address: address || null, // Adiciona o endereço
      // --- FIM DA ALTERAÇÃO ---
    };

    // Adiciona a localização se latitude e longitude forem fornecidas
    if (latitude && longitude) {
      evidenceData.location = {
        type: "Point",
        // Atenção: A ordem é [longitude, latitude]
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    const evidence = new Evidence(evidenceData);

    await evidence.save();

    await Case.findByIdAndUpdate(
      caseId,
      { $push: { evidences: evidence._id } },
      { new: true }
    );

    await ActivityLog.create({
      userId: req.user.id,
      action: "Evidência adicionada",
      details: evidence._id,
    });

    const populatedEvidence = await Evidence.findById(evidence._id)
      .populate("uploadedBy", "name email")
      .populate("caseId", "title type");

    res.status(201).json({
      message: "Evidência adicionada com sucesso",
      data: populatedEvidence,
    });
  } catch (error) {
    logger.error("Erro ao adicionar evidência:", error);
    res.status(500).json({
      message: "Erro no servidor ao salvar a evidência.",
    });
  }
};

exports.getEvidencesByCategory = async (req, res) => {
  try {
    const { categoria, caseId } = req.query;
    const filtro = {};

    if (categoria) filtro.type = categoria;
    if (caseId) filtro.caseId = caseId;

    const evidencias = await Evidence.find(filtro)
      .populate("uploadedBy", "name email")
      .populate("caseId", "title type");

    res.status(200).json({
      message: "Evidências recuperadas com sucesso",
      data: evidencias,
    });
  } catch (error) {
    logger.error("Erro ao buscar evidências:", error);
    res.status(500).json({ message: "Erro ao buscar evidências" });
  }
};
