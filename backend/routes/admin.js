const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authorizeRoles } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autorización de admin a todas las rutas
router.use(authorizeRoles('admin'));

// Función para normalizar estructura de usuario
const normalizeUser = (user) => {
    return {
        id: user.id,
        nombre: user.full_name || user.nombre || user.username || 'Sin nombre',
        email: user.email,
        telefono: user.phone || user.telefono || '',
        rol: user.role || user.rol || 'chofer',
        estado: user.active === true ? 'activo' : 'inactivo',
        fechaCreacion: user.created_at || user.fechaCreacion || new Date().toISOString()
    };
};

// GET /api/admin/dashboard - Dashboard principal
// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Asegura zona local en la sesión
    await pool.query("SET TIME ZONE 'America/Monterrey'");

    // Fechas locales (hoy)
    const { rows: [{ today }] } = await pool.query("SELECT CURRENT_DATE::date AS today");
    const start = today; // YYYY-MM-DD (local)
    const end = today;

    // Totales globales (como ya tenías)
    const [ usersCount, packagesCount, routesCount, incidentsCount ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE active = true"),
      pool.query("SELECT COUNT(*) FROM packages"),
      pool.query("SELECT COUNT(*) FROM routes WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) FROM incidents")
    ]);

    const [ packagesInTransit, packagesDelivered, packagesPending, openIncidents ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM packages WHERE status = 'in_transit'"),
      pool.query("SELECT COUNT(*) FROM packages WHERE status = 'delivered'"),
      pool.query("SELECT COUNT(*) FROM packages WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM incidents WHERE status = 'pending'")
    ]);

    // ---- KPIs HOY (fecha de ENTREGA y de SALIDA en día local) ----
    const params = [start, end];

    // Entregados hoy por tiempo_entrega (día local)
    const deliveredTodayQ = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM packages
      WHERE status = 'delivered'
        AND tiempo_entrega IS NOT NULL
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') >= $1::date
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
    `, params);

    // Salieron hoy a ruta (en tránsito/asignados) por tiempo_salida_reparto (día local)
    const inTransitTodayQ = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM packages
      WHERE status IN ('in_transit','assigned')
        AND tiempo_salida_reparto IS NOT NULL
        AND (tiempo_salida_reparto AT TIME ZONE 'America/Monterrey') >= $1::date
        AND (tiempo_salida_reparto AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
    `, params);

    // Creados hoy (si te interesa verlo)
    const createdTodayQ = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM packages
      WHERE (fecha_creacion AT TIME ZONE 'America/Monterrey') >= $1::date
        AND (fecha_creacion AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
    `, params);

    const dashboardData = {
      summary: {
        // Totales (igual que antes)
        totalUsers:        parseInt(usersCount.rows[0].count),
        activeUsers:       parseInt(usersCount.rows[0].count),
        totalPackages:     parseInt(packagesCount.rows[0].count),
        packagesInTransit: parseInt(packagesInTransit.rows[0].count),
        packagesDelivered: parseInt(packagesDelivered.rows[0].count),
        packagesPending:   parseInt(packagesPending.rows[0].count),
        activeRoutes:      parseInt(routesCount.rows[0].count),
        totalIncidents:    parseInt(incidentsCount.rows[0].count),
        openIncidents:     parseInt(openIncidents.rows[0].count),

        // NUEVOS KPIs del día local
        createdToday:      createdTodayQ.rows[0].c,
        deliveredToday:    deliveredTodayQ.rows[0].c,
        inTransitToday:    inTransitTodayQ.rows[0].c,
        period: { startDate: start, endDate: end }
      }
    };

    res.json({ success: true, data: dashboardData });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo datos del dashboard' });
  }
});


/*router.get('/dashboard', async (req, res) => {
    try {
        // Consultas agregadas
        const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE active = true');
        const packagesCount = await pool.query('SELECT COUNT(*) FROM packages');
        const packagesInTransit = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'in_transit'");
        const packagesDelivered = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'delivered'");
        const packagesPending = await pool.query("SELECT COUNT(*) FROM packages WHERE status = 'pending'");
        const routesCount = await pool.query("SELECT COUNT(*) FROM routes WHERE status = 'active'");
        const incidentsCount = await pool.query('SELECT COUNT(*) FROM incidents');
        const openIncidents = await pool.query("SELECT COUNT(*) FROM incidents WHERE status = 'pending'");

        const dashboardData = {
            summary: {
                totalUsers: parseInt(usersCount.rows[0].count),
                activeUsers: parseInt(usersCount.rows[0].count),
                totalPackages: parseInt(packagesCount.rows[0].count),
                packagesInTransit: parseInt(packagesInTransit.rows[0].count),
                packagesDelivered: parseInt(packagesDelivered.rows[0].count),
                packagesPending: parseInt(packagesPending.rows[0].count),
                activeRoutes: parseInt(routesCount.rows[0].count),
                totalIncidents: parseInt(incidentsCount.rows[0].count),
                openIncidents: parseInt(openIncidents.rows[0].count)
            }
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo datos del dashboard'
        });
    }
});*/

// GET /api/admin/users - Listar usuarios
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
        
        // Normalizar y limpiar usuarios (sin contraseñas)
        const normalizedUsers = result.rows.map(user => {
            const normalized = normalizeUser(user);
            const { password, ...safeUser } = normalized;
            return safeUser;
        });

        res.json({
            success: true,
            data: {
                users: normalizedUsers
            }
        });

    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo usuarios'
        });
    }
});

// POST /api/admin/users - Crear usuario
router.post('/users', [
    body('nombre').notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('rol').isIn(['admin', 'chofer', 'supervisor', 'logistics', 'local']).withMessage('Rol inválido')
], async (req, res) => {
    console.log('📥 Datos recibidos:', req.body);
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ Errores de validación:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: errors.array()
            });
        }

        const { nombre, email, telefono, password, rol, branchId, sucursal } = req.body;
        
        // Validación condicional: si es receptor local, debe tener sucursal
        if (rol === 'local' && !branchId) {
            return res.status(400).json({
                success: false,
                message: 'El receptor local debe tener una sucursal asignada'
            });
        }

        // Verificar email único
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }

        // Crear nuevo usuario
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = email.split('@')[0];
        
        const result = await pool.query(
            `INSERT INTO users (
                username, email, password, full_name, role, 
                branch_id, sucursal, active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING id`,
            [
                username,
                email,
                hashedPassword,
                nombre,
                rol,
                rol === 'local' ? branchId : null,
                rol === 'local' ? sucursal : null,
                true
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente',
            data: { id: result.rows[0].id }
        });

    } catch (error) {
        console.error('❌ Error creando usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/admin/users/:id - Editar usuario
router.put('/users/:id', [
    body('nombre').notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('rol').isIn(['admin', 'chofer', 'supervisor', 'logistics', 'local']).withMessage('Rol inválido')
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

        const { id } = req.params;
        const { nombre, email, telefono, password, rol } = req.body;

        // Verificar usuario existe
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar email único (excluyendo el usuario actual)
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }

        // Construir query de actualización
        let query = `UPDATE users SET full_name = $1, email = $2, role = $3`;
        let params = [nombre, email, rol];
        let paramCount = 4;

        if (telefono) {
            query += `, phone = $${paramCount}`;
            params.push(telefono);
            paramCount++;
        }

        if (password && password.trim()) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = $${paramCount}`;
            params.push(hashedPassword);
            paramCount++;
        }

        query += ` WHERE id = $${paramCount}`;
        params.push(id);

        await pool.query(query, params);

        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/admin/users/:id/estado - Cambiar estado de usuario
router.put('/users/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        // No permitir desactivar el propio usuario
        if (id === req.user.id && estado === 'inactivo') {
            return res.status(400).json({
                success: false,
                message: 'No puedes desactivar tu propio usuario'
            });
        }

        // Verificar que no sea el último admin
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        if (userCheck.rows[0].role === 'admin' && estado === 'inactivo') {
            const activeAdmins = await pool.query(
                "SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = true AND id != $1",
                [id]
            );
            
            if (parseInt(activeAdmins.rows[0].count) === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede desactivar el último administrador'
                });
            }
        }

        await pool.query('UPDATE users SET active = $1 WHERE id = $2', [estado === 'activo', id]);

        res.json({
            success: true,
            message: `Usuario ${estado === 'activo' ? 'activado' : 'desactivado'} exitosamente`
        });

    } catch (error) {
        console.error('Error cambiando estado:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// DELETE /api/admin/users/:id - Eliminar usuario
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // No permitir eliminar el propio usuario
        if (id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'No puedes eliminar tu propio usuario'
            });
        }

        // Verificar que no sea el último admin
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        if (userCheck.rows[0].role === 'admin') {
            const otherAdmins = await pool.query(
                "SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != $1",
                [id]
            );
            
            if (parseInt(otherAdmins.rows[0].count) === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el último administrador'
                });
            }
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Usuario eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

module.exports = router;