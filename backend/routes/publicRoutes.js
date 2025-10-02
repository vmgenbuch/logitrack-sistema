const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const routesFile = path.join(__dirname, '../data/routes.json');

// GET /api/public/routes - Obtener todas las rutas
router.get('/routes', (req, res) => {
    try {
        if (fs.existsSync(routesFile)) {
            const data = fs.readFileSync(routesFile, 'utf8');
            const routes = JSON.parse(data);
            
            res.json({
                success: true,
                data: routes
            });
        } else {
            res.json({
                success: true,
                data: []
            });
        }
    } catch (error) {
        console.error('Error leyendo rutas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;