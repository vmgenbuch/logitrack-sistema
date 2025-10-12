const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const pool = require('../database/connection');

// ============================================
// ENDPOINTS PÚBLICOS (para cualquier usuario autenticado)
// ============================================

// POST - Crear incidente (receptor local, admin, supervisor)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            trackingNumber,
            packageId,
            type,
            severity,
            description,
            photo,
            reportedBy,
            branchId,
            branchName,
            status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO incidents (
                tracking_number, package_id, type, severity, description,
                photo, reported_by, branch_id, branch_name, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *`,
            [
                trackingNumber || 'Sin tracking',
                packageId || null,
                type,
                severity,
                description,
                photo || null,
                reportedBy,
                branchId || null,
                branchName || null,
                status || 'pending'
            ]
        );
        
        res.json({
            success: true,
            message: 'Incidente reportado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creando incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reportar incidente: ' + error.message
        });
    }
});

// ============================================
// ENDPOINTS DEL DASHBOARD (admin y supervisor)
// ============================================
// GET /api/incidents  - Listado con filtros (dashboard)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, status, severity, type, limit, offset } = req.query;

    // Fija TZ de Monterrey
    await pool.query("SET timezone = 'America/Monterrey'");

    let query = `
      SELECT DISTINCT ON (i.id)
        i.id,
        i.tracking_number,
        i.package_id,
        i.type,
        i.severity,
        i.description,
        i.photo,
        i.reported_by,
        i.branch_id,
        i.branch_name,
        i.status,
        i.created_at,
        i.resolved_at,
        i.comments,
        -- Intentar obtener tracking del paquete si existe
        COALESCE(i.tracking_number, p.tracking_number) AS final_tracking,
        -- Intentar obtener sucursal
        COALESCE(i.branch_name, b.nombre, p.sucursal, p.cliente) AS final_branch_name,
        p.cliente
      FROM incidents i
      LEFT JOIN packages p ON i.package_id = p.id
      LEFT JOIN branches b ON i.branch_id::text = b.id::text
      WHERE 1=1
    `;

    const params = [];
    let param = 1;

    // ✅ IMPORTANTE: Si NO hay filtros de fecha, usar últimos 90 días
    if (!startDate && !endDate) {
      query += ` AND i.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else if (startDate && endDate) {
      query += ` AND DATE(i.created_at) BETWEEN $${param} AND $${param+1}`;
      params.push(startDate, endDate); 
      param += 2;
    } else if (startDate) {
      query += ` AND DATE(i.created_at) >= $${param}`;
      params.push(startDate); 
      param += 1;
    } else if (endDate) {
      query += ` AND DATE(i.created_at) <= $${param}`;
      params.push(endDate); 
      param += 1;
    }

    if (status)   { query += ` AND i.status = $${param}`;   params.push(status);   param++; }
    if (severity) { query += ` AND i.severity = $${param}`; params.push(severity); param++; }
    if (type)     { query += ` AND i.type = $${param}`;     params.push(type);     param++; }

    query += ' ORDER BY i.id, i.created_at DESC';

    // Paginación opcional
    if (limit)  { query += ` LIMIT $${param}`;  params.push(parseInt(limit,10));  param++; }
    if (offset) { query += ` OFFSET $${param}`; params.push(parseInt(offset,10)); param++; }

    console.log('Query incidents:', query);
    console.log('Params:', params);

    const result = await pool.query(query, params);
    
    console.log(`Found ${result.rows.length} incidents`);

    const incidents = result.rows.map(row => ({
      id: row.id,
      tracking_number: row.final_tracking || row.tracking_number || 'Sin tracking',
      package_id: row.package_id,
      type: row.type,
      severity: row.severity,
      description: row.description,
      photo: row.photo,
      reported_by: row.reported_by,
      branch_id: row.branch_id,
      branch_name: row.final_branch_name || 'Sin sucursal',
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      comments: row.comments,
      cliente: row.cliente
    }));

    // Métricas
    const metrics = {
      total: incidents.length,
      pending: incidents.filter(i => i.status === 'pending').length,
      inProgress: incidents.filter(i => i.status === 'in_progress').length,
      resolved: incidents.filter(i => i.status === 'resolved').length
    };

    return res.json({
      success: true,
      data: { incidents, metrics }
    });

  } catch (error) {
    console.error('Error obteniendo incidentes:', error);
    console.error('Stack:', error.stack);
    
    // ✅ Devolver error real para debugging
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo incidentes: ' + error.message,
      data: { incidents: [], metrics: { total: 0, pending: 0, inProgress: 0, resolved: 0 } }
    });
  }
});


