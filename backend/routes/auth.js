const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login - Iniciar sesión
router.post('/login', [
    body('email').isEmail().withMessage('Email válido requerido'),
    body('password').isLength({ min: 1 }).withMessage('Contraseña requerida')
], async (req, res) => {
    try {
        console.log('=== LOGIN ATTEMPT ===');
        console.log('Email recibido:', req.body.email);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // BUSCAR EN POSTGRESQL
        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND active = true',
            [email]
        );

        if (result.rows.length === 0) {
            console.log('Usuario no encontrado o inactivo');
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const user = result.rows[0];
        console.log('Usuario encontrado:', {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            ruta: user.ruta
        });

        // Verificar contraseña
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            console.log('Contraseña incorrecta');
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");

        // Actualizar último login con timezone correcto
        const loginTimeResult = await pool.query(
              'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1 RETURNING last_login',
              [user.id]
        );

        

        // Generar token con TODOS los datos necesarios
        const tokenData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            ruta: user.ruta,
            fullName: user.full_name || user.username
        };

        const token = generateToken(tokenData);

        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            ruta: user.ruta,
            fullName: user.full_name || user.username,
            sucursal: user.sucursal,
            branchId: user.branch_id,
            lastLogin: loginTimeResult.rows[0].last_login
        };

        console.log('Login exitoso. UserData enviado:', userData);

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso',
            data: {
                token,
                user: userData
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/register - Registrar nuevo usuario (solo para admin)
router.post('/register', [
    authenticateToken,
    body('username').isLength({ min: 3 }).withMessage('Usuario debe tener al menos 3 caracteres'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
    body('role').isIn(['admin', 'logistics', 'route', 'local', 'chofer', 'supervisor']).withMessage('Rol válido requerido')
], async (req, res) => {
    try {
        // Solo admin puede registrar usuarios
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para registrar usuarios'
            });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { username, email, password, role, fullName, ruta, sucursal, branchId } = req.body;

        // Verificar si ya existe
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Usuario o email ya existe'
            });
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear nuevo usuario
        const result = await pool.query(
            `INSERT INTO users (
                username, email, password, role, full_name, 
                ruta, sucursal, branch_id, active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
            RETURNING id, username, email, role, full_name, ruta, created_at`,
            [username, email, hashedPassword, role, fullName || username, ruta || null, sucursal || null, branchId || null]
        );

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                user: result.rows[0]
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/auth/profile - Obtener perfil del usuario autenticado
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, role, full_name, ruta, sucursal, branch_id, last_login, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.full_name,
                    ruta: user.ruta,
                    sucursal: user.sucursal,
                    branchId: user.branch_id,
                    lastLogin: user.last_login,
                    createdAt: user.created_at
                }
            }
        });

    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/auth/profile - Actualizar perfil
router.put('/profile', [
    authenticateToken,
    body('email').optional().isEmail().withMessage('Email inválido'),
    body('fullName').optional().isLength({ min: 2 }).withMessage('Nombre completo debe tener al menos 2 caracteres')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { email, fullName } = req.body;

        // Verificar si el nuevo email ya existe
        if (email) {
            const emailExists = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, req.user.id]
            );

            if (emailExists.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'El email ya está en uso'
                });
            }
        }

        // Actualizar datos
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (email) {
            updates.push(`email = $${paramCount}`);
            values.push(email);
            paramCount++;
        }

        if (fullName) {
            updates.push(`full_name = $${paramCount}`);
            values.push(fullName);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay campos para actualizar'
            });
        }

        values.push(req.user.id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} 
             RETURNING id, username, email, role, full_name, ruta`,
            values
        );

        res.json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: {
                user: result.rows[0]
            }
        });

    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/change-password - Cambiar contraseña
router.post('/change-password', [
    authenticateToken,
    body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
    body('newPassword').isLength({ min: 6 }).withMessage('Nueva contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;

        const result = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar contraseña actual
        const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Contraseña actual incorrecta'
            });
        }

        // Hash de la nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedNewPassword, req.user.id]
        );

        res.json({
            success: true,
            message: 'Contraseña cambiada exitosamente'
        });

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/logout - Cerrar sesión
router.post('/logout', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
    });
});

module.exports = router;