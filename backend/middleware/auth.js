const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'logistics-monterrey-secret-key-2024';
const usersFilePath = path.join(__dirname, '../data/users.json');

// Función para leer usuarios del archivo JSON
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

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Token inválido o expirado'
            });
        }

        // Verificar si el usuario aún existe y está activo
        const users = getUsers();
        const currentUser = users.find(u => u.id === user.id);
        
        if (!currentUser) {
            return res.status(403).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar estado activo (compatible con ambos formatos)
        const isActive = currentUser.active === true || 
                        currentUser.estado === 'activo' ||
                        currentUser.active === 'true';
        
        if (!isActive) {
            return res.status(403).json({
                success: false,
                message: 'Usuario inactivo'
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || user.rol, // Compatible con ambos formatos
            nombre: user.fullName || user.nombre || user.username
        };
        
        next();
    });
};

// Middleware de autorización por roles
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        // Compatible con ambos formatos: role y rol
        const userRole = req.user.role || req.user.rol;
        
        if (!roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para acceder a este recurso'
            });
        }

        next();
    };
};

// Middleware de validación de propiedad (para que usuarios solo accedan a sus propios recursos)
const validateOwnership = (req, res, next) => {
    const { role, rol, id } = req.user;
    const userRole = role || rol;
    
    // Los administradores pueden acceder a todo
    if (userRole === 'admin') {
        return next();
    }
    
    // Para otros roles, verificar que el recurso les pertenece
    const resourceUserId = req.params.userId || req.body.userId || req.query.userId;
    
    if (resourceUserId && resourceUserId !== id) {
        return res.status(403).json({
            success: false,
            message: 'Solo puedes acceder a tus propios recursos'
        });
    }
    
    next();
};

// Función para generar token JWT
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username || user.nombre,
            email: user.email,
            role: user.role || user.rol,
            fullName: user.fullName || user.nombre
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// Función para verificar token sin middleware (útil para websockets)
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    authenticateToken,
    authorizeRoles,
    validateOwnership,
    generateToken,
    verifyToken,
    JWT_SECRET
};