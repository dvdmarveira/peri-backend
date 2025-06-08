const express = require("express");
const router = express.Router();
const evidenceController = require("../controllers/evidenceController");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const { validate } = require("../middleware/validate");
const Joi = require("joi");

// Schema de validação para evidências
const evidenceSchema = Joi.object({
  caseId: Joi.string().required(),
  type: Joi.string().valid("imagem", "texto").required(),
  content: Joi.string().when("type", {
    is: "texto",
    then: Joi.required(),
    otherwise: Joi.allow("", null),
  }),
  annotations: Joi.string().allow("", null),
  // --- ALTERAÇÃO AQUI ---
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  address: Joi.string().allow("", null).optional(), // Validação para endereço
  // --- FIM DA ALTERAÇÃO ---
}).with("latitude", "longitude");

router.post(
  "/",
  auth(["perito", "admin", "assistente"]),
  upload.array("files", 5),
  validate(evidenceSchema),
  evidenceController.uploadEvidence
);

router.get("/", auth(), evidenceController.listarEvidencias);

router.get("/by-category", auth(), evidenceController.getEvidencesByCategory);

module.exports = router;
