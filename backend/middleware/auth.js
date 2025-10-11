// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'logistics-monterrey-secret-key-2024';

// Middleware de autenticación
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Verificar si el usuario aún existe y está activo en PostgreSQL
        const result = await pool.query(
            'SELECT id, username, email, role, full_name, ruta, sucursal, branch_id FROM users WHERE id = $1 AND active = true',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Usuario no encontrado o inactivo'
            });
        }

        const user = result.rows[0];

        // Agregar datos del usuario a la request
        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.full_name,
            ruta: user.ruta,
            sucursal: user.sucursal,
            branchId: user.branch_id
        };
        
        // También crear req.session.userData para compatibilidad con código existente
        req.session = req.session || {};
        req.session.userData = req.user;
        
        next();

    } catch (err) {
        console.error('Error verificando token:', err);
        return res.status(403).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
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

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para acceder a este recurso'
            });
        }

        next();
    };
};

// Middleware de validación de propiedad
const validateOwnership = (req, res, next) => {
    const { role, id } = req.user;
    
    // Los administradores pueden acceder a todo
    if (role === 'admin') {
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
            username: user.username,
            email: user.email,
            role: user.role,
            ruta: user.ruta,
            fullName: user.fullName || user.full_name
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
    authMiddleware: authenticateToken,  // ✅ AGREGAR ESTE ALIAS
    authorizeRoles,
    validateOwnership,
    generateToken,
    verifyToken,
    JWT_SECRET
};


/*const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'logistics-monterrey-secret-key-2024';

// Middleware de autenticación
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Verificar si el usuario aún existe y está activo en PostgreSQL
        const result = await pool.query(
            'SELECT id, username, email, role, full_name, ruta, sucursal, branch_id FROM users WHERE id = $1 AND active = true',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Usuario no encontrado o inactivo'
            });
        }

        const user = result.rows[0];

        // Agregar datos del usuario a la request
        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.full_name,
            ruta: user.ruta,
            sucursal: user.sucursal,
            branchId: user.branch_id
        };
        
        // También crear req.session.userData para compatibilidad con código existente
        req.session = req.session || {};
        req.session.userData = req.user;
        
        next();

    } catch (err) {
        console.error('Error verificando token:', err);
        return res.status(403).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
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

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para acceder a este recurso'
            });
        }

        next();
    };
};

// Middleware de validación de propiedad
const validateOwnership = (req, res, next) => {
    const { role, id } = req.user;
    
    // Los administradores pueden acceder a todo
    if (role === 'admin') {
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
            username: user.username,
            email: user.email,
            role: user.role,
            ruta: user.ruta,
            fullName: user.fullName || user.full_name
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
};*/