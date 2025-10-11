const express = require('express');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const moment = require('moment');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autenticación y autorización
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'logistics'));

// GET /api/reports/dashboard - Robusto: sin columnas opcionales
router.get('/dashboard', async (req, res) => {
  try {
    // Asegura zona horaria local
    await pool.query("SET TIME ZONE 'America/Monterrey'");

    // Determinar rango (si no hay query params, usa hoy local)
    const { rows: [{ today }] } = await pool.query("SELECT CURRENT_DATE::text AS today");
    const start = req.query.startDate || today;
    const end   = req.query.endDate   || today;
    const params = [start, end];

    // === CONSULTA PRINCIPAL ===
    // Paquetes entregados o activos dentro del rango local (día de tiempo_entrega)
    const { rows: pkgs } = await pool.query(`
      SELECT *
      FROM packages
      WHERE status != 'cancelled'
        AND tiempo_entrega IS NOT NULL
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') >= $1::date
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
    `, params);

    // === MÉTRICAS ===
    const totalPackages = pkgs.length;
    const deliveredPackages = pkgs.filter(p => (p.status || '').toLowerCase() === 'delivered').length;
    const deliveryRate = totalPackages ? +(deliveredPackages * 100 / totalPackages).toFixed(1) : 0;

    // Tiempo promedio de entrega (minutos)
    const deliveredWithTimes = pkgs.filter(
      p => p.tiempo_salida_reparto && p.tiempo_entrega && (p.status || '').toLowerCase() === 'delivered'
    );
    const avgDeliveryTime = deliveredWithTimes.length
      ? +(
          deliveredWithTimes.reduce((sum, p) => {
            const salida = new Date(p.tiempo_salida_reparto);
            const entrega = new Date(p.tiempo_entrega);
            return sum + (entrega - salida) / 60000;
          }, 0) / deliveredWithTimes.length
        ).toFixed(1)
      : 0;

    // Efectividad promedio
    const withEff = pkgs.filter(p => p.efectividad != null);
    const avgEffectiveness = withEff.length
      ? +(withEff.reduce((s,p)=>s + Number(p.efectividad||0), 0) / withEff.length).toFixed(1)
      : 0;

    // === TENDENCIA DIARIA ===
    const { rows: trend } = await pool.query(`
      WITH days AS (
        SELECT d::date AS dia
        FROM generate_series($1::date, $2::date, interval '1 day') g(d)
      ),
      cnt AS (
        SELECT
          DATE(tiempo_entrega AT TIME ZONE 'America/Monterrey') AS f,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='delivered')::int AS delivered
        FROM packages
        WHERE tiempo_entrega IS NOT NULL
          AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') >= $1::date
          AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
        GROUP BY 1
      )
      SELECT
        to_char(d.dia, 'YYYY-MM-DD') AS date,
        COALESCE(c.total,0) AS packages,
        COALESCE(c.delivered,0) AS delivered,
        CASE WHEN COALESCE(c.total,0)>0 THEN ROUND(c.delivered*100.0/c.total,1) ELSE 0 END AS deliveryRate
      FROM days d LEFT JOIN cnt c ON c.f=d.dia
      ORDER BY d.dia;
    `, params);

    // === DISTRIBUCIÓN POR ESTADO ===
    const { rows: statusRows } = await pool.query(`
      SELECT LOWER(status) AS status, COUNT(*)::int AS c
      FROM packages
      WHERE status != 'cancelled'
        AND tiempo_entrega IS NOT NULL
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') >= $1::date
        AND (tiempo_entrega AT TIME ZONE 'America/Monterrey') <  ($2::date + INTERVAL '1 day')
      GROUP BY 1
    `, params);

    const status = { pending:0, assigned:0, in_transit:0, delivered:0, cancelled:0 };
    statusRows.forEach(r => { status[r.status] = r.c; });

    // === RESPUESTA FINAL ===
    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        summary: {
          totalPackages,
          deliveredPackages,
          deliveryRate,
          avgDeliveryTime,
          avgEffectiveness
        },
        trends: { daily: trend },
        distributions: { status }
      }
    });
  } catch (error) {
    console.error('Error generando dashboard de reportes:', error);
    res.status(500).json({ success: false, message: 'Error generando dashboard de reportes' });
  }
});



