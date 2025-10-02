const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Funciones para leer datos desde tu estructura actual
function readFile(filename) {
    try {
        const filePath = path.join(__dirname, '../data', filename);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return [];
    }
}

// GET /dashboard - Dashboard principal con métricas
router.get('/dashboard', (req, res) => {
    try {
        // Leer datos desde tus archivos JSON existentes
        const packages = readFile('packages.json');
        const users = readFile('users.json');
        const routes = readFile('routes.json');
        
        const ahora = new Date();
        const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Métricas generales
        const totalPaquetes = packages.length;
        const paquetesEntregados = packages.filter(p => p.status === 'delivered').length;
        const paquetesPendientes = packages.filter(p => 
            ['pending', 'assigned', 'in_transit'].includes(p.status)
        ).length;
        const tasaExito = totalPaquetes > 0 ? (paquetesEntregados / totalPaquetes * 100) : 0;
        
        // Métricas de última semana
        const paquetesRecientes = packages.filter(p => new Date(p.fechaCreacion) >= hace7dias);
        const entregasRecientes = paquetesRecientes.filter(p => p.status === 'delivered');
        
        // Tiempo promedio de entrega (usando diferenciaMinutos)
        const paquetesConTiempo = packages.filter(p => p.diferenciaMinutos && p.status === 'delivered');
        const tiempoPromedioEntrega = paquetesConTiempo.length > 0 
            ? paquetesConTiempo.reduce((sum, p) => sum + p.diferenciaMinutos, 0) / paquetesConTiempo.length
            : 0;
        
        // Distribución por estado
        const estadosDistribucion = {
            pending: packages.filter(p => p.status === 'pending').length,
            assigned: packages.filter(p => p.status === 'assigned').length,
            in_transit: packages.filter(p => p.status === 'in_transit').length,
            delivered: paquetesEntregados,
            cancelled: packages.filter(p => p.status === 'cancelled').length
        };
        
        // Tendencia de entregas últimos 7 días
        const tendenciaEntregas = [];
        for (let i = 6; i >= 0; i--) {
            const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
            const fechaStr = fecha.toISOString().split('T')[0];
            const entregasDia = packages.filter(p => 
                p.status === 'delivered' && 
                p.tiempoEntrega && 
                p.tiempoEntrega.startsWith(fechaStr)
            ).length;
            
            tendenciaEntregas.push({
                fecha: fechaStr,
                entregas: entregasDia
            });
        }
        
        // Efectividad promedio
        const paquetesConEfectividad = packages.filter(p => 
            p.efectividad !== null && p.efectividad !== undefined
        );
        const efectividadPromedio = paquetesConEfectividad.length > 0
            ? paquetesConEfectividad.reduce((sum, p) => sum + p.efectividad, 0) / paquetesConEfectividad.length
            : 0;
        
        // Incidencias
        const paquetesConIncidencias = packages.filter(p => p.incidencia !== 'ninguna');
        const tasaIncidencias = totalPaquetes > 0 ? (paquetesConIncidencias.length / totalPaquetes * 100) : 0;
        
        res.json({
            success: true,
            metricas: {
                totalPaquetes,
                paquetesEntregados,
                paquetesPendientes,
                tasaExito: Math.round(tasaExito * 100) / 100,
                tiempoPromedioEntrega: Math.round(tiempoPromedioEntrega * 100) / 100, // en minutos
                efectividadPromedio: Math.round(efectividadPromedio * 100) / 100,
                totalIncidencias: paquetesConIncidencias.length,
                tasaIncidencias: Math.round(tasaIncidencias * 100) / 100,
                totalRutas: routes.length,
                totalUsuarios: users.length
            },
            estadosDistribucion,
            tendenciaEntregas,
            paquetesRecientes: paquetesRecientes.length,
            entregasRecientes: entregasRecientes.length
        });
        
    } catch (error) {
        console.error('Error generando dashboard:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// GET /detailed - Reporte detallado con filtros
router.get('/detailed', (req, res) => {
    try {
        const { startDate, endDate, status, ruta, prioridad } = req.query;
        let packages = readFile('packages.json');
        const users = readFile('users.json');
        const routes = readFile('routes.json');
        
        // Aplicar filtros
        if (startDate) {
            packages = packages.filter(p => new Date(p.fechaCreacion) >= new Date(startDate));
        }
        
        if (endDate) {
            packages = packages.filter(p => new Date(p.fechaCreacion) <= new Date(endDate));
        }
        
        if (status && status !== 'todos') {
            packages = packages.filter(p => p.status === status);
        }
        
        if (ruta && ruta !== 'todas') {
            packages = packages.filter(p => p.ruta === ruta);
        }
        
        if (prioridad && prioridad !== 'todas') {
            packages = packages.filter(p => p.prioridad === prioridad);
        }
        
        // Enriquecer datos con nombres
        const paquetesDetallados = packages.map(paquete => {
            const rutaInfo = routes.find(r => r.id === paquete.ruta);
            const creadoPorInfo = users.find(u => u.id === paquete.creadoPor);
            
            return {
                ...paquete,
                rutaNombre: rutaInfo ? rutaInfo.nombre : 'Ruta no encontrada',
                creadoPorNombre: creadoPorInfo ? creadoPorInfo.fullName : 'Usuario no encontrado',
                // Formatear fechas para mejor visualización
                fechaCreacionFormat: new Date(paquete.fechaCreacion).toLocaleString('es-ES'),
                tiempoSalidaRepartoFormat: paquete.tiempoSalidaReparto 
                    ? new Date(paquete.tiempoSalidaReparto).toLocaleString('es-ES') 
                    : null,
                tiempoEntregaFormat: paquete.tiempoEntrega 
                    ? new Date(paquete.tiempoEntrega).toLocaleString('es-ES') 
                    : null
            };
        });
        
        // Estadísticas del período filtrado
        const stats = {
            totalPaquetes: packages.length,
            entregados: packages.filter(p => p.status === 'delivered').length,
            pendientes: packages.filter(p => ['pending', 'assigned', 'in_transit'].includes(p.status)).length,
            cancelados: packages.filter(p => p.status === 'cancelled').length,
            pesoTotal: packages.reduce((sum, p) => sum + (parseFloat(p.pesoSalida) || 0), 0),
            efectividadPromedio: packages.filter(p => p.efectividad).length > 0
                ? packages.filter(p => p.efectividad).reduce((sum, p) => sum + p.efectividad, 0) / packages.filter(p => p.efectividad).length
                : 0,
            tiempoPromedioEntrega: packages.filter(p => p.diferenciaMinutos).length > 0
                ? packages.filter(p => p.diferenciaMinutos).reduce((sum, p) => sum + p.diferenciaMinutos, 0) / packages.filter(p => p.diferenciaMinutos).length
                : 0
        };
        
        res.json({
            success: true,
            paquetes: paquetesDetallados,
            estadisticas: {
                ...stats,
                efectividadPromedio: Math.round(stats.efectividadPromedio * 100) / 100,
                tiempoPromedioEntrega: Math.round(stats.tiempoPromedioEntrega * 100) / 100,
                pesoTotal: Math.round(stats.pesoTotal * 100) / 100
            },
            filtros: { startDate, endDate, status, ruta, prioridad }
        });
        
    } catch (error) {
        console.error('Error generando reporte detallado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// GET /routes - Análisis de rendimiento por rutas
router.get('/routes', (req, res) => {
    try {
        const packages = readFile('packages.json');
        const routes = readFile('routes.json');
        
        const rendimientoRutas = routes.map(ruta => {
            const paquetesRuta = packages.filter(p => p.ruta === ruta.id);
            const paquetesEntregados = paquetesRuta.filter(p => p.status === 'delivered');
            
            // Calcular tiempo promedio de entrega
            const paquetesConTiempo = paquetesEntregados.filter(p => p.diferenciaMinutos);
            const tiempoPromedio = paquetesConTiempo.length > 0
                ? paquetesConTiempo.reduce((sum, p) => sum + p.diferenciaMinutos, 0) / paquetesConTiempo.length
                : 0;
            
            // Tasa de éxito
            const tasaExito = paquetesRuta.length > 0 ? 
                (paquetesEntregados.length / paquetesRuta.length * 100) : 0;
            
            // Peso total transportado
            const pesoTotal = paquetesRuta.reduce((sum, p) => sum + (parseFloat(p.pesoSalida) || 0), 0);
            
            // Efectividad promedio
            const paquetesConEfectividad = paquetesEntregados.filter(p => p.efectividad !== null);
            const efectividadPromedio = paquetesConEfectividad.length > 0
                ? paquetesConEfectividad.reduce((sum, p) => sum + p.efectividad, 0) / paquetesConEfectividad.length
                : 0;
            
            // Incidencias
            const incidencias = paquetesRuta.filter(p => p.incidencia !== 'ninguna').length;
            const tasaIncidencias = paquetesRuta.length > 0 ? (incidencias / paquetesRuta.length * 100) : 0;
            
            return {
                rutaId: ruta.id,
                rutaNombre: ruta.nombre,
                zonaCobertura: ruta.zonaCobertura || 'No especificada',
                totalPaquetes: paquetesRuta.length,
                paquetesEntregados: paquetesEntregados.length,
                paquetesPendientes: paquetesRuta.filter(p => 
                    ['pending', 'assigned', 'in_transit'].includes(p.status)
                ).length,
                tasaExito: Math.round(tasaExito * 100) / 100,
                tiempoPromedio: Math.round(tiempoPromedio * 100) / 100,
                pesoTotal: Math.round(pesoTotal * 100) / 100,
                efectividadPromedio: Math.round(efectividadPromedio * 100) / 100,
                incidencias,
                tasaIncidencias: Math.round(tasaIncidencias * 100) / 100
            };
        });
        
        // Ordenar por efectividad
        rendimientoRutas.sort((a, b) => b.efectividadPromedio - a.efectividadPromedio);
        
        // Análisis por días de la semana
        const distribucionSemanal = {
            'Lunes': 0, 'Martes': 0, 'Miércoles': 0, 'Jueves': 0, 
            'Viernes': 0, 'Sábado': 0, 'Domingo': 0
        };
        
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        
        packages.filter(p => p.status === 'delivered').forEach(paquete => {
            if (paquete.tiempoEntrega) {
                const fecha = new Date(paquete.tiempoEntrega);
                const diaSemana = diasSemana[fecha.getDay()];
                distribucionSemanal[diaSemana]++;
            }
        });
        
        res.json({
            success: true,
            rendimientoRutas,
            distribucionSemanal,
            resumen: {
                totalRutas: routes.length,
                rutaMasEficiente: rendimientoRutas[0] || null,
                promedioEficiencia: rendimientoRutas.length > 0 ? 
                    Math.round(rendimientoRutas.reduce((sum, r) => sum + r.efectividadPromedio, 0) / rendimientoRutas.length * 100) / 100 : 0
            }
        });
        
    } catch (error) {
        console.error('Error generando reporte de rutas:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// GET /incidents - Análisis de incidencias
router.get('/incidents', (req, res) => {
    try {
        const packages = readFile('packages.json');
        
        // Filtrar paquetes con incidencias
        const paquetesConIncidencias = packages.filter(p => p.incidencia !== 'ninguna');
        
        // Análisis por tipo de incidencia
        const tiposIncidencia = {};
        paquetesConIncidencias.forEach(paquete => {
            if (tiposIncidencia[paquete.incidencia]) {
                tiposIncidencia[paquete.incidencia]++;
            } else {
                tiposIncidencia[paquete.incidencia] = 1;
            }
        });
        
        // Análisis de validación de receptor
        const validacionReceptor = {
            pendiente: packages.filter(p => p.validacionReceptor.statusValidacion === 'pendiente').length,
            validado: packages.filter(p => p.validacionReceptor.statusValidacion === 'validado').length,
            conIncidencia: packages.filter(p => p.validacionReceptor.statusValidacion === 'con_incidencia').length
        };
        
        // Tendencia de incidencias últimos 7 días
        const ahora = new Date();
        const tendenciaIncidencias = [];
        
        for (let i = 6; i >= 0; i--) {
            const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
            const fechaStr = fecha.toISOString().split('T')[0];
            const incidenciasDia = paquetesConIncidencias.filter(p => 
                p.fechaCreacion.startsWith(fechaStr)
            ).length;
            
            tendenciaIncidencias.push({
                fecha: fechaStr,
                incidencias: incidenciasDia
            });
        }
        
        // Tasa de incidencias
        const totalPaquetes = packages.length;
        const tasaIncidencias = totalPaquetes > 0 ? 
            (paquetesConIncidencias.length / totalPaquetes * 100) : 0;
        
        res.json({
            success: true,
            resumen: {
                totalIncidencias: paquetesConIncidencias.length,
                paquetesAfectados: paquetesConIncidencias.length,
                tasaIncidencias: Math.round(tasaIncidencias * 100) / 100,
                totalPaquetes
            },
            tiposIncidencia,
            validacionReceptor,
            tendenciaIncidencias,
            incidenciasDetalladas: paquetesConIncidencias.map(paquete => ({
                trackingNumber: paquete.trackingNumber,
                cliente: paquete.cliente,
                incidencia: paquete.incidencia,
                efectividad: paquete.efectividad,
                fechaCreacion: paquete.fechaCreacion,
                validacionReceptor: paquete.validacionReceptor
            }))
        });
        
    } catch (error) {
        console.error('Error generando reporte de incidencias:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// GET /filters - Obtener opciones para filtros
router.get('/filters', (req, res) => {
    try {
        const packages = readFile('packages.json');
        const routes = readFile('routes.json');
        
        // Obtener valores únicos para filtros
        const estados = [
            { id: 'pending', nombre: 'Pendiente' },
            { id: 'assigned', nombre: 'Asignado' },
            { id: 'in_transit', nombre: 'En Tránsito' },
            { id: 'delivered', nombre: 'Entregado' },
            { id: 'cancelled', nombre: 'Cancelado' }
        ];
        
        const prioridades = [
            { id: 'normal', nombre: 'Normal' },
            { id: 'alta', nombre: 'Alta' },
            { id: 'urgente', nombre: 'Urgente' }
        ];
        
        const rutasOptions = routes.map(r => ({ 
            id: r.id, 
            nombre: r.nombre 
        }));
        
        res.json({
            success: true,
            estados,
            prioridades,
            rutas: rutasOptions
        });
        
    } catch (error) {
        console.error('Error obteniendo filtros:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

// GET /export - Exportar datos a CSV
router.get('/export', (req, res) => {
    try {
        const packages = readFile('packages.json');
        const routes = readFile('routes.json');
        
        // Preparar datos para CSV
        const csvData = packages.map(paquete => {
            const ruta = routes.find(r => r.id === paquete.ruta);
            
            return {
                'Tracking Number': paquete.trackingNumber,
                'Cliente': paquete.cliente,
                'Dirección': paquete.direccion,
                'Ruta': ruta ? ruta.nombre : 'No encontrada',
                'Estado': paquete.status,
                'Prioridad': paquete.prioridad,
                'Fecha Creación': new Date(paquete.fechaCreacion).toLocaleString('es-ES'),
                'Tiempo Entrega': paquete.tiempoEntrega ? new Date(paquete.tiempoEntrega).toLocaleString('es-ES') : 'No entregado',
                'Diferencia Minutos': paquete.diferenciaMinutos || 0,
                'Peso Salida': paquete.pesoSalida,
                'Peso Entrega': paquete.pesoEntrega,
                'Efectividad': paquete.efectividad || 0,
                'Incidencia': paquete.incidencia,
                'Quien Recibió': paquete.nombreQuienRecibio || 'No especificado'
            };
        });
        
        // Convertir a CSV
        if (csvData.length > 0) {
            const headers = Object.keys(csvData[0]).join(',');
            const rows = csvData.map(row => 
                Object.values(row).map(value => 
                    typeof value === 'string' && value.includes(',') ? `"${value}"` : value
                ).join(',')
            );
            
            const csvContent = [headers, ...rows].join('\n');
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=packages_export.csv');
            res.send('\ufeff' + csvContent); // BOM para UTF-8
        } else {
            res.status(404).json({ 
                success: false,
                error: 'No hay datos para exportar' 
            });
        }
        
    } catch (error) {
        console.error('Error exportando datos:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error interno del servidor' 
        });
    }
});

module.exports = router;