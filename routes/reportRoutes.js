const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const reportController = require("../controllers/reportController");
const Case = require("../models/Case");
const Evidence = require("../models/Evidence");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const Joi = require("joi");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("../utils/logger");

// Função de IA
const generateTextWithGemini = async (prompt) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    logger.warn(
      "A chave da API do Gemini (GEMINI_API_KEY) não foi encontrada no .env. A funcionalidade de IA será ignorada."
    );
    return null;
  }
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    };
    const response = await axios.post(API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
    });
    const data = response.data;
    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text;
    }
    logger.warn(
      "A API Gemini não retornou texto. Possível bloqueio de segurança.",
      data
    );
    return "A análise não pôde ser gerada devido às políticas de segurança de conteúdo.";
  } catch (error) {
    if (error.response) {
      logger.error("Erro na resposta da API Gemini:", error.response.data);
      const apiError =
        error.response.data.error?.message ||
        "Não foi possível obter resposta da IA.";
      return `Erro ao gerar análise: ${apiError}`;
    } else {
      logger.error("Erro de comunicação com o serviço de IA:", error.message);
      return "Erro de comunicação com o serviço de IA.";
    }
  }
};

const reportSchema = Joi.object({
  case: Joi.string().required(),
  title: Joi.string().required(),
  content: Joi.string().required(),
  type: Joi.string()
    .valid("laudo_pericial", "relatorio_tecnico", "parecer_odontologico")
    .required(),
  status: Joi.string()
    .valid("rascunho", "finalizado", "arquivado")
    .default("rascunho"),
});

router.post(
  "/",
  auth(["perito", "admin"]),
  validate(reportSchema),
  reportController.createReport
);
router.get("/", auth(), reportController.getReports);

