const PDFDocument = require("pdfkit");
const fs = require("fs");

const generatePDF = (data, outputPath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Cabeçalho
    doc.font("Helvetica-Bold")
      .fontSize(18)
      .text("Laudo Pericial", { align: "center" })
      .moveDown(1.5);

    // Conteúdo (com quebra de linhas)
    doc.font("Helvetica")
      .fontSize(12)
      .text(data.content, {
        align: "justify",
        lineGap: 6,
      });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};

module.exports = generatePDF;
