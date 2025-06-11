// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { validate } = require("../middleware/validate");
const auth = require("../middleware/auth");
const Joi = require("joi");

// --- Schemas de Validação ---

// Schema para registro
const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid("admin", "perito", "assistente"),
});

// Schema para login
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// Schema para refresh token
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// Schema para atualização do próprio perfil
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2),
  email: Joi.string().email(),
}).min(1); // Exige que pelo menos um campo seja enviado

// Schema para atualização de usuário por um admin
const updateUserSchema = Joi.object({
  name: Joi.string().min(2),
  email: Joi.string().email(),
  role: Joi.string().valid("admin", "perito", "assistente"),
  isActive: Joi.boolean(),
}).min(1); // Exige que pelo menos um campo seja enviado

// --- Definição das Rotas ---

// Rotas que não precisam de autenticação
router.post("/register", validate(registerSchema), userController.registerUser);
router.post("/login", validate(loginSchema), userController.loginUser);
router.get("/me", auth(), userController.getMe);
router.post("/forgotpassword", userController.forgotPassword);
router.put("/reset", userController.resetPassword);
router.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  userController.refreshToken
);
router.get("/", auth(["admin"]), userController.getAllUsers);

// Rota para o usuário logado atualizar o próprio perfil (nome e email)
router.put(
  "/profile",
  auth(),
  validate(updateProfileSchema),
  userController.updateMyProfile
);

// Rota para o admin atualizar qualquer usuário (nome, email, role, isActive)
router.put(
  "/:id",
  auth(["admin"]),
  validate(updateUserSchema),
  userController.updateUser
);

// Rotas que precisam de autenticação
router.post("/logout", auth(), userController.logoutUser);

module.exports = router;
