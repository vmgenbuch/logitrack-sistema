const express = require('express');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');
const router = express.Router();

// Aplicar autenticación
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'chofer'));

// GET /api/route/assigned - Obtener ruta asignada al conductor
router.get('/assigned', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener información del usuario
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }
        
        const user = userResult.rows[0];
        const assignedRouteId = user.ruta_asignada || user.assigned_route;
        
        if (!assignedRouteId) {
            return res.json({
                success: true,
                message: 'No tienes ruta asignada',
                data: null
            });
        }
        
        // Obtener detalles de la ruta
        const routeResult = await pool.query(
            'SELECT * FROM routes WHERE id = $1',
            [assignedRouteId]
        );
        
        if (routeResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'Ruta no encontrada',
                data: null
            });
        }
        
        const route = routeResult.rows[0];
        
        // Obtener paquetes del día para esta ruta
        const today = new Date().toISOString().split('T')[0];
        const packagesResult = await pool.query(
            `SELECT * FROM packages 
             WHERE ruta = $1 
             AND DATE(fecha_creacion) = $2
             AND status NOT IN ('delivered', 'cancelled')
             ORDER BY 
                CASE prioridad 
                    WHEN 'urgente' THEN 0
                    WHEN 'alta' THEN 1
                    ELSE 2
                END,
                fecha_creacion ASC`,
            [assignedRouteId, today]
        );
        
        res.json({
            success: true,
            data: {
                route: route,
                packages: packagesResult.rows,
                totalPackages: packagesResult.rows.length,
                date: today
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo ruta asignada:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo ruta asignada'
        });
    }
});

// GET /api/route/my-stats - Estadísticas del conductor
router.get('/my-stats', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Obtener ruta asignada
        const userResult = await pool.query('SELECT ruta_asignada FROM users WHERE id = $1', [userId]);
        const routeId = userResult.rows[0]?.ruta_asignada;
        
        if (!routeId) {
            return res.json({
                success: true,
                data: { totalDelivered: 0, totalPending: 0, averageTime: 0 }
            });
        }
        
        // Estadísticas del conductor
        const delivered = await pool.query(
            "SELECT COUNT(*) FROM packages WHERE ruta = $1 AND status = 'delivered'",
            [routeId]
        );
        
        const pending = await pool.query(
            "SELECT COUNT(*) FROM packages WHERE ruta = $1 AND status IN ('pending', 'in_transit')",
            [routeId]
        );
        
        const avgTime = await pool.query(
            'SELECT AVG(diferencia_minutos) FROM packages WHERE ruta = $1 AND diferencia_minutos IS NOT NULL',
            [routeId]
        );
        
        res.json({
            success: true,
            data: {
                totalDelivered: parseInt(delivered.rows[0].count),
                totalPending: parseInt(pending.rows[0].count),
                averageTime: Math.round(parseFloat(avgTime.rows[0].avg || 0))
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas'
        });
    }
});

module.exports = router;