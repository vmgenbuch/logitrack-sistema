// backend/routes/local.js
const express = require('express');
const router = express.Router();
const { authMiddleware, authorizeRoles } = require('../middleware/auth');
const pool = require('../database/connection');

// GET - Obtener todos los paquetes
router.get('/packages', authMiddleware, authorizeRoles('local', 'admin', 'logistics'), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.*,
                r.nombre as ruta_nombre,
                b.nombre as sucursal_nombre
            FROM packages p
            LEFT JOIN routes r ON p.ruta = r.id
            LEFT JOIN branches b ON p.sucursal_destino = b.id
            ORDER BY p.fecha_creacion DESC
        `);
        
        res.json({
            success: true,
            data: { packages: result.rows }
        });
    } catch (error) {
        console.error('Error obteniendo paquetes:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo paquetes',
            error: error.message
        });
    }
});

// GET - Obtener paquete por ID o tracking number
router.get('/packages/:identifier', authMiddleware, authorizeRoles('local', 'admin', 'logistics'), async (req, res) => {
    try {
        const { identifier } = req.params;
        
        // Intentar buscar por UUID o por tracking number
        const result = await pool.query(`
            SELECT 
                p.*,
                r.nombre as ruta_nombre,
                b.nombre as sucursal_nombre
            FROM packages p
            LEFT JOIN routes r ON p.ruta = r.id
            LEFT JOIN branches b ON p.sucursal_destino = b.id
            WHERE p.id::text = $1 OR p.tracking_number = $1
            LIMIT 1
        `, [identifier]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error obteniendo paquete:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo paquete',
            error: error.message
        });
    }
});

// PUT - Actualizar paquete (validación del receptor)
router.put('/packages/:id', authMiddleware, authorizeRoles('local', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { validacionReceptor } = req.body;
        
        const result = await pool.query(`
            UPDATE packages 
            SET validacion_receptor = $1
            WHERE id = $2
            RETURNING *
        `, [JSON.stringify(validacionReceptor), id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Paquete actualizado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error actualizando paquete:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando paquete',
            error: error.message
        });
    }
});

// POST - Crear incidente independiente
router.post('/incidents', authMiddleware, authorizeRoles('local', 'admin'), async (req, res) => {
    try {
        const {
            trackingNumber,
            packageId,
            type,
            severity,
            description,
            photo,
            reportedBy,
            branchId,
            branchName
        } = req.body;
        
        const result = await pool.query(`
            INSERT INTO incidents (
                tracking_number,
                package_id,
                type,
                severity,
                description,
                photo,
                reported_by,
                branch_id,
                branch_name,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
            RETURNING *
        `, [trackingNumber, packageId, type, severity, description, photo, reportedBy, branchId, branchName]);
        
        res.json({
            success: true,
            message: 'Incidente creado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creando incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error creando incidente',
            error: error.message
        });
    }
});

// GET - Obtener incidentes por sucursal
router.get('/incidents/branch/:branchId', authMiddleware, authorizeRoles('local', 'admin'), async (req, res) => {
    try {
        const { branchId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM incidents 
            WHERE branch_id = $1 
            ORDER BY created_at DESC
        `, [branchId]);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error obteniendo incidentes:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo incidentes',
            error: error.message
        });
    }
});

module.exports = router;