router.get(
  "/generate-pdf/:caseId",
  auth(["perito", "admin"]),
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const [caso, evidencias] = await Promise.all([
        Case.findById(caseId).populate("patients"),
        Evidence.find({ caseId: caseId }),
      ]);
      if (!caso) {
        return res.status(404).json({ message: "Caso não encontrado" });
      }
      if (
        req.user.role !== "admin" &&
        caso.createdBy.toString() !== req.user.id
      ) {
        return res
          .status(403)
          .json({ message: "Sem permissão para gerar este laudo" });
      }

      let promptParaIA = `Aja como um perito odontolegista e elabore uma análise técnica preliminar concisa e objetiva, em um único parágrafo, com base nos seguintes dados de um caso. Correlacione os achados e foque nos fatos apresentados.\n\n`;
      promptParaIA += `--- DADOS DO CASO ---\n`;
      promptParaIA += `Título: ${caso.title}\n`;
      promptParaIA += `Descrição: ${caso.description}\n\n`;
      if (caso.patients && caso.patients.length > 0) {
        promptParaIA += `--- PACIENTES ENVOLVIDOS ---\n`;
        caso.patients.forEach((p) => {
          promptParaIA += `- Nome: ${p.nome}, Idade: ${p.idade}, Gênero: ${
            p.genero
          }. Anotações: ${p.anotacoesAnatomicas}. Odontograma: ${JSON.stringify(
            p.odontograma
          )}\n`;
        });
        promptParaIA += `\n`;
      }
      if (evidencias && evidencias.length > 0) {
        promptParaIA += `--- EVIDÊNCIAS COLETADAS ---\n`;
        evidencias.forEach((e) => {
          promptParaIA += `- Tipo: ${e.type}. Descrição: ${
            e.content || "N/A"
          }. Local: ${e.address || "N/A"}\n`;
        });
      }

      const analiseGeradaPorIA = await generateTextWithGemini(promptParaIA);

      const doc = new PDFDocument({ margin: 50, bufferPages: true });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=laudo-${caseId}.pdf`
      );
      doc.pipe(res);

      // --- LÓGICA DO LOGOTIPO ATUALIZADA ---
      const logoPath = path.join(
        __dirname,
        "..",
        "public",
        "uploads",
        "logo.PNG"
      );
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, {
          fit: [120, 120], // Aumentado para um tamanho maior
          align: "center",
        });
        // Adiciona um espaço maior para acomodar o novo tamanho do logo
        doc.moveDown(5);
      }
      // --- FIM DA ATUALIZAÇÃO ---

      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .text("LAUDO PERICIAL ODONTOLÓGICO", { align: "center" });
      doc.moveDown(2);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("1. DADOS DO CASO", { underline: true });
      doc.moveDown();
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(`Nº do Caso: `, { continued: true })
        .font("Helvetica")
        .text(caso._id);
      doc
        .font("Helvetica-Bold")
        .text(`Título: `, { continued: true })
        .font("Helvetica")
        .text(caso.title);
      doc
        .font("Helvetica-Bold")
        .text(`Tipo: `, { continued: true })
        .font("Helvetica")
        .text(caso.type);
      doc
        .font("Helvetica-Bold")
        .text(`Status: `, { continued: true })
        .font("Helvetica")
        .text(caso.status);
      doc
        .font("Helvetica-Bold")
        .text(`Data de Abertura: `, { continued: true })
        .font("Helvetica")
        .text(new Date(caso.createdAt).toLocaleDateString("pt-BR"));
      doc.moveDown();
      doc.font("Helvetica-Bold").text("Descrição do Caso:");
      doc.font("Helvetica").text(caso.description, { align: "justify" });
      doc.moveDown(2);

      if (caso.patients && caso.patients.length > 0) {
        doc.addPage();
        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .text("2. PACIENTES / VÍTIMAS ENVOLVIDAS", { underline: true });
        doc.moveDown();
        caso.patients.forEach((paciente, index) => {
          doc
            .font("Helvetica-Bold")
            .fontSize(14)
            .text(`2.${index + 1} - ${paciente.nome || "Não Identificado"}`);
          doc.moveDown(0.5);
          doc
            .font("Helvetica-Bold")
            .fontSize(12)
            .text(`  NIC: `, { continued: true })
            .font("Helvetica")
            .text(paciente.nic);
          doc
            .font("Helvetica-Bold")
            .text(`  Gênero: `, { continued: true })
            .font("Helvetica")
            .text(paciente.genero);
          doc
            .font("Helvetica-Bold")
            .text(`  Idade: `, { continued: true })
            .font("Helvetica")
            .text(paciente.idade);
          doc
            .font("Helvetica-Bold")
            .text(`  Documento: `, { continued: true })
            .font("Helvetica")
            .text(paciente.documento || "Não informado");
          doc
            .font("Helvetica-Bold")
            .text(`  Endereço: `, { continued: true })
            .font("Helvetica")
            .text(paciente.endereco || "Não informado");
          doc.moveDown(0.5);
          doc
            .font("Helvetica-Bold")
            .text("  Anotações Anatômicas:")
            .font("Helvetica")
            .text(`  ${paciente.anotacoesAnatomicas || "Nenhuma"}`, {
              align: "justify",
            });
          doc.moveDown(0.5);
          if (
            paciente.odontograma &&
            Object.keys(paciente.odontograma).length > 0
          ) {
            doc
              .font("Helvetica-Bold")
              .text("  Odontograma:", { underline: false });
            doc.moveDown(0.5);
            Object.entries(paciente.odontograma).forEach(([key, value]) => {
              if (!isNaN(parseInt(key, 10))) {
                const formattedKey = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (char) => char.toUpperCase());
                doc
                  .font("Helvetica-Bold")
                  .fontSize(11)
                  .text(`    • ${formattedKey}:`, { indent: 15 });
                const printDetails = (obj, indent) => {
                  const details = Object.entries(obj)
                    .map(([subKey, subValue]) => {
                      const fSubKey = subKey
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      return `${fSubKey}: ${subValue}`;
                    })
                    .join("; ");
                  doc
                    .font("Helvetica")
                    .fontSize(10)
                    .text(details, { indent: indent });
                };
                if (
                  typeof value === "object" &&
                  value !== null &&
                  !Array.isArray(value)
                ) {
                  printDetails(value, 30);
                } else if (Array.isArray(value)) {
                  value.forEach((item) => {
                    if (typeof item === "object" && item !== null) {
                      printDetails(item, 30);
                    }
                  });
                } else {
                  doc
                    .font("Helvetica")
                    .fontSize(10)
                    .text(String(value), { indent: 30 });
                }
                doc.moveDown(0.2);
              }
            });
            doc.moveDown();
          }
        });
      }
      doc.moveDown(2);

      if (evidencias.length > 0) {
        doc.addPage();
        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .text("3. EVIDÊNCIAS COLETADAS E ANÁLISES", { underline: true });
        doc.moveDown();
        evidencias.forEach((ev, index) => {
          doc.moveDown(2);
          doc
            .font("Helvetica-Bold")
            .fontSize(14)
            .text(`3.${index + 1} - Evidência (${ev.type})`);
          doc.moveDown(0.5);
          if (ev.address) {
            doc
              .font("Helvetica-Bold")
              .text("  Endereço: ", { continued: true })
              .font("Helvetica")
              .text(ev.address);
          }
          if (ev.location && ev.location.coordinates) {
            doc
              .font("Helvetica-Bold")
              .text("  Coordenadas (Lat, Lon): ", { continued: true })
              .font("Helvetica")
              .text(
                `${ev.location.coordinates[1]}, ${ev.location.coordinates[0]}`
              );
          }
          doc.moveDown(0.5);
          if (ev.content) {
            doc.font("Helvetica-Bold").text("  Descrição/Conteúdo:");
            doc.font("Helvetica").text(`  ${ev.content}`, { align: "justify" });
            doc.moveDown(0.5);
          }
          if (ev.annotations && ev.annotations.length > 0) {
            doc.font("Helvetica-Bold").text("  Anotações da Evidência:");
            ev.annotations.forEach((annotation) => {
              doc
                .font("Helvetica")
                .fontSize(10)
                .text(`    • ${annotation}`, { indent: 15, align: "justify" });
            });
            doc.moveDown(0.5);
          }
          if (ev.filePaths && ev.filePaths.length > 0) {
            doc.font("Helvetica-Bold").text("  Arquivos de Imagem:");
            doc.moveDown(0.5);
            ev.filePaths.forEach((filePath) => {
              const ext = path.extname(filePath).toLowerCase();
              if (
                [".png", ".jpg", ".jpeg"].includes(ext) &&
                fs.existsSync(filePath)
              ) {
                try {
                  if (doc.y + 420 > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                  }
                  doc.image(filePath, {
                    fit: [500, 400],
                    align: "center",
                    valign: "center",
                  });
                  doc.addPage();
                } catch (e) {
                  console.error("Erro ao embutir imagem no PDF:", e.message);
                  doc
                    .font("Helvetica-Oblique")
                    .text(
                      `[Erro ao carregar imagem: ${path.basename(filePath)}]`,
                      { color: "red" }
                    );
                }
              }
            });
          }
        });
      }

      doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("4. ANÁLISE PRELIMINAR (Gerada por IA)", { underline: true });
      doc.moveDown();
      if (analiseGeradaPorIA) {
        doc.font("Helvetica").text(analiseGeradaPorIA, { align: "justify" });
      } else {
        doc
          .font("Helvetica-Oblique")
          .text(
            "Não foi possível gerar a análise por IA. Verifique a chave da API no servidor ou os logs do console para mais detalhes.",
            { align: "justify" }
          );
      }
      doc.moveDown();
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(
          "*Este texto foi gerado por Inteligência Artificial como um auxílio preliminar e deve ser obrigatoriamente revisado e validado por um profissional qualificado.",
          { align: "justify" }
        );
      doc.moveDown(2);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("5. CONCLUSÃO", { underline: true });
      doc.moveDown();
      doc
        .font("Helvetica")
        .text(
          "Diante do exposto e com base nas análises das evidências e informações dos envolvidos, conclui-se que...",
          { align: "justify" }
        );
      doc.moveDown(5);
      doc
        .font("Helvetica")
        .text("_________________________________", { align: "center" });
      doc
        .font("Helvetica-Bold")
        .text("Assinatura do Perito Responsável", { align: "center" });
      doc.moveDown(2);
      doc.text(
        `Gerado em: ${new Date().toLocaleDateString(
          "pt-BR"
        )} às ${new Date().toLocaleTimeString("pt-BR")}`
      );

      doc.end();
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar laudo em PDF", error: error.message });
    }
  }
);

router.get("/:reportId/download", auth(), reportController.downloadReport);

module.exports = router;
