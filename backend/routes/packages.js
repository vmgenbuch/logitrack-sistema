 const express = require('express');
const { body, validationResult } = require('express-validator');
const { authorizeRoles } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(require('../middleware/auth').authenticateToken);

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

// Generar número de tracking único
const generateTrackingNumber = () => {
    const prefix = 'MTY';
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${year}${timestamp}${random}`;
};

// ✅ NUEVO: Calcular peso TOTAL (suma) de múltiples fotos
const calcularPesoTotal = (fotos) => {
    if (!fotos || !Array.isArray(fotos) || fotos.length === 0) return null;
    const suma = fotos.reduce((sum, foto) => sum + (parseFloat(foto.weight) || 0), 0);
    return parseFloat(suma.toFixed(2)); // ✅ Retorna la SUMA total
};

// ==========================================
// ENDPOINTS EXISTENTES
// ==========================================

// GET /api/packages - Listar todos los paquetes
router.get('/', authorizeRoles('admin', 'logistics', 'local'), async (req, res) => {
  try {
    // Asegura interpretación local correcta al castear DATE → TIMESTAMP
    await pool.query("SET TIME ZONE 'America/Monterrey'");

    const { status, ruta, limit, offset, fromDate, toDate } = req.query;

    // Validación simple de fechas (yyyy-MM-dd)
    const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if ((fromDate && !isDate(fromDate)) || (toDate && !isDate(toDate))) {
      return res.status(400).json({ success: false, message: 'Formato de fecha inválido. Usa yyyy-MM-dd.' });
    }

    let where = 'WHERE 1=1';
    const params = [];
    let i = 1;

    if (status) {
      where += ` AND status = $${i++}`;
      params.push(status);
    } else {
      // Evita cancelados por defecto (como ya hacías)
      where += ` AND status != 'cancelled'`;
    }

    if (ruta) {
      where += ` AND ruta = $${i++}`;
      params.push(ruta);
    }

    // Rango local [from, to+1 día)
    if (fromDate) {
      // 00:00:00 local del fromDate
      where += ` AND fecha_creacion >= $${i++}::date`;
      params.push(fromDate);
    }
    if (toDate) {
      // exclusivo al inicio del día siguiente (local)
      where += ` AND fecha_creacion < ($${i++}::date + INTERVAL '1 day')`;
      params.push(toDate);
    }

    let order = ' ORDER BY fecha_creacion DESC';
    let paging = '';
    if (limit)  { paging += ` LIMIT $${i++}`;  params.push(parseInt(limit)); }
    if (offset) { paging += ` OFFSET $${i++}`; params.push(parseInt(offset)); }

    const sql = `SELECT * FROM packages ${where}${order}${paging}`;
    const rows = (await pool.query(sql, params)).rows;

    // Count consistente (mismo WHERE, sin ORDER/LIMIT/OFFSET)
    const countSql = `SELECT COUNT(*)::int AS c FROM packages ${where}`;
    const total = (await pool.query(countSql, params.slice(0, i-1 - (limit?1:0) - (offset?1:0)))).rows[0].c;

    res.json({
      success: true,
      data: {
        packages: rows,
        pagination: {
          total,
          offset: parseInt(offset) || 0,
          limit : parseInt(limit) || rows.length,
          hasMore: ((parseInt(offset)||0) + rows.length) < total
        }
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// GET /api/packages/my-assignments - Paquetes asignados al chofer
router.get('/my-assignments', authorizeRoles('chofer', 'admin', 'logistics'), async (req, res) => {
    try {
        const userId = req.user.id;
        
        const userResult = await pool.query('SELECT * FROM users WHERE id::text = $1', [userId]);
        
        if (userResult.rows.length === 0) {
            return res.json({
                success: true,
                data: { 
                    packages: [],
                    message: 'Usuario no encontrado' 
                }
            });
        }
        
        const driver = userResult.rows[0];
        const driverRoute = driver.ruta_asignada || driver.ruta;
        
        if (!driverRoute) {
            return res.json({
                success: true,
                data: { 
                    packages: [],
                    message: 'No tienes ruta asignada'
                }
            });
        }
        
        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");

        const result = await pool.query(
          `SELECT * FROM packages 
           WHERE ruta = $1 
           AND fecha_creacion::date = CURRENT_DATE
           AND status NOT IN ('delivered', 'cancelled')
           ORDER BY 
             CASE prioridad 
             WHEN 'urgente' THEN 0
             WHEN 'alta' THEN 1
              ELSE 2
             END,
              fecha_creacion ASC`,
            [driverRoute]
        );

        res.json({
            success: true,
            data: {
                packages: result.rows,
                route: driverRoute,
                total: result.rows.length
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo paquetes del chofer:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo paquetes'
        });
    }
});

// GET /api/packages/:id - Obtener paquete específico
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM packages WHERE id::text = $1 OR tracking_number = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error obteniendo paquete:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/packages - Crear nuevo paquete
router.post('/', [
    authorizeRoles('admin', 'logistics'),
    body('cliente').notEmpty().withMessage('Cliente es requerido'),
    body('direccion').notEmpty().withMessage('Dirección es requerida'),
    body('ruta').notEmpty().withMessage('Ruta es requerida'),
    body('pesoEstimado').isFloat({ min: 0 }).withMessage('Peso estimado debe ser un número positivo')
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

        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");

        const { cliente, direccion, ruta, pesoEstimado, descripcion, prioridad, telefono, sucursalDestino } = req.body;

        // Verificar que la ruta existe
        const routeCheck = await pool.query('SELECT id FROM routes WHERE id::text = $1', [ruta]);
        if (routeCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'La ruta especificada no existe'
            });
        }

        const trackingNumber = generateTrackingNumber();
        
        const result = await pool.query(
            `INSERT INTO packages (
                tracking_number, cliente, direccion, telefono, ruta, sucursal_destino,
                descripcion, prioridad, status, peso_estimado, 
                incidencia, validacion_receptor, fecha_creacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
                trackingNumber,
                cliente,
                direccion,
                telefono || null,
                ruta,
                sucursalDestino || null,
                descripcion || '',
                prioridad || 'normal',
                'pending',
                parseFloat(pesoEstimado),
                'ninguna',
                JSON.stringify({
                    fechaValidacion: null,
                    receptorLocal: null,
                    statusValidacion: 'pendiente',
                    tipoIncidencia: null,
                    descripcionIncidencia: null,
                    fotoIncidencia: null,
                    severidad: null,
                    requiereDevolucion: false,
                    incidenciaResuelta: false,
                    fechaResolucion: null,
                    comentariosResolucion: null
                })
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Paquete creado exitosamente',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error creando paquete:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// PUT /api/packages/:id - Actualizar paquete
router.put('/:id', async (req, res) => {
    try {
        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");
        
        const updates = req.body;
        const userRole = req.user.role;
        
        // Convertir camelCase a snake_case
        const fieldMapping = {
            'tiempoSalidaReparto': 'tiempo_salida_reparto',
            'tiempoEntrega': 'tiempo_entrega',
            'pesoSalida': 'peso_salida',
            'pesoEntrega': 'peso_entrega',
            'fotoSalida': 'foto_salida',
            'fotoEntrega': 'foto_entrega',
            'nombreQuienRecibio': 'nombre_quien_recibio',
            'cargoQuienRecibio': 'cargo_quien_recibio',
            'firmaDigital': 'firma_digital'
        };
        
        Object.keys(fieldMapping).forEach(camelKey => {
            if (updates[camelKey] !== undefined) {
                updates[fieldMapping[camelKey]] = updates[camelKey];
                delete updates[camelKey];
            }
        });
        
        // Agregar timestamps automáticamente desde PostgreSQL con timezone explícito
        if (updates.status === 'in_transit' && !updates.tiempo_salida_reparto) {
    const timeResult = await pool.query("SELECT NOW()::text as now");
    updates.tiempo_salida_reparto = timeResult.rows[0].now;
}

if (updates.status === 'delivered' && !updates.tiempo_entrega) {
    const timeResult = await pool.query("SELECT NOW()::text as now");
    updates.tiempo_entrega = timeResult.rows[0].now;
}
        
        // Control de permisos
        if (userRole === 'chofer') {
            const allowedFields = ['status', 'tiempo_salida_reparto', 'tiempo_entrega', 
                                  'peso_salida', 'peso_entrega', 'foto_salida', 'foto_entrega',
                                  'nombre_quien_recibio', 'cargo_quien_recibio', 'firma_digital', 'incidencia'];
            Object.keys(updates).forEach(key => {
                if (!allowedFields.includes(key)) delete updates[key];
            });
        }

        if (userRole === 'local') {
            const allowedFields = ['validacion_receptor'];
            Object.keys(updates).forEach(key => {
                if (!allowedFields.includes(key)) delete updates[key];
            });
        }

        // Construir query dinámicamente
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        
        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
        }

        const setClause = fields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
        values.push(req.params.id);

        const query = `UPDATE packages SET ${setClause} WHERE id::text = $${values.length} RETURNING *`;
        
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
        }

        res.json({
            success: true,
            message: 'Paquete actualizado exitosamente',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error actualizando paquete:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// DELETE /api/packages/:id - Cancelar paquete
router.delete('/:id', authorizeRoles('admin', 'logistics'), async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE packages 
             SET status = 'cancelled'
             WHERE id::text = $1
             RETURNING *`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Paquete no encontrado' });
        }

        res.json({ success: true, message: 'Paquete cancelado exitosamente' });

    } catch (error) {
        console.error('Error cancelando paquete:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ==========================================
// ✅ NUEVOS ENDPOINTS - MÚLTIPLES FOTOS
// ==========================================

// POST /api/packages/:id/pickup-photos - Registrar recogida con múltiples fotos y pesos
router.post('/:id/pickup-photos', authorizeRoles('chofer'), async (req, res) => {
    try {
        await pool.query("SET timezone = 'America/Monterrey'");
        
        const { id } = req.params;
        const { fotosBascula } = req.body; // Array de objetos { photoData, weight, timestamp }
        
        console.log(`📦 Recogida iniciada para paquete ${id}`);
        console.log(`📸 Fotos recibidas: ${fotosBascula?.length || 0}`);
        
        if (!fotosBascula || !Array.isArray(fotosBascula) || fotosBascula.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere al menos una foto con peso'
            });
        }
        
        // Validar que todas las fotos tengan peso
        const fotosInvalidas = fotosBascula.filter(f => !f.weight || f.weight <= 0);
        if (fotosInvalidas.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Todas las fotos deben tener un peso válido mayor a 0'
            });
        }
        
        // ✅ Calcular peso TOTAL (suma de todas las fotos)
        const pesoTotal = calcularPesoTotal(fotosBascula);
        
        console.log(`⚖️ Recogida: ${fotosBascula.length} fotos, peso total: ${pesoTotal} kg`);
        
        const timeResult = await pool.query("SELECT NOW()::text as now");
        const ahora = timeResult.rows[0].now;
        
        const result = await pool.query(
           `UPDATE packages 
            SET status = 'in_transit',
                tiempo_salida_reparto = NOW(),
                peso_salida = $1,
                fotos_bascula = $2
            WHERE id::text = $3 OR tracking_number = $3
            RETURNING *`,
            [pesoTotal, JSON.stringify(fotosBascula), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }
        
        console.log(`✅ Recogida completada: ${fotosBascula.length} fotos, peso total ${pesoTotal} kg`);
        
        res.json({
            success: true,
            message: 'Recogida registrada exitosamente',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Error en pickup-photos:', error);
        res.status(500).json({
            success: false,
            message: 'Error registrando recogida'
        });
    }
});

// POST /api/packages/:id/delivery-photos - Registrar entrega con múltiples fotos y pesos
router.post('/:id/delivery-photos', authorizeRoles('chofer'), async (req, res) => {
    try {
        await pool.query("SET timezone = 'America/Monterrey'");
        
        const { id } = req.params;
        const { fotosEntrega, nombreQuienRecibio, cargoQuienRecibio, firmaDigital } = req.body;
        
        console.log(`📦 Entrega iniciada para paquete ${id}`);
        console.log(`📸 Fotos recibidas: ${fotosEntrega?.length || 0}`);
        
        if (!fotosEntrega || !Array.isArray(fotosEntrega) || fotosEntrega.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere al menos una foto con peso'
            });
        }
        
        // Validar que todas las fotos tengan peso
        const fotosInvalidas = fotosEntrega.filter(f => !f.weight || f.weight <= 0);
        if (fotosInvalidas.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Todas las fotos deben tener un peso válido mayor a 0'
            });
        }
        
        // ✅ Calcular peso TOTAL (suma de todas las fotos)
        const pesoTotal = calcularPesoTotal(fotosEntrega);
        
        console.log(`⚖️ Entrega: ${fotosEntrega.length} fotos, peso total: ${pesoTotal} kg`);
        
        const timeResult = await pool.query("SELECT NOW()::text as now");
        const ahora = timeResult.rows[0].now;
        
        const result = await pool.query(
           `UPDATE packages 
            SET status = 'delivered',
                tiempo_entrega = NOW(),
                peso_entrega = $1,
                fotos_entrega = $2,
                nombre_quien_recibio = $3,
                cargo_quien_recibio = $4,
                firma_digital = $5,
                hora_firma = NOW()
            WHERE id::text = $6 OR tracking_number = $6
            RETURNING *`,
            [pesoTotal, JSON.stringify(fotosEntrega), nombreQuienRecibio, cargoQuienRecibio, firmaDigital, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }
        
        console.log(`✅ Entrega completada: ${fotosEntrega.length} fotos, peso total ${pesoTotal} kg`);
        
        res.json({
            success: true,
            message: 'Entrega registrada exitosamente',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Error en delivery-photos:', error);
        res.status(500).json({
            success: false,
            message: 'Error registrando entrega'
        });
    }
});

// GET /api/packages/:id/evidencias - Obtener evidencias detalladas del paquete
router.get('/:id/evidencias', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `SELECT 
                tracking_number,
                cliente,
                status,
                peso_estimado,
                peso_salida,
                peso_entrega,
                diferencia_peso,
                fotos_bascula,
                fotos_entrega,
                tiempo_salida_reparto,
                tiempo_entrega,
                nombre_quien_recibio,
                cargo_quien_recibio,
                firma_digital
             FROM packages 
             WHERE id::text = $1 OR tracking_number = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }
        
        const pkg = result.rows[0];
        
        // Parsear los JSONs
        const fotosBascula = pkg.fotos_bascula || [];
        const fotosEntrega = pkg.fotos_entrega || [];
        
        res.json({
            success: true,
            data: {
                tracking_number: pkg.tracking_number,
                cliente: pkg.cliente,
                status: pkg.status,
                pesos: {
                    estimado: pkg.peso_estimado,
                    salida: pkg.peso_salida,
                    entrega: pkg.peso_entrega,
                    diferencia: pkg.diferencia_peso
                },
                evidencias: {
                    recogida: {
                        timestamp: pkg.tiempo_salida_reparto,
                        pesoTotal: pkg.peso_salida,
                        fotos: fotosBascula,
                        cantidadFotos: fotosBascula.length
                    },
                    entrega: {
                        timestamp: pkg.tiempo_entrega,
                        pesoTotal: pkg.peso_entrega,
                        fotos: fotosEntrega,
                        cantidadFotos: fotosEntrega.length,
                        receptor: {
                            nombre: pkg.nombre_quien_recibio,
                            cargo: pkg.cargo_quien_recibio,
                            firma: pkg.firma_digital
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo evidencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo evidencias'
        });
    }
});

module.exports = router;