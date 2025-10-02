const express = require('express');
const { body, validationResult } = require('express-validator');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// GET /api/routes-management - Listar todas las rutas
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM routes ORDER BY created_at DESC');
        
        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Error obteniendo rutas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/routes-management/:id - Obtener ruta específica
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM routes WHERE id = $1', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ruta no encontrada'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error obteniendo ruta:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/routes-management - Crear nueva ruta
router.post('/', [
    authorizeRoles('admin'),
    body('nombre').notEmpty().withMessage('Nombre de ruta es requerido'),
    body('descripcion').notEmpty().withMessage('Descripción es requerida'),
    body('capacidadMaxima').isInt({ min: 1 }).withMessage('Capacidad máxima debe ser un número positivo')
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

        const { nombre, descripcion, zonaCobertura, vehiculoAsignado, capacidadMaxima } = req.body;

        // Verificar que no existe una ruta con el mismo nombre
        const existing = await pool.query('SELECT id FROM routes WHERE LOWER(nombre) = LOWER($1)', [nombre]);
        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una ruta con ese nombre'
            });
        }

        const result = await pool.query(
            `INSERT INTO routes (
                nombre, zona_cobertura, capacidad_maxima, status, 
                vehiculo_asignado, descripcion, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *`,
            [
                nombre,
                zonaCobertura || null,
                parseInt(capacidadMaxima),
                'active',
                vehiculoAsignado || null,
                descripcion
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Ruta creada exitosamente',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error creando ruta:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/routes-management/:id - Actualizar ruta
router.put('/:id', [
    authorizeRoles('admin'),
    body('status').optional().isIn(['active', 'inactive', 'maintenance']).withMessage('Estado inválido')
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

        const { id } = req.params;
        const { nombre, descripcion, zonaCobertura, vehiculoAsignado, capacidadMaxima, status } = req.body;

        // Verificar que existe
        const routeCheck = await pool.query('SELECT id FROM routes WHERE id = $1', [id]);
        if (routeCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ruta no encontrada'
            });
        }

        // Verificar nombre único si se está actualizando
        if (nombre) {
            const existing = await pool.query(
                'SELECT id FROM routes WHERE LOWER(nombre) = LOWER($1) AND id != $2',
                [nombre, id]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe una ruta con ese nombre'
                });
            }
        }

        // Construir query dinámico
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (nombre) {
            updates.push(`nombre = $${paramCount}`);
            values.push(nombre);
            paramCount++;
        }
        if (descripcion) {
            updates.push(`descripcion = $${paramCount}`);
            values.push(descripcion);
            paramCount++;
        }
        if (zonaCobertura) {
            updates.push(`zona_cobertura = $${paramCount}`);
            values.push(zonaCobertura);
            paramCount++;
        }
        if (vehiculoAsignado !== undefined) {
            updates.push(`vehiculo_asignado = $${paramCount}`);
            values.push(vehiculoAsignado);
            paramCount++;
        }
        if (capacidadMaxima) {
            updates.push(`capacidad_maxima = $${paramCount}`);
            values.push(parseInt(capacidadMaxima));
            paramCount++;
        }
        if (status) {
            updates.push(`status = $${paramCount}`);
            values.push(status);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hay campos para actualizar'
            });
        }

        values.push(id);
        const query = `UPDATE routes SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        
        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Ruta actualizada exitosamente',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error actualizando ruta:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// DELETE /api/routes-management/:id - Eliminar ruta (soft delete)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que no hay paquetes activos en esta ruta
        const packagesCheck = await pool.query(
            "SELECT COUNT(*) FROM packages WHERE ruta = $1 AND status IN ('pending', 'in_transit')",
            [id]
        );

        if (parseInt(packagesCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar la ruta porque tiene paquetes activos asignados'
            });
        }

        // Soft delete
        const result = await pool.query(
            "UPDATE routes SET status = 'inactive' WHERE id = $1 RETURNING id",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ruta no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Ruta eliminada exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando ruta:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/routes-management/:id/statistics - Estadísticas de una ruta
router.get('/:id/statistics', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la ruta existe
        const routeResult = await pool.query('SELECT * FROM routes WHERE id = $1', [id]);
        if (routeResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Ruta no encontrada'
            });
        }

        // Estadísticas
        const totalResult = await pool.query('SELECT COUNT(*) FROM packages WHERE ruta = $1', [id]);
        const deliveredResult = await pool.query("SELECT COUNT(*) FROM packages WHERE ruta = $1 AND status = 'delivered'", [id]);
        const avgTimeResult = await pool.query('SELECT AVG(diferencia_minutos) FROM packages WHERE ruta = $1 AND diferencia_minutos IS NOT NULL', [id]);
        
        const statusResult = await pool.query(
            'SELECT status, COUNT(*) FROM packages WHERE ruta = $1 GROUP BY status',
            [id]
        );

        const incidentsResult = await pool.query("SELECT COUNT(*) FROM packages WHERE ruta = $1 AND incidencia != 'ninguna'", [id]);

        const totalPaquetes = parseInt(totalResult.rows[0].count);
        const paquetesEntregados = parseInt(deliveredResult.rows[0].count);
        const tasaEntrega = totalPaquetes > 0 ? (paquetesEntregados / totalPaquetes * 100).toFixed(1) : 0;

        const estadisticasPorEstado = {};
        statusResult.rows.forEach(row => {
            estadisticasPorEstado[row.status] = parseInt(row.count);
        });

        const statistics = {
            totalPaquetes,
            paquetesEntregados,
            tasaEntrega: parseFloat(tasaEntrega),
            tiempoPromedioEntrega: parseFloat(avgTimeResult.rows[0].avg || 0).toFixed(1),
            estadisticasPorEstado,
            incidencias: parseInt(incidentsResult.rows[0].count),
            tasaIncidencias: totalPaquetes > 0 ? (parseInt(incidentsResult.rows[0].count) / totalPaquetes * 100).toFixed(1) : 0,
            ultimaActualizacion: new Date().toISOString()
        };

        res.json({
            success: true,
            data: {
                route: routeResult.rows[0],
                statistics
            }
        });

    } catch (error) {
        console.error('Error obteniendo estadísticas de ruta:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;