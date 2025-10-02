const express = require('express');
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

module.exports = router;