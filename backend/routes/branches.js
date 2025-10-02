const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();

// Endpoint público de sucursales (ANTES de authenticateToken)
router.get('/public-list', async (req, res) => {
    try {
        console.log('Accediendo a endpoint público de sucursales');
        const result = await pool.query('SELECT * FROM branches WHERE estado = $1 ORDER BY nombre', ['activa']);
        
        res.json({
            success: true,
            data: { branches: result.rows }
        });
    } catch (error) {
        console.error('Error en endpoint público:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo sucursales'
        });
    }
});

// Aplicar autenticación y autorización
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'logistics'));

// GET /api/admin/branches - Listar sucursales
router.get('/branches', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM branches ORDER BY created_at DESC');
        
        res.json({
            success: true,
            data: {
                branches: result.rows
            }
        });

    } catch (error) {
        console.error('Error obteniendo sucursales:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo sucursales'
        });
    }
});

// POST /api/admin/branches - Crear sucursal
router.post('/branches', [
    body('nombre').notEmpty().withMessage('El nombre es requerido'),
    body('codigo').notEmpty().withMessage('El código es requerido'),
    body('direccion.calle').notEmpty().withMessage('La calle es requerida'),
    body('direccion.ciudad').notEmpty().withMessage('La ciudad es requerida'),
    body('contacto.telefono').notEmpty().withMessage('El teléfono es requerido'),
    body('zona').isIn(['Norte', 'Sur', 'Este', 'Oeste', 'Centro']).withMessage('Zona inválida'),
    body('capacidad').isInt({ min: 1 }).withMessage('La capacidad debe ser un número positivo')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const { nombre, codigo, direccion, contacto, capacidad, zona, horarios } = req.body;

        // Verificar código único
        const codeCheck = await pool.query('SELECT id FROM branches WHERE codigo = $1', [codigo]);
        if (codeCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El código de sucursal ya existe'
            });
        }

        const result = await pool.query(
            `INSERT INTO branches (
                nombre, codigo, direccion, contacto, horarios, 
                estado, capacidad, zona, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id`,
            [
                nombre,
                codigo,
                JSON.stringify(direccion),
                JSON.stringify(contacto),
                JSON.stringify(horarios || {
                    lunes: '08:00-18:00',
                    martes: '08:00-18:00',
                    miercoles: '08:00-18:00',
                    jueves: '08:00-18:00',
                    viernes: '08:00-18:00',
                    sabado: '08:00-14:00',
                    domingo: 'Cerrado'
                }),
                'activa',
                parseInt(capacidad),
                zona,
                JSON.stringify({
                    creadoPor: req.user.id,
                    ultimaActualizacion: new Date().toISOString()
                })
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Sucursal creada exitosamente',
            data: { id: result.rows[0].id }
        });

    } catch (error) {
        console.error('Error creando sucursal:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/admin/branches/:id - Editar sucursal
router.put('/branches/:id', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const { id } = req.params;
        const { nombre, codigo, direccion, contacto, capacidad, zona, horarios } = req.body;

        // Verificar que existe
        const branchCheck = await pool.query('SELECT id FROM branches WHERE id = $1', [id]);
        if (branchCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });
        }

        // Verificar código único
        const codeCheck = await pool.query('SELECT id FROM branches WHERE codigo = $1 AND id != $2', [codigo, id]);
        if (codeCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El código de sucursal ya está en uso'
            });
        }

        await pool.query(
            `UPDATE branches SET 
                nombre = $1, codigo = $2, direccion = $3, contacto = $4,
                horarios = $5, capacidad = $6, zona = $7,
                metadata = metadata || $8::jsonb
            WHERE id = $9`,
            [
                nombre,
                codigo,
                JSON.stringify(direccion),
                JSON.stringify(contacto),
                JSON.stringify(horarios),
                parseInt(capacidad),
                zona,
                JSON.stringify({
                    ultimaActualizacion: new Date().toISOString(),
                    modificadoPor: req.user.id
                }),
                id
            ]
        );

        res.json({
            success: true,
            message: 'Sucursal actualizada exitosamente'
        });

    } catch (error) {
        console.error('Error actualizando sucursal:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// PUT /api/admin/branches/:id/estado - Cambiar estado
router.put('/branches/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!['activa', 'inactiva'].includes(estado)) {
            return res.status(400).json({
                success: false,
                message: 'Estado inválido. Debe ser "activa" o "inactiva"'
            });
        }

        const result = await pool.query(
            'UPDATE branches SET estado = $1 WHERE id = $2 RETURNING id',
            [estado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });
        }

        res.json({
            success: true,
            message: `Sucursal ${estado === 'activa' ? 'activada' : 'desactivada'} exitosamente`
        });

    } catch (error) {
        console.error('Error cambiando estado:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// DELETE /api/admin/branches/:id - Eliminar sucursal
router.delete('/branches/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que no tenga paquetes asignados
        const packagesCheck = await pool.query('SELECT COUNT(*) FROM packages WHERE sucursal_destino = $1', [id]);
        if (parseInt(packagesCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar una sucursal con paquetes asignados'
            });
        }

        const result = await pool.query('DELETE FROM branches WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });
        }

        res.json({
            success: true,
            message: 'Sucursal eliminada exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando sucursal:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// GET /api/admin/branches/stats - Estadísticas
router.get('/branches/stats', async (req, res) => {
    try {
        const totalResult = await pool.query('SELECT COUNT(*) FROM branches');
        const activasResult = await pool.query("SELECT COUNT(*) FROM branches WHERE estado = 'activa'");
        const zonaResult = await pool.query('SELECT zona, COUNT(*) FROM branches GROUP BY zona');
        const capacidadResult = await pool.query('SELECT SUM(capacidad) FROM branches');

        const porZona = {};
        zonaResult.rows.forEach(row => {
            porZona[row.zona] = parseInt(row.count);
        });

        const stats = {
            total: parseInt(totalResult.rows[0].count),
            activas: parseInt(activasResult.rows[0].count),
            inactivas: parseInt(totalResult.rows[0].count) - parseInt(activasResult.rows[0].count),
            porZona,
            capacidadTotal: parseInt(capacidadResult.rows[0].sum || 0)
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo estadísticas' });
    }
});

// GET /api/admin/branches/list - Lista para packages
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM branches WHERE estado = $1 ORDER BY nombre', ['activa']);
        res.json({
            success: true,
            data: { branches: result.rows }
        });
    } catch (error) {
        console.error('Error en endpoint /list:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo sucursales' });
    }
});

module.exports = router;