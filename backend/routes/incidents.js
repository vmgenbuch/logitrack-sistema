const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const pool = require('../database/connection');

// Crear incidente
router.post('/', authenticateToken, async (req, res) => {
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
            branchName,
            status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO incidents (
                tracking_number, package_id, type, severity, description,
                photo, reported_by, branch_id, branch_name, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *`,
            [
                trackingNumber || 'Sin tracking',
                packageId || null,
                type,
                severity,
                description,
                photo || null,
                reportedBy,
                branchId || null,
                branchName || null,
                status || 'pending'
            ]
        );
        
        res.json({
            success: true,
            message: 'Incidente reportado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creando incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reportar incidente: ' + error.message
        });
    }
});

// Obtener todos los incidentes
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM incidents ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error obteniendo incidentes:', error);
        res.json({
            success: true,
            data: []
        });
    }
});

// Obtener incidente por ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM incidents WHERE id = $1',
            [req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error obteniendo incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo incidente'
        });
    }
});

// Actualizar estado de incidente
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { status, resolution } = req.body;
        
        const result = await pool.query(
            `UPDATE incidents 
             SET status = $1, 
                 resolution = $2, 
                 resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
             WHERE id = $3
             RETURNING *`,
            [status, resolution || null, req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Incidente actualizado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error actualizando incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando incidente'
        });
    }
});

module.exports = router;