/*router.get('/dashboard', async (req, res) => {
    try {
        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");
        
        // Obtener fecha actual de PostgreSQL en zona Monterrey
        const dateResult = await pool.query("SELECT CURRENT_DATE::text as today");
        const today = dateResult.rows[0].today;
        
        console.log('=== DEBUG DASHBOARD ===');
        console.log('Fecha servidor:', today);
        
        // Paquetes del día
        const packagesResult = await pool.query(
            `SELECT * FROM packages 
            WHERE DATE(fecha_creacion) = $1
            AND status != 'cancelled'`,  
            [today]
        );
        
        const filteredPackages = packagesResult.rows;
        console.log('Packages del día:', filteredPackages.length);
        console.log('=======================');

        // Métricas generales
        const totalPackages = filteredPackages.length;
        const deliveredPackages = filteredPackages.filter(p => p.status === 'delivered');
        const deliveryRate = totalPackages > 0 ? (deliveredPackages.length / totalPackages * 100).toFixed(1) : 0;
        
        // Tiempo promedio de entrega
        const packagesWithTime = deliveredPackages.filter(p => p.diferencia_minutos);
        const avgDeliveryTime = packagesWithTime.length > 0 
            ? (packagesWithTime.reduce((sum, p) => sum + p.diferencia_minutos, 0) / packagesWithTime.length).toFixed(1)
            : 0;

        // Efectividad promedio
        const packagesWithEffectiveness = deliveredPackages.filter(p => p.efectividad !== null);
        const avgEffectiveness = packagesWithEffectiveness.length > 0
            ? (packagesWithEffectiveness.reduce((sum, p) => sum + p.efectividad, 0) / packagesWithEffectiveness.length).toFixed(1)
            : 0;

        // Tendencias diarias (últimos 7 días)
        const dailyStats = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            
            const dayResult = await pool.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered
                 FROM packages 
                 WHERE DATE(fecha_creacion) = $1`,
                [dateStr]
            );
            
            const dayData = dayResult.rows[0];
            const total = parseInt(dayData.total);
            const delivered = parseInt(dayData.delivered);
            
            dailyStats.push({
                date: dateStr,
                day: dayNames[d.getDay()],
                packages: total,
                delivered: delivered,
                deliveryRate: total > 0 ? (delivered / total * 100).toFixed(1) : 0
            });
        }

        // Distribución por estado
        const statusResult = await pool.query(
            `SELECT status, COUNT(*) FROM packages 
             WHERE DATE(fecha_creacion) = $1
             AND status != 'cancelled' 
             GROUP BY status`,
            [today]
        );
        
        const statusDistribution = {
            pending: 0, assigned: 0, in_transit: 0, delivered: 0, cancelled: 0
        };
        statusResult.rows.forEach(row => {
            statusDistribution[row.status] = parseInt(row.count);
        });

        const dashboardData = {
            period: {
                startDate: today,
                endDate: today
            },
            summary: {
                totalPackages,
                deliveredPackages: deliveredPackages.length,
                deliveryRate: parseFloat(deliveryRate),
                avgDeliveryTime: parseFloat(avgDeliveryTime),
                avgEffectiveness: parseFloat(avgEffectiveness)
            },
            trends: {
                daily: dailyStats
            },
            distributions: {
                status: statusDistribution
            }
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Error generando dashboard de reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando dashboard de reportes'
        });
    }
});*/

