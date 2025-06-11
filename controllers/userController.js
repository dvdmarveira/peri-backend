// controllers/userController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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
  try {
    const users = await User.find({}, "-password -refreshToken");
    res.status(200).json(users);
  } catch (error) {
    logger.error("Erro ao buscar todos os usuários:", error);
    res.status(500).json({ msg: "Erro no servidor" });
  }
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
    await ActivityLog.create({
      userId: user._id,
      action: "Usuário registrado",
    });

    const { accessToken, refreshToken } = generateTokens(user);

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
      return res.status(400).json({ msg: "Usuário não encontrado" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ msg: "Usuário desativado. Fale com o administrador." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Credenciais inválidas" });

    const { accessToken, refreshToken } = generateTokens(user);

    user.refreshToken = refreshToken;
    await user.save();

    await ActivityLog.create({ userId: user._id, action: "Login realizado" });

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
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ msg: "Refresh token inválido" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

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

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode;
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
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }
    res.status(200).json({ msg: "Logout realizado com sucesso" });
  } catch (error) {
    logger.error("Erro ao realizar logout:", error);
    res.status(500).json({ msg: "Erro ao realizar logout" });
  }
};

// --- NOVAS FUNÇÕES DE ATUALIZAÇÃO ---

// Função para o usuário logado atualizar o próprio perfil
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    res.json({ msg: "Perfil atualizado com sucesso.", user: updatedUser });
  } catch (error) {
    logger.error("Erro ao atualizar perfil do usuário:", error);
    if (error.code === 11000) {
      return res.status(400).json({ msg: "Este e-mail já está em uso." });
    }
    res.status(500).json({ msg: "Erro no servidor" });
  }
};

// Função para o admin atualizar qualquer usuário
exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body;
    const { id } = req.params;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    await ActivityLog.create({
      userId: req.user.id,
      action: "Usuário atualizado por Admin",
      details: `Dados do usuário ${id} foram atualizados.`,
    });

    res.json({ msg: "Usuário atualizado com sucesso.", user: updatedUser });
  } catch (error) {
    logger.error("Erro ao atualizar usuário pelo admin:", error);
    if (error.code === 11000) {
      return res.status(400).json({ msg: "Este e-mail já está em uso." });
    }
    res.status(500).json({ msg: "Erro no servidor" });
  }
};
