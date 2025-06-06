const Case = require("../models/Case");
const ActivityLog = require("../models/ActivityLog");
const logger = require("../utils/logger");

exports.createCase = async (req, res) => {
  const { title, description, type, status, data, historico, analises } =
    req.body;

  try {
    const newCase = new Case({
      title,
      description,
      type,
      status: status || "em_andamento",
      responsible: req.user.id,
      createdBy: req.user.id,
      data: data || new Date(),
      historico,
      analises,
    });

    await newCase.save();
    await ActivityLog.create({
      userId: req.user.id,
      action: "Caso criado",
      details: newCase._id,
    });

    const populatedCase = await Case.findById(newCase._id)
      .populate("responsible", "name email")
      .populate("createdBy", "name email");

    res.status(201).json({
      message: "Caso criado com sucesso",
      data: populatedCase,
    });
  } catch (error) {
    logger.error("Erro ao criar caso:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
};

exports.updateCaseStatus = async (req, res) => {
  const { caseId } = req.params;
  const { status } = req.body;

  try {
    const updatedCase = await Case.findByIdAndUpdate(
      caseId,
      { status },
      { new: true }
    )
      .populate("responsible", "name email")
      .populate("createdBy", "name email")
      .populate("patients", "nome nic") // Populando também os pacientes aqui
      .populate({
        path: "evidences",
        select: "type content createdAt",
        populate: { path: "uploadedBy", select: "name" },
      })
      .populate({
        path: "reports",
        select: "title createdAt",
        populate: { path: "createdBy", select: "name" },
      });

    if (!updatedCase)
      return res.status(404).json({ message: "Caso não encontrado" });

    await ActivityLog.create({
      userId: req.user.id,
      action: "Status do caso atualizado",
      details: caseId,
    });

    res.json({
      message: "Status atualizado com sucesso",
      data: updatedCase,
    });
  } catch (error) {
    logger.error("Erro ao atualizar caso:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
};

exports.getCases = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filtro = {};
    if (req.query.type) {
      filtro.type = req.query.type;
    }
    if (req.query.status && req.query.status !== "todos") {
      filtro.status = req.query.status;
    }

    const [casos, total] = await Promise.all([
      Case.find(filtro)
        .populate("responsible", "name email")
        .populate("createdBy", "name email")
        .populate("patients", "nome nic")
        .populate("evidences", "type")
        .populate("reports", "title")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Case.countDocuments(filtro),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: "Casos recuperados com sucesso",
      data: {
        cases: casos,
        pagination: {
          total,
          pages: totalPages,
          currentPage: page,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error("Erro ao buscar casos:", error);
    res
      .status(500)
      .json({ message: "Erro ao buscar casos.", error: error.message });
  }
};

exports.getCaseById = async (req, res) => {
  try {
    const caseId = req.params.id;

    if (!caseId) {
      return res.status(400).json({
        success: false,
        message: "ID do caso não fornecido",
      });
    }

    const foundCase = await Case.findById(caseId)
      .populate("responsible", "name email")
      .populate("createdBy", "name email")
      .populate("patients")
      .populate({
        path: "evidences",
        select: "type filePaths content annotations createdAt",
        populate: { path: "uploadedBy", select: "name" },
      })
      .populate({
        path: "reports",
        select: "title type content status createdAt",
        populate: { path: "createdBy", select: "name" },
      });

    if (!foundCase) {
      return res.status(404).json({
        success: false,
        message: "Caso não encontrado",
      });
    }

    await ActivityLog.create({
      userId: req.user.id,
      action: "Caso visualizado",
      details: caseId,
    });

    res.status(200).json({
      success: true,
      message: "Caso encontrado com sucesso",
      data: foundCase,
    });
  } catch (error) {
    console.error("Erro ao buscar caso por ID:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar caso",
      error: error.message,
    });
  }
};

exports.deleteCase = async (req, res) => {
  try {
    const caseId = req.params.id;
    const caseToDelete = await Case.findById(caseId);

    if (!caseToDelete) {
      return res.status(404).json({
        success: false,
        message: "Caso não encontrado",
      });
    }

    if (
      !["admin", "perito"].includes(req.user.role) &&
      caseToDelete.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Sem permissão para deletar este caso",
      });
    }

    await Case.findByIdAndDelete(caseId);

    await ActivityLog.create({
      userId: req.user.id,
      action: "Caso deletado",
      details: caseId,
    });

    res.status(200).json({
      success: true,
      message: "Caso deletado com sucesso",
    });
  } catch (error) {
    logger.error("Erro ao deletar caso:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao deletar caso",
      error: error.message,
    });
  }
};
