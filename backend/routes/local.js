// routes/local.js
const express = require('express');
const { authorizeRoles } = require('../middleware/auth');
const Package = require('../models/Package'); // ajusta el path a tu modelo real
const router = express.Router();

router.use(authorizeRoles('admin', 'local'));

// Ping
router.get('/status', (req, res) => {
  res.json({ success: true, message: 'Estado local - En desarrollo', data: [] });
});

// ✅ NUEVO: obtener paquete por número de tracking
router.get('/packages/tracking/:trackingNumber', async (req, res) => {
  const { trackingNumber } = req.params;

  try {
    // Ajusta el nombre del campo según tu esquema:
    // Si tu modelo usa "trackingNumber":
    let pkg = await Package.findOne({ trackingNumber });

    // Si tu campo se llama distinto (por ejemplo "tracking" o "tracking_id"), descomenta una:
    // let pkg = await Package.findOne({ tracking: trackingNumber });
    // let pkg = await Package.findOne({ tracking_id: trackingNumber });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Paquete no encontrado',
        path: req.path
      });
    }

    return res.json({ success: true, data: pkg });
  } catch (err) {
    console.error('GET /packages/tracking error:', err);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener paquete',
      error: err.message
    });
  }
});

module.exports = router;

/*const express = require('express');
const { authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.use(authorizeRoles('admin', 'local'));

router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'Estado local - En desarrollo',
        data: []
    });
});

module.exports = router;*/