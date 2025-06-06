const Patient = require("../models/Patient");
const Case = require("../models/Case");
const ActivityLog = require("../models/ActivityLog");
const logger = require("../utils/logger"); // Adicionado para consistência

// Função de criação que já ajustamos
exports.createPatient = async (req, res) => {
  try {
    const { caseId, ...patientData } = req.body;

    const existingCase = await Case.findById(caseId);
    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: "Caso não encontrado",
      });
    }

    const patient = new Patient({
      ...patientData,
      case: caseId,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });
    await patient.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: "Paciente adicionado",
      details: `Paciente ${patient.nome} adicionado ao caso ${caseId}`,
    });

    const populatedPatient = await Patient.findById(patient._id)
      .populate("case", "title")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    res.status(201).json({
      success: true,
      message: "Paciente adicionado com sucesso",
      data: populatedPatient,
    });
  } catch (error) {
    logger.error("Erro ao criar paciente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao criar paciente",
      error: error.message,
    });
  }
};

// Função de atualização
exports.updatePatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user.id,
    };

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Paciente não encontrado",
      });
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      patientId,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("case", "title")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    await ActivityLog.create({
      userId: req.user.id,
      action: "Paciente atualizado",
      details: `Paciente ${updatedPatient.nome} atualizado`,
    });

    res.json({
      success: true,
      message: "Paciente atualizado com sucesso",
      data: updatedPatient,
    });
  } catch (error) {
    logger.error("Erro ao atualizar paciente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar paciente",
      error: error.message,
    });
  }
};

// Função para buscar um paciente por ID
exports.getPatientById = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findById(patientId)
      .populate("case", "title")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Paciente não encontrado",
      });
    }

    res.json({
      success: true,
      data: patient,
    });
  } catch (error) {
    logger.error("Erro ao buscar paciente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar paciente",
      error: error.message,
    });
  }
};

// Função para buscar pacientes por caso
exports.getPatientsByCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const existingCase = await Case.findById(caseId);
    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: "Caso não encontrado",
      });
    }

    const patients = await Patient.find({ case: caseId })
      .populate("createdBy", "name")
      .populate("updatedBy", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: patients,
    });
  } catch (error) {
    logger.error("Erro ao buscar pacientes do caso:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar pacientes do caso",
      error: error.message,
    });
  }
};

// Função para deletar um paciente
exports.deletePatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Paciente não encontrado",
      });
    }

    await patient.deleteOne();

    await ActivityLog.create({
      userId: req.user.id,
      action: "Paciente removido",
      details: `Paciente ${patient.nome || patient._id} removido do caso ${
        patient.case
      }`,
    });

    res.json({
      success: true,
      message: "Paciente removido com sucesso",
    });
  } catch (error) {
    logger.error("Erro ao remover paciente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao remover paciente",
      error: error.message,
    });
  }
};

// Função para listar todos os pacientes com paginação
exports.getAllPatients = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Patient.countDocuments();
    const patients = await Patient.find()
      .populate("case", "title")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: patients,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    logger.error("Erro ao listar pacientes:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao listar pacientes",
      error: error.message,
    });
  }
};
