const express = require('express');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');
const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('admin', 'logistics'));

// GET /api/logistics/packages - Vista de paquetes para logística
router.get('/packages', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, r.nombre as ruta_nombre 
             FROM packages p 
             LEFT JOIN routes r ON p.ruta = r.id 
             WHERE p.status IN ('pending', 'in_transit')
             ORDER BY p.prioridad DESC, p.fecha_creacion ASC`
        );
        
        res.json({
            success: true,
            data: {
                packages: result.rows,
                total: result.rows.length
            }
        });
    } catch (error) {
        console.error('Error en logistics/packages:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo paquetes'
        });
    }
});

// GET /api/logistics/stats - Estadísticas para el dashboard de logística
router.get('/stats', async (req, res) => {
    try {
        const pending = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'pending'");
        const inTransit = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'in_transit'");
        const delivered = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'delivered'");
        
        res.json({
            success: true,
            data: {
                pending: parseInt(pending.rows[0].count),
                inTransit: parseInt(inTransit.rows[0].count),
                deliveredToday: parseInt(delivered.rows[0].count)
            }
        });
    } catch (error) {
        console.error('Error en logistics/stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas'
        });
    }
});

module.exports = router;