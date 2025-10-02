const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generateToken } = require('../middleware/auth');

const router = express.Router();
const usersFilePath = path.join(__dirname, '../data/users.json');

// Función para leer usuarios
const getUsers = () => {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error leyendo usuarios:', error);
        return [];
    }
};

// Función para guardar usuarios
const saveUsers = (users) => {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error guardando usuarios:', error);
        return false;
    }
};

// POST /api/auth/login - Iniciar sesión
router.post('/login', [
    body('email').isEmail().withMessage('Email válido requerido'),
    body('password').isLength({ min: 1 }).withMessage('Contraseña requerida')
], async (req, res) => {
    try {
        console.log('Datos recibidos:', req.body);
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;
        const users = getUsers();

        // Buscar usuario por email
        const user = users.find(u => 
            u.email.toLowerCase() === email.toLowerCase() && 
            (u.active === true || u.estado === 'activo')
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Verificar contraseña
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Actualizar último login
        user.lastLogin = new Date().toISOString();
        saveUsers(users);

        // Generar token - compatible con ambas estructuras
        const tokenData = {
            id: user.id,
            username: user.username || user.nombre || user.fullName,
            email: user.email,
            role: user.role || user.rol
        };

        const token = generateToken(tokenData);

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username || user.nombre || user.fullName,
                    email: user.email,
                    role: user.role || user.rol,
                    lastLogin: user.lastLogin
                }
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
    body('username').isLength({ min: 3 }).withMessage('Usuario debe tener al menos 3 caracteres'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
    body('role').isIn(['admin', 'logistics', 'route', 'local']).withMessage('Rol inválido')
], async (req, res) => {
    try {
        // Validar entrada
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: errors.array()
            });
        }

        const { username, email, password, role, fullName } = req.body;
        const users = getUsers();

        // Verificar si ya existe
        const existingUser = users.find(u => 
            u.username === username || u.email === email
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Usuario o email ya existe'
            });
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear nuevo usuario
        const newUser = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            role,
            fullName: fullName || username,
            active: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            metadata: {
                createdBy: 'system',
                preferences: {
                    language: 'es',
                    timezone: 'America/Monterrey'
                }
            }
        };

        users.push(newUser);
        
        if (!saveUsers(users)) {
            return res.status(500).json({
                success: false,
                message: 'Error guardando usuario'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role,
                    fullName: newUser.fullName,
                    createdAt: newUser.createdAt
                }
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
router.get('/profile', require('../middleware/auth').authenticateToken, (req, res) => {
    try {
        const users = getUsers();
        const user = users.find(u => u.id === req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.fullName,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt,
                    metadata: user.metadata
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
    require('../middleware/auth').authenticateToken,
    body('email').optional().isEmail().withMessage('Email inválido'),
    body('fullName').optional().isLength({ min: 2 }).withMessage('Nombre completo debe tener al menos 2 caracteres')
], (req, res) => {
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
        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar si el nuevo email ya existe
        if (email && email !== users[userIndex].email) {
            const emailExists = users.some(u => u.email === email && u.id !== req.user.id);
            if (emailExists) {
                return res.status(409).json({
                    success: false,
                    message: 'El email ya está en uso'
                });
            }
        }

        // Actualizar datos
        if (email) users[userIndex].email = email;
        if (fullName) users[userIndex].fullName = fullName;
        users[userIndex].updatedAt = new Date().toISOString();

        if (!saveUsers(users)) {
            return res.status(500).json({
                success: false,
                message: 'Error guardando cambios'
            });
        }

        res.json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: {
                user: {
                    id: users[userIndex].id,
                    username: users[userIndex].username,
                    email: users[userIndex].email,
                    role: users[userIndex].role,
                    fullName: users[userIndex].fullName
                }
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
    require('../middleware/auth').authenticateToken,
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
        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === req.user.id);

        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar contraseña actual
        const isValidPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Contraseña actual incorrecta'
            });
        }

        // Hash de la nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        users[userIndex].password = hashedNewPassword;
        users[userIndex].updatedAt = new Date().toISOString();

        if (!saveUsers(users)) {
            return res.status(500).json({
                success: false,
                message: 'Error guardando nueva contraseña'
            });
        }

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
router.post('/logout', require('../middleware/auth').authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
    });
});

module.exports = router;