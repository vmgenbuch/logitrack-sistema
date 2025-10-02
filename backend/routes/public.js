const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Función helper para leer sucursales
const readBranches = async () => {
    try {
        const branchesFile = path.join(__dirname, '../data/branches.json');
        const data = await fs.readFile(branchesFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

// GET /api/public/branches - Obtener sucursales (sin autenticación)
router.get('/branches', async (req, res) => {
    try {
        console.log('📋 Cargando sucursales para selector de paquetes');
        const branches = await readBranches();
        res.json({
            success: true,
            data: { branches }
        });
    } catch (error) {
        console.error('Error obteniendo sucursales:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo sucursales'
        });
    }
});

module.exports = router;