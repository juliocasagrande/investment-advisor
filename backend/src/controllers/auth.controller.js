const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { validationResult } = require('express-validator');

class AuthController {
  
  // Registro de novo usuário
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password } = req.body;

      // Verificar se email já existe
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criar usuário
      const result = await pool.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name, email.toLowerCase(), hashedPassword]
      );

      const user = result.rows[0];

      // Criar configurações padrão
      await pool.query(
        'INSERT INTO user_settings (user_id) VALUES ($1)',
        [user.id]
      );

      // Criar classes de ativos padrão
      const defaultClasses = [
        { name: 'Renda Fixa BR', target: 30, color: '#10B981', yield: 15 },
        { name: 'FIIs Brasil', target: 20, color: '#3B82F6', yield: 11 },
        { name: 'Ações BR Dividendos', target: 15, color: '#8B5CF6', yield: 8 },
        { name: 'REITs EUA', target: 15, color: '#F59E0B', yield: 5.5 },
        { name: 'Ações EUA', target: 10, color: '#EC4899', yield: 2 },
        { name: 'Metais Preciosos', target: 10, color: '#EAB308', yield: 0 }
      ];

      for (const cls of defaultClasses) {
        await pool.query(
          'INSERT INTO asset_classes (user_id, name, target_percentage, color, expected_yield) VALUES ($1, $2, $3, $4, $5)',
          [user.id, cls.name, cls.target, cls.color, cls.yield]
        );
      }

      // Gerar token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        message: 'Usuário criado com sucesso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        token
      });

    } catch (error) {
      console.error('Erro no registro:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Login
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Buscar usuário
      const result = await pool.query(
        'SELECT id, name, email, password FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const user = result.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Gerar token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        token
      });

    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter usuário atual
  async me(req, res) {
    try {
      const result = await pool.query(
        'SELECT id, name, email, created_at FROM users WHERE id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      return res.json({ user: result.rows[0] });

    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar perfil
  async updateProfile(req, res) {
    try {
      const { name } = req.body;

      const result = await pool.query(
        'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email',
        [name, req.userId]
      );

      return res.json({ user: result.rows[0] });

    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Alterar senha
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      // Buscar senha atual
      const result = await pool.query(
        'SELECT password FROM users WHERE id = $1',
        [req.userId]
      );

      const isValid = await bcrypt.compare(currentPassword, result.rows[0].password);

      if (!isValid) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await pool.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, req.userId]
      );

      return res.json({ message: 'Senha alterada com sucesso' });

    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new AuthController();
