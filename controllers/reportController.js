const Report = require("../models/Report");
const Case = require("../models/Case");
const ActivityLog = require("../models/ActivityLog");
const generatePDF = require("../utils/pdfGenerator");
const logger = require("../utils/logger");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Recomendado usar variável de ambiente

// Função auxiliar para gerar texto com Gemini
const gerarTextoComGemini = async (mensagem) => {
  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: mensagem }],
            },
          ],
        }),
      }
    );

    const dados = await resposta.json();

    if (resposta.ok && dados.candidates && dados.candidates.length > 0) {
      return dados.candidates[0].content.parts[0].text;
    } else {
      logger.error("Erro na resposta da API Gemini:", dados);
      return null;
    }
  } catch (erro) {
    logger.error("Erro ao acessar API Gemini:", erro);
    return null;
  }
};

exports.createReport = async (req, res) => {
  try {
    console.log("Corpo da requisição:", req.body);
    console.log("Arquivos recebidos:", req.files);

    const { case: caseId, title, content, type, status } = req.body;

    if (!caseId) {
      return res.status(400).json({ message: "ID do caso é obrigatório" });
    }

    const files = req.files;

    const caso = await Case.findById(caseId);
    if (!caso) {
      return res.status(404).json({ message: "Caso não encontrado" });
    }

    // Verificar permissão: permite que admin, perito, ou o criador do caso gerem o laudo.
    if (
      !["admin", "perito"].includes(req.user.role) &&
      caso.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message:
          "Sem permissão para criar laudo neste caso. Apenas peritos, administradores ou o criador do caso podem realizar esta ação.",
      });
    }

    // Processar anexos
    const attachments = files
      ? files.map((file) => ({
          filename: file.originalname,
          path: file.path,
          uploadedAt: new Date(),
        }))
      : [];

    // Gerar conteúdo adicional com Gemini (opcional)
    let textoGeradoGemini = await gerarTextoComGemini(
      `Crie um parecer técnico breve com base no seguinte conteúdo: ${content}`
    );

    if (textoGeradoGemini) {
      console.log("Texto gerado pelo Gemini:", textoGeradoGemini);
    } else {
      textoGeradoGemini = "";
    }

    const report = new Report({
      case: caseId,
      title,
      content: content + "\n\n---\n\n" + textoGeradoGemini,
      type,
      status: status || "rascunho",
      createdBy: req.user.id,
      attachments,
    });

    const pdfPath = `${process.env.UPLOAD_DIR}/report-${report._id}.pdf`;
    await generatePDF({ content: report.content }, pdfPath);
    report.pdfPath = pdfPath;

    await report.save();

    // Atualiza o caso com o novo laudo
    await Case.findByIdAndUpdate(
      caseId,
      { $push: { reports: report._id } },
      { new: true }
    );

    await ActivityLog.create({
      userId: req.user.id,
      action: "Laudo gerado",
      details: report._id,
    });

    const populatedReport = await Report.findById(report._id)
      .populate("createdBy", "name email")
      .populate("case", "title type");

    return res.status(201).json({
      success: true,
      data: populatedReport,
    });
  } catch (error) {
    console.error("Erro ao criar laudo:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao criar laudo",
      error: error.message,
    });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("createdBy", "name email")
      .populate("case", "title type");

    return res.status(200).json({
      success: true,
      data: reports,
    });
  } catch (error) {
    console.error("Erro ao buscar laudos:", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao buscar laudos",
      error: error.message,
    });
  }
};

exports.downloadReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report || !report.pdfPath) {
      return res
        .status(404)
        .json({ message: "Laudo não encontrado ou sem PDF" });
    }

    res.download(report.pdfPath);
  } catch (error) {
    console.error("Erro ao baixar laudo:", error);
    return res
      .status(500)
      .json({ message: "Erro ao baixar laudo", error: error.message });
  }
};
