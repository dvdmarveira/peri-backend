const express = require("express");
const router = express.Router();
const patientController = require("../controllers/patientController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const Joi = require("joi");

const patientSchema = Joi.object({
  nic: Joi.string().required().messages({
    "any.required": "O NIC é obrigatório.",
  }),
  nome: Joi.string().required().messages({
    "any.required": "O nome é obrigatório.",
  }),
  genero: Joi.string()
    .valid("Masculino", "Feminino", "Outro")
    .required()
    .messages({
      "any.required": "O gênero é obrigatório.",
      "any.only": "Gênero deve ser Masculino, Feminino ou Outro.",
    }),
  idade: Joi.number().integer().min(0).required().messages({
    "any.required": "A idade é obrigatória.",
    "number.base": "A idade deve ser um número.",
  }),
  documento: Joi.string().allow(null, ""),
  endereco: Joi.string().allow(null, ""),
  corEtnia: Joi.string().allow(null, ""),
  odontograma: Joi.object().optional(),
  anotacoesAnatomicas: Joi.string().allow(null, ""),
  caseId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID do caso inválido",
      "any.required": "O ID do caso é obrigatório",
    }),
});

const idParamSchema = Joi.object({
  patientId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID do paciente inválido",
      "any.required": "O ID do paciente é obrigatório",
    }),
});

const caseIdParamSchema = Joi.object({
  caseId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "ID do caso inválido",
      "any.required": "O ID do caso é obrigatório",
    }),
});

// --- ROTAS ---

// Listar todos os pacientes (com paginação)
router.get("/", auth(), patientController.getAllPatients);

// Criar um novo paciente
router.post(
  "/",
  auth(["perito", "admin", "assistente"]),
  validate(patientSchema),
  patientController.createPatient
);

// Obter um paciente específico por ID
router.get(
  "/:patientId",
  auth(),
  validate(idParamSchema, "params"),
  patientController.getPatientById
);

// Obter pacientes por ID do caso
router.get(
  "/case/:caseId",
  auth(),
  validate(caseIdParamSchema, "params"),
  patientController.getPatientsByCase
);

// Atualizar um paciente
router.put(
  "/:patientId",
  auth(["perito", "admin"]),
  validate(idParamSchema, "params"),
  validate(
    patientSchema.fork(Object.keys(patientSchema.describe().keys), (schema) =>
      schema.optional()
    )
  ),
  patientController.updatePatient
);

// Deletar um paciente
router.delete(
  "/:patientId",
  auth(["perito", "admin"]),
  validate(idParamSchema, "params"),
  patientController.deletePatient
);

module.exports = router;