// GET - Obtener incidentes con filtros avanzados (para dashboard)
/*router.get('/', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, status, severity, type } = req.query;
        const userRole = req.user.role;
        
        // Si es admin o supervisor, usar query avanzada con filtros
        if (userRole === 'admin' || userRole === 'supervisor') {
            let query = `
                SELECT 
                    i.*,
                    p.tracking_number as package_tracking,
                    p.cliente,
                    b.nombre as branch_name
                FROM incidents i
                LEFT JOIN packages p ON i.package_id = p.id
                LEFT JOIN branches b ON i.branch_id::text = b.id::text
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 1;
            
            if (startDate && endDate) {
                query += ` AND DATE(i.created_at) BETWEEN $${paramCount} AND $${paramCount + 1}`;
                params.push(startDate, endDate);
                paramCount += 2;
            }
            
            if (status) {
                query += ` AND i.status = $${paramCount}`;
                params.push(status);
                paramCount++;
            }
            
            if (severity) {
                query += ` AND i.severity = $${paramCount}`;
                params.push(severity);
                paramCount++;
            }
            
            if (type) {
                query += ` AND i.type = $${paramCount}`;
                params.push(type);
                paramCount++;
            }
            
            query += ' ORDER BY i.created_at DESC';
            
            const result = await pool.query(query, params);
            
            // Calcular métricas
            const metrics = {
                total: result.rows.length,
                pending: result.rows.filter(i => i.status === 'pending').length,
                inProgress: result.rows.filter(i => i.status === 'in_progress').length,
                resolved: result.rows.filter(i => i.status === 'resolved').length
            };
            
            return res.json({
                success: true,
                data: {
                    incidents: result.rows.map(row => ({
                        ...row,
                        tracking_number: row.tracking_number || row.package_tracking
                    })),
                    metrics
                }
            });
        }
        
        // Para otros roles, query simple (comportamiento original)
        const result = await pool.query(
            'SELECT * FROM incidents ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Error obteniendo incidentes:', error);
        res.json({
            success: true,
            data: { incidents: [], metrics: { total: 0, pending: 0, inProgress: 0, resolved: 0 } }
        });
    }
});*/

// GET - Obtener incidente por ID con información completa
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                i.*,
                p.tracking_number as package_tracking,
                p.cliente,
                p.direccion,
                b.nombre as branch_name
            FROM incidents i
            LEFT JOIN packages p ON i.package_id = p.id
            LEFT JOIN branches b ON i.branch_id::text = b.id::text
            WHERE i.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        const incident = result.rows[0];
        
        // Combinar tracking numbers si es necesario
        if (!incident.tracking_number && incident.package_tracking) {
            incident.tracking_number = incident.package_tracking;
        }
        
        res.json({
            success: true,
            data: incident
        });
        
    } catch (error) {
        console.error('Error obteniendo incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo incidente'
        });
    }
});

// PUT - Actualizar estado de incidente (mantener compatibilidad)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { status, resolution } = req.body;
        
        const result = await pool.query(
            `UPDATE incidents 
             SET status = $1, 
                 resolution = $2, 
                 resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
             WHERE id = $3
             RETURNING *`,
            [status, resolution || null, req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Incidente actualizado exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error actualizando incidente:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando incidente'
        });
    }
});

// ============================================
// NUEVOS ENDPOINTS PARA EL DASHBOARD
// ============================================

// POST - Agregar comentario (solo admin y supervisor)
router.post('/:id/comments', authenticateToken, authorizeRoles('admin', 'supervisor'), async (req, res) => {
    try {
        const { id } = req.params;
        const { comment, author } = req.body;
        
        // Obtener incidente actual
        const incident = await pool.query('SELECT comments FROM incidents WHERE id = $1', [id]);
        
        if (incident.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        const currentComments = incident.rows[0].comments || [];
        const newComment = {
            text: comment,
            author,
            created_at: new Date().toISOString()
        };
        
        currentComments.push(newComment);
        
        await pool.query(
            'UPDATE incidents SET comments = $1 WHERE id = $2',
            [JSON.stringify(currentComments), id]
        );
        
        res.json({
            success: true,
            message: 'Comentario agregado exitosamente',
            data: newComment
        });
        
    } catch (error) {
        console.error('Error agregando comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error agregando comentario'
        });
    }
});

// PUT - Actualizar solo el estado (para el dashboard)
router.put('/:id/status', authenticateToken, authorizeRoles('admin', 'supervisor'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'in_progress', 'resolved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Estado inválido. Debe ser: pending, in_progress o resolved'
            });
        }
        
        const updateData = { status };
        if (status === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }
        
        const result = await pool.query(
            'UPDATE incidents SET status = $1, resolved_at = $2 WHERE id = $3 RETURNING *',
            [status, updateData.resolved_at || null, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Incidente no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Estado actualizado exitosamente',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error actualizando estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error actualizando estado'
        });
    }
});

module.exports = router;