const express = require('express');
const { body, validationResult } = require('express-validator');
const { authorizeRoles } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(require('../middleware/auth').authenticateToken);

// Generar número de tracking único
const generateTrackingNumber = () => {
    const prefix = 'MTY';
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${year}${timestamp}${random}`;
};

// Función auxiliar: Calcular peso promedio de múltiples fotos
const calcularPesoPromedio = (fotos) => {
    if (!fotos || !Array.isArray(fotos) || fotos.length === 0) {
        return null;
    }
    
    const sumaTotal = fotos.reduce((sum, foto) => {
        return sum + (parseFloat(foto.weight) || 0);
    }, 0);
    
    return parseFloat((sumaTotal / fotos.length).toFixed(2));
};

// Función auxiliar: Validar estructura de fotos
const validarFotos = (fotos) => {
    if (!Array.isArray(fotos)) return false;
    
    return fotos.every(foto => {
        return foto.photoData && 
               typeof foto.photoData === 'string' &&
               foto.weight !== undefined &&
               !isNaN(parseFloat(foto.weight)) &&
               parseFloat(foto.weight) >= 0;
    });
};

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
      // Evita cancelados por defecto
      where += ` AND status != 'cancelled'`;
    }

    if (ruta) {
      where += ` AND ruta = $${i++}`;
      params.push(ruta);
    }

    // Rango local [from, to+1 día)
    if (fromDate) {
      where += ` AND fecha_creacion >= $${i++}::date`;
      params.push(fromDate);
    }
    if (toDate) {
      where += ` AND fecha_creacion < ($${i++}::date + INTERVAL '1 day')`;
      params.push(toDate);
    }

    let order = ' ORDER BY fecha_creacion DESC';
    let paging = '';
    if (limit)  { paging += ` LIMIT $${i++}`;  params.push(parseInt(limit)); }
    if (offset) { paging += ` OFFSET $${i++}`; params.push(parseInt(offset)); }

    const sql = `SELECT * FROM packages ${where}${order}${paging}`;
    const rows = (await pool.query(sql, params)).rows;

    // Count consistente
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

// PUT /api/packages/:id - Actualizar paquete (MEJORADO PARA MÚLTIPLES FOTOS)
router.put('/:id', async (req, res) => {
    try {
        await pool.query("SET timezone = 'America/Monterrey'");
        
        const updates = req.body;
        const userRole = req.user.role;
        
        // ===== NUEVO: PROCESAMIENTO DE MÚLTIPLES FOTOS =====
        
        // 1. Procesar fotos de RECOGIDA (pickup)
        if (updates.fotosBascula && Array.isArray(updates.fotosBascula)) {
            // Validar estructura de fotos
            if (!validarFotos(updates.fotosBascula)) {
                return res.status(400).json({
                    success: false,
                    message: 'Formato inválido en fotosBascula. Cada foto debe tener photoData y weight.'
                });
            }
            
            // Calcular peso promedio
            const pesoPromedio = calcularPesoPromedio(updates.fotosBascula);
            
            // Si hay fotos, actualizar el peso de salida con el promedio
            if (pesoPromedio !== null) {
                updates.pesoSalida = pesoPromedio;
            }
            
            // Convertir a JSON para almacenar en PostgreSQL
            updates.fotos_bascula = JSON.stringify(updates.fotosBascula);
            delete updates.fotosBascula;
            
            console.log(`📦 Recogida: ${updates.fotos_bascula ? JSON.parse(updates.fotos_bascula).length : 0} fotos, peso promedio: ${pesoPromedio} kg`);
        }
        
        // 2. Procesar evidencias de peso (estructura adicional)
        if (updates.evidenciasPeso) {
            updates.evidencias_peso = JSON.stringify(updates.evidenciasPeso);
            delete updates.evidenciasPeso;
        }
        
        // 3. Procesar fotos de ENTREGA (delivery)
        if (updates.fotosEntrega && Array.isArray(updates.fotosEntrega)) {
            // Validar estructura de fotos
            if (!validarFotos(updates.fotosEntrega)) {
                return res.status(400).json({
                    success: false,
                    message: 'Formato inválido en fotosEntrega. Cada foto debe tener photoData y weight.'
                });
            }
            
            // Calcular peso promedio
            const pesoPromedio = calcularPesoPromedio(updates.fotosEntrega);
            
            // Si hay fotos, actualizar el peso de entrega con el promedio
            if (pesoPromedio !== null) {
                updates.pesoEntrega = pesoPromedio;
            }
            
            // Convertir a JSON para almacenar
            updates.fotos_entrega = JSON.stringify(updates.fotosEntrega);
            delete updates.fotosEntrega;
            
            console.log(`📦 Entrega: ${updates.fotos_entrega ? JSON.parse(updates.fotos_entrega).length : 0} fotos, peso promedio: ${pesoPromedio} kg`);
        }
        
        // 4. Procesar evidencias de entrega
        if (updates.evidenciasEntrega) {
            updates.evidencias_entrega = JSON.stringify(updates.evidenciasEntrega);
            delete updates.evidenciasEntrega;
        }
        
        // 5. Calcular diferencia de peso si tenemos ambos pesos
        if (updates.pesoEntrega && updates.pesoSalida) {
            const pesoEntrega = parseFloat(updates.pesoEntrega);
            const pesoSalida = parseFloat(updates.pesoSalida);
            updates.diferencia_peso = parseFloat((pesoEntrega - pesoSalida).toFixed(2));
            
            console.log(`⚖️ Diferencia de peso: ${updates.diferencia_peso} kg`);
        }
        
        // ===== FIN PROCESAMIENTO DE MÚLTIPLES FOTOS =====
        
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
            'firmaDigital': 'firma_digital',
            'horaFirma': 'hora_firma'
        };
        
        Object.keys(fieldMapping).forEach(camelKey => {
            if (updates[camelKey] !== undefined) {
                updates[fieldMapping[camelKey]] = updates[camelKey];
                delete updates[camelKey];
            }
        });
        
        // Agregar timestamps automáticamente
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
            const allowedFields = [
                'status', 'tiempo_salida_reparto', 'tiempo_entrega', 
                'peso_salida', 'peso_entrega', 'foto_salida', 'foto_entrega',
                'nombre_quien_recibio', 'cargo_quien_recibio', 'firma_digital', 
                'hora_firma', 'incidencia',
                // NUEVO: Campos para múltiples fotos
                'fotos_bascula', 'fotos_entrega', 'evidencias_peso', 'evidencias_entrega',
                'diferencia_peso'
            ];
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

        // Log de éxito con información relevante
        const pkg = result.rows[0];
        console.log(`✅ Paquete ${pkg.tracking_number} actualizado - Estado: ${pkg.status}`);

        res.json({
            success: true,
            message: 'Paquete actualizado exitosamente',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error actualizando paquete:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

// NUEVO: GET /api/packages/:id/evidencias - Obtener todas las evidencias fotográficas
router.get('/:id/evidencias', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                tracking_number,
                fotos_bascula,
                fotos_entrega,
                evidencias_peso,
                evidencias_entrega,
                peso_salida,
                peso_entrega,
                diferencia_peso,
                tiempo_salida_reparto,
                tiempo_entrega
             FROM packages 
             WHERE id::text = $1 OR tracking_number = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }

        const pkg = result.rows[0];

        // Parsear JSONs
        const fotosBascula = pkg.fotos_bascula ? JSON.parse(pkg.fotos_bascula) : [];
        const fotosEntrega = pkg.fotos_entrega ? JSON.parse(pkg.fotos_entrega) : [];
        const evidenciasPeso = pkg.evidencias_peso ? JSON.parse(pkg.evidencias_peso) : null;
        const evidenciasEntrega = pkg.evidencias_entrega ? JSON.parse(pkg.evidencias_entrega) : null;

        res.json({
            success: true,
            data: {
                trackingNumber: pkg.tracking_number,
                recogida: {
                    fotos: fotosBascula,
                    numeroFotos: fotosBascula.length,
                    pesoPromedio: pkg.peso_salida,
                    timestamp: pkg.tiempo_salida_reparto,
                    evidencias: evidenciasPeso
                },
                entrega: {
                    fotos: fotosEntrega,
                    numeroFotos: fotosEntrega.length,
                    pesoPromedio: pkg.peso_entrega,
                    timestamp: pkg.tiempo_entrega,
                    evidencias: evidenciasEntrega
                },
                analisis: {
                    pesoSalida: pkg.peso_salida,
                    pesoEntrega: pkg.peso_entrega,
                    diferencia: pkg.diferencia_peso,
                    porcentajePerdida: pkg.peso_salida ? 
                        parseFloat(((pkg.diferencia_peso / pkg.peso_salida) * 100).toFixed(2)) : 0
                }
            }
        });

    } catch (error) {
        console.error('Error obteniendo evidencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;
