const express = require('express');
const { authorizeRoles, authenticateToken } = require('../middleware/auth');
const moment = require('moment');
const pool = require('../database/connection');

const router = express.Router();

// Aplicar autenticación y autorización
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'logistics'));

// GET /api/reports/dashboard - Dashboard principal de reportes
// GET /api/reports/dashboard - Robusto: sin columnas opcionales
router.get('/dashboard', async (req, res) => {
  try {
    await pool.query("SET TIME ZONE 'America/Monterrey'");

    // Filtros (YYYY-MM-DD). Si no vienen, usa hoy.
    const { startDate, endDate } = req.query;
    const { rows: [{ today }] } = await pool.query("SELECT CURRENT_DATE::text AS today");
    const start = startDate || today;
    const end   = endDate   || today;

    const params = [start, end];

    // 1) RESUMEN con agregados en SQL (sin usar columnas que quizá no existen)
    const { rows: [sum] } = await pool.query(
      `
      WITH rango AS (
        SELECT $1::date AS ini, ($2::date + INTERVAL '1 day') AS fin
      ),
      base AS (
        SELECT p.*
        FROM packages p, rango r
        WHERE p.status != 'cancelled'
          AND p.fecha_creacion >= r.ini
          AND p.fecha_creacion <  r.fin
      )
      SELECT
        COUNT(*)::int                                           AS total_packages,
        COUNT(*) FILTER (WHERE status = 'delivered')::int       AS delivered_packages,
        CASE WHEN COUNT(*) > 0
             THEN ROUND( (COUNT(*) FILTER (WHERE status='delivered')) * 100.0 / COUNT(*), 1)
             ELSE 0 END                                         AS delivery_rate,
        -- tiempo promedio (min) entre salida y entrega, SOLO entregados con ambas fechas
        COALESCE( ROUND( AVG(
          EXTRACT(EPOCH FROM (tiempo_entrega - tiempo_salida_reparto))
        ) FILTER (WHERE status='delivered' AND tiempo_entrega IS NOT NULL AND tiempo_salida_reparto IS NOT NULL) / 60.0 , 1), 0) AS avg_delivery_time
      FROM base;
      `,
      params
    );

    // 2) TENDENCIA diaria entre start..end (una sola consulta)
    const { rows: trend } = await pool.query(
      `
      WITH days AS (
        SELECT d::date AS dia
        FROM generate_series($1::date, $2::date, interval '1 day') AS g(d)
      ),
      conteo AS (
        SELECT
          DATE(p.fecha_creacion) AS f,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE p.status='delivered')::int AS delivered
        FROM packages p
        WHERE p.fecha_creacion >= $1::date
          AND p.fecha_creacion <  ($2::date + INTERVAL '1 day')
        GROUP BY 1
      )
      SELECT
        to_char(d.dia, 'YYYY-MM-DD') AS date,
        COALESCE(c.total, 0)    AS packages,
        COALESCE(c.delivered,0) AS delivered,
        CASE WHEN COALESCE(c.total,0) > 0
             THEN ROUND(c.delivered * 100.0 / c.total, 1)
             ELSE 0 END          AS deliveryRate
      FROM days d
      LEFT JOIN conteo c ON c.f = d.dia
      ORDER BY d.dia;
      `,
      params
    );

    // 3) DISTRIBUCIÓN por estado
    const { rows: statusRows } = await pool.query(
      `
      SELECT status, COUNT(*)::int AS c
      FROM packages
      WHERE fecha_creacion >= $1::date
        AND fecha_creacion <  ($2::date + INTERVAL '1 day')
        AND status != 'cancelled'
      GROUP BY status
      `,
      params
    );
    const statusDistribution = { pending:0, assigned:0, in_transit:0, delivered:0, cancelled:0 };
    statusRows.forEach(r => { statusDistribution[r.status] = r.c; });

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        summary: {
          totalPackages: sum.total_packages,
          deliveredPackages: sum.delivered_packages,
          deliveryRate: Number(sum.delivery_rate) || 0,
          avgDeliveryTime: Number(sum.avg_delivery_time) || 0,
          // avgEffectiveness lo omitimos por ahora para evitar columnas inexistentes
        },
        trends: { daily: trend },
        distributions: { status: statusDistribution }
      }
    });

  } catch (error) {
    console.error('Error en /api/reports/dashboard:', error);
    res.status(500).json({ success:false, message:'Error generando dashboard de reportes' });
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

// GET /api/reports/route-performance - Rendimiento por ruta
router.get('/route-performance', async (req, res) => {
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
});

// GET /api/reports/incidents - Análisis de incidencias
router.get('/incidents', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate ? moment(startDate).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
        const end = endDate ? moment(endDate).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');

        // Incidentes de paquetes
        const packageIncidentsResult = await pool.query(
            `SELECT * FROM packages 
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
                    byType: incidentTypes
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