// GET /api/reports/detailed-tracking - Reporte detallado de seguimiento
router.get('/detailed-tracking', async (req, res) => {
  try {
    await pool.query("SET TIME ZONE 'America/Monterrey'");
    const { fechaInicio, fechaFin, ruta, estado } = req.query;

    const params = [];
    let i = 1;
    let query = `
      SELECT p.*,
             r.nombre AS route_name,
             -- horas locales (texto HH:MI AM/PM) sin restas manuales
             CASE WHEN p.tiempo_salida_reparto IS NOT NULL
                  THEN to_char(p.tiempo_salida_reparto AT TIME ZONE 'America/Monterrey', 'HH12:MI a.m.')
                  ELSE '-' END AS salida_local,
             CASE WHEN p.tiempo_entrega IS NOT NULL
                  THEN to_char(p.tiempo_entrega AT TIME ZONE 'America/Monterrey', 'HH12:MI a.m.')
                  ELSE '-' END AS entrega_local
      FROM packages p
      LEFT JOIN routes r ON p.ruta = r.id
      WHERE p.status != 'cancelled'
    `;

    if (fechaInicio && fechaFin) {
      query += ` AND p.fecha_creacion >= $${i}::date AND p.fecha_creacion < ($${i+1}::date + INTERVAL '1 day')`;
      params.push(fechaInicio, fechaFin);
      i += 2;
    }
    if (ruta)   { query += ` AND p.ruta = $${i++}`;   params.push(ruta); }
    if (estado) { query += ` AND p.status = $${i++}`; params.push(estado); }

    const { rows } = await pool.query(query, params);

    const detailedReport = rows.map(pkg => {
      const pesoInicial = pkg.peso_salida || pkg.peso_estimado || 0;
      const pesoFinal   = pkg.peso_entrega || 0;
      const diferenciaPeso = pesoFinal > 0 ? pesoFinal - pesoInicial : 0;

      let totalMinutos = 0;
      if (pkg.tiempo_salida_reparto && pkg.tiempo_entrega) {
        totalMinutos = Math.round((new Date(pkg.tiempo_entrega) - new Date(pkg.tiempo_salida_reparto)) / 60000);
      }

      return {
        id: pkg.id,
        trackingNumber: pkg.tracking_number,
        cliente: pkg.cliente,
        ruta: pkg.route_name || 'N/A',
        tiempoSalidaReparto: pkg.salida_local || '-',
        tiempoEntrega: pkg.entrega_local || '-',
        totalTiempo: totalMinutos > 0 ? `${totalMinutos} min` : '0 min',
        diferenciaMinutos: totalMinutos,
        pesoSalida: pesoInicial,
        pesoEntrega: pesoFinal,
        diferenciaPeso,
        efectividad: pkg.efectividad || 0
      };
    });

    res.json({
      success: true,
      data: { filters: { fechaInicio, fechaFin, ruta, estado }, records: detailedReport }
    });

  } catch (error) {
    console.error('Error generando reporte detallado:', error);
    res.status(500).json({ success:false, message:'Error generando reporte detallado' });
  }
});


/*router.get('/detailed-tracking', async (req, res) => {
    try {
        // CRÍTICO: Configurar zona horaria de Monterrey
        await pool.query("SET timezone = 'America/Monterrey'");
        
        const { fechaInicio, fechaFin, ruta, estado } = req.query;
        
        let query = `SELECT p.*, r.nombre as route_name FROM packages p 
                     LEFT JOIN routes r ON p.ruta = r.id 
                     WHERE p.status != 'cancelled'`;
        const params = [];
        let paramCount = 1;

        // Filtrar por fechas - SIMPLIFICADO
        if (fechaInicio && fechaFin) {
            query += ` AND DATE(p.fecha_creacion) BETWEEN $${paramCount} AND $${paramCount + 1}`;
            params.push(fechaInicio, fechaFin);
            paramCount += 2;
        }

        // Filtrar por ruta
        if (ruta) {
            query += ` AND p.ruta = $${paramCount}`;
            params.push(ruta);
            paramCount++;
        }

        // Filtrar por estado
        if (estado) {
            query += ` AND p.status = $${paramCount}`;
            params.push(estado);
        }

        const result = await pool.query(query, params);

        const detailedReport = result.rows.map(pkg => {
    const pesoInicial = pkg.peso_salida || pkg.peso_estimado || 0;
    const pesoFinal = pkg.peso_entrega || 0;
    const diferenciaPeso = pesoFinal > 0 ? pesoFinal - pesoInicial : 0;
    
    // Calcular tiempo total
    let totalMinutos = 0;
    if (pkg.tiempo_salida_reparto && pkg.tiempo_entrega) {
        const salida = new Date(pkg.tiempo_salida_reparto);
        const entrega = new Date(pkg.tiempo_entrega);
        totalMinutos = Math.round((entrega - salida) / 60000);
    }
    
    // Formatear timestamps - Restar 6 horas manualmente
    let tiempoSalidaFormateado = '-';
    if (pkg.tiempo_salida_reparto) {
        const utcDate = new Date(pkg.tiempo_salida_reparto);
        const monterreyDate = new Date(utcDate.getTime() - (6 * 60 * 60 * 1000)); // UTC-6
        tiempoSalidaFormateado = monterreyDate.toLocaleTimeString('es-MX', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    let tiempoEntregaFormateado = '-';
    if (pkg.tiempo_entrega) {
        const utcDate = new Date(pkg.tiempo_entrega);
        const monterreyDate = new Date(utcDate.getTime() - (6 * 60 * 60 * 1000)); // UTC-6
        tiempoEntregaFormateado = monterreyDate.toLocaleTimeString('es-MX', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    return {
        id: pkg.id,
        trackingNumber: pkg.tracking_number,
        cliente: pkg.cliente,
        ruta: pkg.route_name || 'N/A',
        tiempoSalidaReparto: tiempoSalidaFormateado,
        tiempoEntrega: tiempoEntregaFormateado,
        totalTiempo: totalMinutos > 0 ? `${totalMinutos} min` : '0 min',
        diferenciaMinutos: totalMinutos,
        pesoSalida: pesoInicial,
        pesoEntrega: pesoFinal,
        diferenciaPeso: diferenciaPeso,
        efectividad: pkg.efectividad || 0
    };
});

        res.json({
            success: true,
            data: {
                filters: { fechaInicio, fechaFin, ruta, estado },
                records: detailedReport
            }
        });

    } catch (error) {
        console.error('Error generando reporte detallado:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando reporte detallado'
        });
    }
});*/

