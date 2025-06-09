// controllers/userController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const sendEmail = require("../utils/email");
const logger = require("../utils/logger");

// Função auxiliar para gerar tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { user: { id: user._id, role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};
exports.getAllUsers = async (req, res) => {
  const users = await User.find({}, "-password");
  res.status(200).json(users);
};

exports.updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!["admin", "perito", "assistente"].includes(role)) {
    return res.status(400).json({ msg: "Papel inválido" });
  }
  const user = await User.findByIdAndUpdate(id, { role }, { new: true });
  res.status(200).json(user);
};

exports.registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "Usuário já existe" });

    user = new User({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role,
    });

    await user.save();
    console.log("Usuário salvo no banco:", user);
    await ActivityLog.create({
      userId: user._id,
      action: "Usuário registrado",
    });

    const { accessToken, refreshToken } = generateTokens(user);

    // Salvar o refresh token no banco de dados
    user.refreshToken = refreshToken;
    await user.save();

    res.json({ token: accessToken, refreshToken });
  } catch (error) {
    logger.error("Erro ao registrar usuário:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("Usuário não encontrado");
    return res.status(400).json({ msg: "Usuário não encontrado" });
    }

    if (!user.isActive) {
      console.log("Usuário inativo:", user.email);
    return res.status(403).json({ msg: "Usuário desativado. Fale com o administrador." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Credenciais inválidas" });

    const { accessToken, refreshToken } = generateTokens(user);

    // Salvar o refresh token no banco de dados
    user.refreshToken = refreshToken;
    await user.save();

    await ActivityLog.create({ userId: user._id, action: "Login realizado" });

    // Buscar usuário com campos selecionados (igual ao getMe)
    const userWithoutSensitiveData = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    res.json({
      token: accessToken,
      refreshToken,
      user: userWithoutSensitiveData,
    });
  } catch (error) {
    logger.error("Erro ao fazer login:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado" });
    }
    res.status(200).json(user);
  } catch (error) {
    logger.error("Erro ao buscar dados do usuário:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ msg: "Refresh token não fornecido" });
  }

  try {
    // Verificar se o token é válido
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Verificar se o usuário existe e se o token armazenado corresponde
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ msg: "Refresh token inválido" });
    }

    // Gerar novos tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Atualizar o refresh token no banco de dados
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({ token: accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error("Erro ao renovar token:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ msg: "Refresh token expirado" });
    }

    res.status(403).json({ msg: "Token inválido" });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });

    // Gera um código numérico de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode; // Reutilizamos o campo existente
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hora
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Redefinição de Senha",
      text: `Seu código de redefinição de senha é: ${resetCode}. Use-o para redefinir sua senha.`,
    });

    res.json({ msg: "Código enviado por e-mail" });
  } catch (error) {
    logger.error("Erro ao solicitar redefinição de senha:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

exports.resetPassword = async (req, res) => {
  const { code, password } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: code,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ msg: "Código inválido ou expirado" });

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ msg: "Senha redefinida com sucesso" });
  } catch (error) {
    logger.error("Erro ao redefinir senha:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Encontrar o usuário com este refresh token e removê-lo
      const user = await User.findOne({ refreshToken });
      if (user) {
        user.refreshToken = undefined;
        await user.save();
      }
    }

    res.status(200).json({ msg: "Logout realizado com sucesso" });
  } catch (error) {
    logger.error("Erro ao realizar logout:", error);
    res.status(500).json({ msg: "Erro ao realizar logout" });
  }
};