// routes/reportes.js  (o donde declares /api/reports/route-performance)
router.get('/route-performance', async (req, res) => {
  try {
    // Asegura TZ local
    await pool.query("SET TIME ZONE 'America/Monterrey'");

    const { startDate, endDate } = req.query;
    // Defaults a HOY si no llegan filtros
    const { rows: [{ today }] } = await pool.query(`SELECT CURRENT_DATE::text AS today`);
    const start = startDate || today;
    const end   = endDate   || today;

    // Una sola consulta, con LEFT JOIN y agrupando "Sin ruta"
    const { rows } = await pool.query(
      `
      WITH base AS (
        SELECT
          COALESCE(r.id::text, '__null__')                 AS route_id,
          COALESCE(r.nombre, 'Sin ruta')                   AS route_name,
          p.status,
          p.diferencia_minutos,
          p.efectividad,
          p.peso_salida
        FROM packages p
        LEFT JOIN routes r ON r.id = p.ruta
        WHERE p.fecha_creacion >= $1::date
          AND p.fecha_creacion <  ($2::date + INTERVAL '1 day')
          AND p.status <> 'cancelled'
      )
      SELECT
        route_id,
        route_name,
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')       AS delivered,
        ROUND(AVG(diferencia_minutos)::numeric, 1)         AS avg_delivery_time,
        ROUND(AVG(efectividad)::numeric, 1)                AS avg_effectiveness,
        ROUND(AVG(peso_salida)::numeric, 1)                AS avg_weight
      FROM base
      GROUP BY route_id, route_name
      ORDER BY delivered DESC, total DESC
      LIMIT 5;
      `,
      [start, end]
    );

    const mapped = rows.map(r => ({
      routeId: r.route_id === '__null__' ? null : r.route_id,
      routeName: r.route_name,
      metrics: {
        totalPackages:       Number(r.total),
        deliveredPackages:   Number(r.delivered),
        deliveryRate:        r.total ? Number((r.delivered * 100 / r.total).toFixed(1)) : 0,
        avgDeliveryTime:     Number(r.avg_delivery_time ?? 0),
        avgEffectiveness:    Number(r.avg_effectiveness ?? 0),
        avgWeight:           Number(r.avg_weight ?? 0),
      }
    }));

    res.json({ success: true, data: { routes: mapped } });
  } catch (error) {
    console.error('Error generando reporte de rendimiento:', error);
    res.status(500).json({ success: false, message: 'Error generando reporte de rendimiento' });
  }
});

// GET /api/reports/route-performance - Rendimiento por ruta
/*router.get('/route-performance', async (req, res) => {
    try {
        const routesResult = await pool.query('SELECT * FROM routes');
        
        const routePerformance = await Promise.all(routesResult.rows.map(async (route) => {
            const metricsResult = await pool.query(
                `SELECT 
                    COUNT(*) as total_packages,
                    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_packages,
                    AVG(CASE WHEN diferencia_minutos IS NOT NULL THEN diferencia_minutos END) as avg_delivery_time,
                    AVG(CASE WHEN efectividad IS NOT NULL THEN efectividad END) as avg_effectiveness,
                    AVG(peso_salida) as avg_weight
                 FROM packages WHERE ruta = $1`,
                [route.id]
            );
            
            const metrics = metricsResult.rows[0];
            const total = parseInt(metrics.total_packages);
            const delivered = parseInt(metrics.delivered_packages);
            
            return {
                routeId: route.id,
                routeName: route.nombre,
                metrics: {
                    totalPackages: total,
                    deliveredPackages: delivered,
                    deliveryRate: total > 0 ? parseFloat((delivered / total * 100).toFixed(1)) : 0,
                    avgDeliveryTime: parseFloat(parseFloat(metrics.avg_delivery_time || 0).toFixed(1)),
                    avgEffectiveness: parseFloat(parseFloat(metrics.avg_effectiveness || 0).toFixed(1)),
                    avgWeight: parseFloat(parseFloat(metrics.avg_weight || 0).toFixed(1))
                }
            };
        }));

        res.json({
            success: true,
            data: {
                routes: routePerformance
            }
        });

    } catch (error) {
        console.error('Error generando reporte de rendimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando reporte de rendimiento'
        });
    }
});*/

// GET /api/reports/incidents - Análisis de incidencias
router.get('/incidents', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate ? moment(startDate).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
        const end = endDate ? moment(endDate).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');

        // Incidentes de paquetes
        const packageIncidentsResult = await pool.query(
            `SELECT p.*, b.nombre as branch_name 
             FROM packages p
             LEFT JOIN branches b ON p.sucursal_destino = b.id
             WHERE validacion_receptor->>'statusValidacion' = 'incidencia'
             AND DATE(fecha_creacion) BETWEEN $1 AND $2`,
            [start, end]
        );

        // Incidentes independientes
        const standaloneIncidentsResult = await pool.query(
            `SELECT * FROM incidents WHERE DATE(created_at) BETWEEN $1 AND $2`,
            [start, end]
        );

        const packageIncidents = packageIncidentsResult.rows;
        const standaloneIncidents = standaloneIncidentsResult.rows;
        const totalIncidents = packageIncidents.length + standaloneIncidents.length;

        // Distribución por tipo
        const incidentTypes = {};
        packageIncidents.forEach(pkg => {
            const type = pkg.validacion_receptor?.tipoIncidencia || 'otro';
            incidentTypes[type] = (incidentTypes[type] || 0) + 1;
        });
        standaloneIncidents.forEach(inc => {
            const type = inc.type || 'otro';
            incidentTypes[type] = (incidentTypes[type] || 0) + 1;
        });

        // ✅ NUEVO: Distribución por sucursal
        const incidentsByBranch = {};
        packageIncidents.forEach(pkg => {
            const branch = pkg.branch_name || 'Sin Sucursal';
            incidentsByBranch[branch] = (incidentsByBranch[branch] || 0) + 1;
        });
        standaloneIncidents.forEach(inc => {
            const branch = inc.branch_name || 'Sin Sucursal';
            incidentsByBranch[branch] = (incidentsByBranch[branch] || 0) + 1;
        });

        // Tendencia semanal
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
            
            const dayIncidents = await pool.query(
                `SELECT COUNT(*) FROM incidents WHERE DATE(created_at) = $1`,
                [date]
            );
            
            weeklyTrend.push({
                date,
                day: moment(date).format('ddd'),
                incidents: parseInt(dayIncidents.rows[0].count)
            });
        }

        // Tasa de incidencia
        const totalPackagesResult = await pool.query(
            `SELECT COUNT(*) FROM packages WHERE DATE(fecha_creacion) BETWEEN $1 AND $2`,
            [start, end]
        );
        const totalPackages = parseInt(totalPackagesResult.rows[0].count);
        const incidentRate = totalPackages > 0 
            ? (packageIncidents.length / totalPackages * 100).toFixed(1) 
            : 0;

        res.json({
            success: true,
            data: {
                period: { startDate: start, endDate: end },
                summary: {
                    totalPackages,
                    totalIncidents,
                    packageIncidents: packageIncidents.length,
                    standaloneIncidents: standaloneIncidents.length,
                    incidentRate: parseFloat(incidentRate)
                },
                distributions: {
                    byType: incidentTypes,
                    byBranch: incidentsByBranch  // ✅ AGREGAR ESTO
                },
                trends: {
                    weekly: weeklyTrend
                }
            }
        });

    } catch (error) {
        console.error('Error generando reporte de incidencias:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando reporte de incidencias'
        });
    }
});

// GET /api/reports/filters - Obtener filtros disponibles
router.get('/filters', async (req, res) => {
    try {
        const routesResult = await pool.query('SELECT id, nombre FROM routes ORDER BY nombre');
        
        const estados = [
            { id: 'pending', nombre: 'Pendiente' },
            { id: 'in_transit', nombre: 'En Tránsito' },
            { id: 'delivered', nombre: 'Entregado' },
            { id: 'cancelled', nombre: 'Cancelado' }
        ];
        
        res.json({
            success: true,
            estados,
            routes: routesResult.rows.map(r => r.id)
        });
        
    } catch (error) {
        console.error('Error obteniendo filtros:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

module.exports = router;