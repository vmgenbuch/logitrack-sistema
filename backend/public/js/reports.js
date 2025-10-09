// ============================================
// SISTEMA DE REPORTES LOGITRACK - V2.0
// ============================================

// Variables globales
let datosGlobales = null;
let chartsInstances = {};
let tabActual = 'dashboard';

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando Sistema de Reportes LogiTrack');
    
    // Configurar event listeners
    configurarEventListeners();
    
    // Inicializar sistema
    inicializarSistema();
});

function configurarEventListeners() {
    // Filtros del dashboard general
   const btnFiltrarDashboard = document.getElementById('btnFiltrarDashboard');
   const btnHoyDashboard = document.getElementById('btnHoyDashboard');

   if (btnFiltrarDashboard) {
        btnFiltrarDashboard.addEventListener('click', () => {
          cargarDashboardConFiltros();
        });
    }

    if (btnHoyDashboard) {
        btnHoyDashboard.addEventListener('click', () => {
          const hoy = new Date().toISOString().split('T')[0];
          document.getElementById('dashboardStartDate').value = hoy;
          document.getElementById('dashboardEndDate').value = hoy;
          cargarDashboardConFiltros();
        });
    }

    // Event listeners para filtros de incidencias
    const filterIncidentsBtn = document.getElementById('filterIncidentsBtn');
    if (filterIncidentsBtn) {
        filterIncidentsBtn.addEventListener('click', () => {
            cargarIncidencias();
        });
    }
    
    const resetIncidentsBtn = document.getElementById('resetIncidentsBtn');
    if (resetIncidentsBtn) {
        resetIncidentsBtn.addEventListener('click', () => {
            setTodayDatesIncidentes();
            cargarIncidencias();
        });
    }
    
    
    
    // Event listeners para tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            cambiarTab(tab);
        });
    });
    
    // Event listeners para botones
    const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', aplicarFiltros);
    }
    
    const btnExportarCSV = document.getElementById('btnExportarCSV');
    if (btnExportarCSV) {
        btnExportarCSV.addEventListener('click', exportarCSV);
    }

    // Botón de regresar
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', function() {
            window.history.back();
        });
    }
}

function establecerFechasHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    const desde = document.getElementById('dashboardStartDate');
    const hasta = document.getElementById('dashboardEndDate');
    if (desde) desde.value = hoy;
    if (hasta) hasta.value = hoy;
}

async function inicializarSistema() {
    try {
        // Verificar autenticación
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        // ✅ Establecer fechas actuales en el dashboard al iniciar
        establecerFechasHoy();

        // ✅ Cargar dashboard solo con datos del día actual
        await cargarDashboardConFiltros();

        // Configurar fechas por defecto
        configurarFechasPorDefecto();
        
        // Cargar datos iniciales
        await cargarDatos();
        
        console.log('✅ Sistema inicializado correctamente');
    } catch (error) {
        console.error('❌ Error al inicializar:', error);
        mostrarError('Error al cargar el sistema de reportes');
    }
}

function configurarFechasPorDefecto() {
  // Fecha local YYYY-MM-DD sin desfase UTC
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  const fechaHoy = `${y}-${m}-${d}`;

  // Filtros del Dashboard General
  const dStart = document.getElementById('dashboardStartDate');
  const dEnd   = document.getElementById('dashboardEndDate');
  if (dStart) dStart.value = fechaHoy;
  if (dEnd)   dEnd.value   = fechaHoy;

  // Filtros de Seguimiento Detallado (los que ya tenías)
  const fechaInicio = document.getElementById('fechaInicio');
  const fechaFin    = document.getElementById('fechaFin');
  if (fechaInicio) fechaInicio.value = fechaHoy;
  if (fechaFin)    fechaFin.value    = fechaHoy;
}

/*function configurarFechasPorDefecto() {
    const hoy = new Date();
    
    // Obtener fecha local sin conversión UTC
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${año}-${mes}-${dia}`;
    
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    
    if (fechaInicio) fechaInicio.value = fechaHoy;
    if (fechaFin) fechaFin.value = fechaHoy;
}+/

/*function configurarFechasPorDefecto() {
    const hoy = new Date();
    const hace7Dias = new Date(hoy.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    
    if (fechaInicio) fechaInicio.value = hace7Dias.toISOString().split('T')[0];
    if (fechaFin) fechaFin.value = hoy.toISOString().split('T')[0];
}*/

// ============================================
// GESTIÓN DE DATOS
// ============================================
async function cargarDatos() {
  try {
    mostrarCargando();

    const token = localStorage.getItem('token');

    // Cargar datos según el tab activo
    switch (tabActual) {
      case 'dashboard':
        // ✅ cargar solo con el rango de los inputs (por defecto: HOY)
        await cargarDashboardConFiltros();
        break;
      case 'seguimiento':
        await cargarSeguimiento();
        break;
      case 'rutas':
        await cargarRutas();
        break;
      case 'incidencias':
        await cargarIncidencias();
        break;
      default:
        await cargarDashboardConFiltros();
    }

    ocultarCargando();

  } catch (error) {
    console.error('❌ Error al cargar datos:', error);
    mostrarError('Error al cargar los datos del servidor');
    ocultarCargando();
  }
}

/*async function cargarDatos() {
    try {
        mostrarCargando();
        
        const token = localStorage.getItem('token');
        
        // Cargar datos principales según el tab activo
        switch (tabActual) {
            case 'dashboard':
                await cargarDashboard();
                break;
            case 'seguimiento':
                await cargarSeguimiento();
                break;
            case 'rutas':
                await cargarRutas();
                break;
            case 'incidencias':
                await cargarIncidencias();
                break;
            default:
                await cargarDashboard();
        }
        
        ocultarCargando();
        
    } catch (error) {
        console.error('❌ Error al cargar datos:', error);
        mostrarError('Error al cargar los datos del servidor');
        ocultarCargando();
    }
}*/

// ============================================
// DASHBOARD GENERAL
// ============================================
async function cargarDashboard() {
  try {
    const token = localStorage.getItem('token');
    // Si no hay inputs del dashboard, carga sin filtros (fallback)
    const hasInputs = document.getElementById('dashboardStartDate') && document.getElementById('dashboardEndDate');
    if (hasInputs) return cargarDashboardConFiltros();

    const response = await fetch('/api/reports/dashboard', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const datos = await response.json();

    datosGlobales = datos;
    actualizarDashboard();

  } catch (error) {
    console.error('❌ Error cargando dashboard:', error);
    mostrarError('Error al cargar el dashboard');
  }
}

/*async function cargarDashboard() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/reports/dashboard', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const datos = await response.json();
        console.log('📊 Dashboard data:', datos);
        
        datosGlobales = datos;
        actualizarDashboard();
        
    } catch (error) {
        console.error('❌ Error cargando dashboard:', error);
        mostrarError('Error al cargar el dashboard');
    }
}*/

async function cargarDashboardConFiltros() {
  try {
    const token = localStorage.getItem('token');
    const start = document.getElementById('dashboardStartDate')?.value;
    const end   = document.getElementById('dashboardEndDate')?.value;

    const qs = new URLSearchParams();
    if (start) qs.append('startDate', start);
    if (end)   qs.append('endDate', end);

    const prev = calcularPeriodoAnterior(start, end);
    const qsp = new URLSearchParams();
    qsp.append('startDate', prev.start);
    qsp.append('endDate', prev.end);

    const [respNow, respPrev] = await Promise.all([
      fetch(`/api/reports/dashboard?${qs}`,  { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`/api/reports/dashboard?${qsp}`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);
    if (!respNow.ok) throw new Error(`Error HTTP: ${respNow.status}`);
    if (!respPrev.ok) throw new Error(`Error HTTP: ${respPrev.status}`);

    const [dataNow, dataPrev] = await Promise.all([respNow.json(), respPrev.json()]);

    // KPIs ya existentes
    datosGlobales = dataNow;
    actualizarDashboard();

    // Resumen (nuevo)
    const metricsNow  = calcularMetricas(dataNow);
    const metricsPrev = calcularMetricas(dataPrev);
    renderResumen(metricsNow, metricsPrev);

    await cargarTopRutas(start, end);
    await cargarTopChoferes(start, end);

    mostrarExito('Dashboard actualizado con los filtros seleccionados');
  } catch (error) {
    console.error('❌ Error cargando dashboard filtrado:', error);
    mostrarError('No se pudo cargar el dashboard con los filtros');
  }
}



/*async function cargarDashboardConFiltros() {
    try {
        const token = localStorage.getItem('token');
        const start = document.getElementById('dashboardStartDate')?.value;
        const end = document.getElementById('dashboardEndDate')?.value;

        const params = new URLSearchParams();
        if (start) params.append('startDate', start);
        if (end) params.append('endDate', end);

        const response = await fetch(`/api/reports/dashboard?${params}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

        const datos = await response.json();
        datosGlobales = datos;
        actualizarDashboard();

        mostrarExito('Dashboard actualizado con los filtros seleccionados');

    } catch (error) {
        console.error('❌ Error cargando dashboard filtrado:', error);
        mostrarError('No se pudo cargar el dashboard con los filtros');
    }
}*/

// Helper: toma el primer elemento que exista de una lista de IDs
function pickEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function actualizarDashboard() {
  if (!datosGlobales) return;

  console.log("📊 Payload dashboard (datosGlobales):", datosGlobales);

  const summary = datosGlobales.data?.summary || {};

  // Actualizar métricas principales
  const el = (id, valor) => {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = valor;
  };

  el('kpiTotal', summary.totalPackages ?? 0);
  el('kpiDelivered', summary.deliveredPackages ?? 0);
  el('kpiSuccessRate', `${summary.deliveryRate ?? 0}%`);
  el('kpiOnTimeRate', `${summary.onTimeRate ?? 0}%`);
  el('kpiAvgDelay', summary.avgDelay ? `${summary.avgDelay} min` : '0 min');
  el('kpiIncidentRate', `${summary.incidentRate ?? 0}%`);

  // Crear gráficos si hay datos
  if (datosGlobales.data?.trends?.daily) {
    crearGraficoTendencia(datosGlobales.data.trends.daily);
  }

  if (datosGlobales.data?.distributions?.status) {
    crearGraficoEstados(datosGlobales.data.distributions.status);
  }

  console.log("✅ KPIs actualizados correctamente");
}


/*function actualizarDashboard() {
    if (!datosGlobales) return;
    
    // Actualizar métricas principales
    const summary = datosGlobales.data?.summary || {};
    actualizarElemento('totalPaquetes', summary.totalPackages || 0);
    actualizarElemento('paquetesEntregados', summary.deliveredPackages || 0);
    actualizarElemento('paquetesPendientes', (summary.totalPackages || 0) - (summary.deliveredPackages || 0));
    actualizarElemento('tasaExito', `${summary.deliveryRate || 0}%`);
    actualizarElemento('tiempoPromedio', formatearTiempo(summary.avgDeliveryTime || 0));
    actualizarElemento('efectividadPromedio', `${summary.avgEffectiveness || 0}%`);
    
    // Crear gráficos
    if (datosGlobales.data?.trends?.daily) {
         crearGraficoTendencia(datosGlobales.data.trends.daily);
    }

    if (datosGlobales.data?.distributions?.status) {
         crearGraficoEstados(datosGlobales.data.distributions.status);
    }
}*/

function crearGraficoTendencia(dailyData) {
    const ctx = document.getElementById('tendenciaChart');
    if (!ctx) return;
    
    if (chartsInstances.tendencia) {
        chartsInstances.tendencia.destroy();
    }
    
    // Verificar que dailyData es un array
    if (!Array.isArray(dailyData)) {
        console.warn('dailyData no es un array:', dailyData);
        return;
    }
    
    chartsInstances.tendencia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyData.map(d => d.day || 'N/A'),
            datasets: [{
                label: 'Entregas por día',
                data: dailyData.map(d => d.delivered || 0),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: 'white',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

function crearGraficoEstados(datos) {
    const ctx = document.getElementById('estadosChart');
    if (!ctx) return;
    
    if (chartsInstances.estados) {
        chartsInstances.estados.destroy();
    }
    
    const colores = [
        'rgba(34, 197, 94, 0.8)',   // Verde para entregado
        'rgba(59, 130, 246, 0.8)',  // Azul para en_transito
        'rgba(249, 115, 22, 0.8)',  // Naranja para pendiente
        'rgba(239, 68, 68, 0.8)'    // Rojo para incidencia
    ];
    
    chartsInstances.estados = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(datos).map(estado => {
                const nombres = {
                    'delivered': 'Entregado',
                    'in_transit': 'En Tránsito',
                    'pending': 'Pendiente',
                    'incident': 'Con Incidencia'
                };
                return nombres[estado] || estado;
            }),
            datasets: [{
                data: Object.values(datos),
                backgroundColor: colores,
                borderWidth: 0,
                hoverBorderWidth: 2,
                hoverBorderColor: 'white'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        padding: 20,
                        usePointStyle: true
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// ====== MÉTRICAS AVANZADAS + RESUMEN (DASHBOARD) ======

function calcularPeriodoAnterior(start, end){
  const today = new Date().toISOString().split('T')[0];
  const s = start || today;
  const e = end   || today;
  const sD = new Date(s + 'T00:00:00');
  const eD = new Date(e + 'T00:00:00');
  const days = Math.max(1, Math.round((eD - sD)/86400000)+1);
  const prevEnd = new Date(sD.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days-1)*86400000);
  const iso = d => d.toISOString().split('T')[0];
  return { start: iso(prevStart), end: iso(prevEnd) };
}

function calcularMetricas(payload){
  const summary = payload?.data?.summary;
  if (summary) {
    // Si tu backend incluye onTimeRate, úsalo; si no, intenta con avgEffectiveness; si no, 0.
    const onTime = summary.onTimeRate ?? summary.avgEffectiveness ?? null;

    return {
      total:        summary.totalPackages ?? 0,
      delivered:    summary.deliveredPackages ?? 0,
      successRate:  Number(summary.deliveryRate ?? 0),
      incidentRate: Number(summary.incidentRate ?? 0),
      onTimeRate:   (onTime === null ? 0 : Number(onTime)), // si prefieres N/A, cámbialo al pintar
      avgDelayMin:  Number(summary.avgDelay ?? summary.avgDeliveryTime ?? 0)
    };
  }

  // Fallback por si alguna vez mandas lista de paquetes
  const list   = payload?.packages || payload?.data?.packages || payload?.data || payload || [];
  const items  = Array.isArray(list) ? list : [];
  let total = items.length, delivered = 0, incidents = 0, onTime = 0, totalDelayMin = 0;

  for (const p of items){
    const status = (p.status || p.estado || '').toLowerCase();
    const hasIncident = !!(p.incidencia || p.incident || p.issue);
    const slaMin = p.slaMinutes ?? p.sla_min ?? 0;
    const startedAt   = new Date(p.tiempo_salida_reparto || p.startedAt || p.assigned_at || p.created_at || 0);
    const deliveredAt = new Date(p.tiempo_entrega        || p.deliveredAt || p.delivered_at || 0);

    if (status === 'entregado' || status === 'delivered') delivered++;
    if (hasIncident) incidents++;

    if (deliveredAt.getTime() && startedAt.getTime() && slaMin){
      const minutes = (deliveredAt - startedAt) / 60000;
      if (minutes <= slaMin) onTime++;
      totalDelayMin += Math.max(0, minutes - slaMin);
    }
  }

  const successRate  = total ? (delivered/total)*100 : 0;
  const incidentRate = total ? (incidents/total)*100 : 0;
  const onTimeRate   = delivered ? (onTime/delivered)*100 : 0;
  const avgDelay     = (delivered && totalDelayMin) ? (totalDelayMin/delivered) : 0;

  return { total, delivered, successRate, incidentRate, onTimeRate, avgDelayMin: avgDelay };
}

function renderResumen(now, prev){
  const t = document.getElementById('exec-summary-text');
  if (!t) return;

  // Si no hay "previo" válido, no muestres variaciones
  const hasPrev = !!(prev && (prev.total > 0 || prev.delivered > 0));

  const delta = (a,b) => (b === 0 ? 0 : ((a-b)/b)*100);
  const dDeliver = Math.round(delta(now.delivered,   prev?.delivered ?? 0));
  const dSuccess = Math.round(delta(now.successRate, prev?.successRate ?? 0));
  const dOnTime  = Math.round(delta(now.onTimeRate,  prev?.onTimeRate  ?? 0));
  const dDelay   = Math.round(((now.avgDelayMin - (prev?.avgDelayMin ?? 0)) / ((prev?.avgDelayMin ?? 1))) * 100);

  const chips = hasPrev
    ? `${badgeDelta('Entregas', dDeliver)}
       ${badgeDelta('Éxito', dSuccess)}
       ${badgeDelta('A tiempo', dOnTime)}
       ${badgeDelta('Retraso prom.', -dDelay, true)}`
    : '';

  t.innerHTML = `
    <strong>Resumen:</strong>
    ${now.total} paquete${now.total===1?'':'s'}; entregados <strong>${now.delivered}</strong>
    (éxito <strong>${pct(now.successRate)}</strong>, a tiempo <strong>${pct(now.onTimeRate)}</strong>).
    ${chips}
  `;
}

function badgeDelta(lbl, v, invert=false){
  const up = v > 0;
  const good = invert ? !up : up; // si invert=true, bajar es bueno
  const color = good ? '#38a169' : '#e53e3e';
  const sign = v>0?'+':'';
  return `<span style="margin-left:8px;padding:2px 6px;border-radius:10px;background:${color}22;color:${color};font-size:12px;">
    ${lbl}: ${sign}${v}%
  </span>`;
}

function pct(n){ return (isFinite(n)? n:0).toFixed(0) + '%'; }

async function cargarTopRutas(startDate, endDate) {
  const token = localStorage.getItem('token');
  const qs = `?startDate=${startDate}&endDate=${endDate}`;
  const res = await fetch(`/api/reports/route-performance${qs}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  renderTopRutas(data.data || data);
}

function renderTopRutas(rows) {
  // Soporta varios shapes comunes
  const arr = Array.isArray(rows) ? rows : (rows?.routes || rows?.items || []);
  const norm = arr.map(r => ({
    name: r.route || r.ruta || r.name || 'N/D',
    delivered: Number(r.delivered ?? r.entregados ?? r.count ?? 0),
    success: Number(r.successRate ?? r.exito ?? 0)
  }))
  .sort((a,b) => b.delivered - a.delivered)
  .slice(0,5);

  const cont = document.getElementById('top-routes');
  if (!cont) return;

  if (!norm.length) {
    cont.innerHTML = `<div class="empty">Sin datos para el periodo</div>`;
    return;
  }

  cont.innerHTML = `
    <table class="mini-table">
      <thead><tr><th>Ruta</th><th>Entregados</th><th>% Éxito</th></tr></thead>
      <tbody>
        ${norm.map(r => `
          <tr>
            <td>${r.name}</td>
            <td>${r.delivered}</td>
            <td>${r.success.toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// (Opcional) si tienes endpoint de choferes, duplica la idea:
async function cargarTopChoferes(startDate, endDate) {
  const cont = document.getElementById('top-drivers');
  if (!cont) return;
  cont.innerHTML = `<div class="empty">Próximamente</div>`;
}

// ============================================
// SEGUIMIENTO DETALLADO
// ============================================
async function cargarSeguimiento() {
    try {
        const token = localStorage.getItem('token');
        
        // Cargar filtros
        await cargarFiltros();
        
        // Construir parámetros con los nombres correctos
        const params = new URLSearchParams({
            fechaInicio: document.getElementById('fechaInicio')?.value || '',
            fechaFin: document.getElementById('fechaFin')?.value || '',
            estado: document.getElementById('filtroEstado')?.value || '',
            ruta: document.getElementById('filtroRuta')?.value || ''
        });
        
        console.log('Parámetros enviados al backend:', params.toString());
        
        const response = await fetch(`/api/reports/detailed-tracking?${params}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const datos = await response.json();
        console.log('Datos recibidos del backend:', datos);
        
        actualizarTablaSeguimiento(datos.data?.records || []);
        /*const mappedRecords = (datos.data?.records || []).map(mapPackageFromAPI);
        actualizarTablaSeguimiento(mappedRecords);*/
        
    } catch (error) {
        console.error('Error cargando seguimiento:', error);
        mostrarError('Error al cargar datos de seguimiento');
    }
}

async function cargarFiltros() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/reports/filters', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const filtros = await response.json();
        
        // Actualizar opciones de filtros
        const selectRuta = document.getElementById('filtroRuta');
        if (selectRuta && filtros.routes) {
            selectRuta.innerHTML = '<option value="">Todas</option>';
            filtros.routes.forEach(ruta => {
                const option = document.createElement('option');
                option.value = ruta;
                // Formatear el nombre de la ruta para que sea más legible
                option.textContent = formatearNombreRuta(ruta);
                selectRuta.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('❌ Error cargando filtros:', error);
    }
}

// Función auxiliar para formatear nombres de rutas
function formatearNombreRuta(ruta) {
    // Si viene como "ruta1" → "Ruta 1"
    if (ruta.toLowerCase().startsWith('ruta')) {
        return ruta.replace(/ruta/i, 'Ruta ');
    }
    return ruta;
}

function actualizarTablaSeguimiento(packages, rutas = []) {
    const tbody = document.getElementById('cuerpoTablaSeguimiento');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    packages.forEach(pkg => {
        // Buscar el nombre de la ruta
        let nombreRuta = pkg.ruta || 'N/A';
        if (rutas.length > 0) {
            const ruta = rutas.find(r => r.id === pkg.ruta);
            nombreRuta = ruta ? ruta.nombre : 'Ruta no encontrada';
        }
        
        // Convertir fechas ISO a hora local
        let tiempoSalida = pkg.tiempoSalidaReparto || '-';
        let tiempoEntrega = pkg.tiempoEntrega || '-';
        
        // Usar diferenciaMinutos del backend (ya calculado correctamente)
        const totalTiempo = pkg.diferenciaMinutos || 0;
        

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${pkg.trackingNumber || 'N/A'}</td>
            <td>${pkg.cliente || 'N/A'}</td>
            <td>${nombreRuta}</td>
            <td>${tiempoSalida}</td>
            <td>${tiempoEntrega}</td>
            <td>${formatearTiempo(totalTiempo)}</td>
            <td>${pkg.pesoSalida || 0} kg</td>
            <td>${pkg.pesoEntrega || 0} kg</td>
            <td>${pkg.diferenciaPeso || 0} kg</td>
            <td>${pkg.efectividad || 0}%</td>
        `;
        tbody.appendChild(fila);
    });
}

// ============================================
// RENDIMIENTO DE RUTAS
// ============================================
async function cargarRutas() {
  try {
    const token = localStorage.getItem('token');
    const resp = await fetch('/api/reports/route-performance', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);

    const api = await resp.json();
    console.log('🛣️ Rutas data (raw):', api);

    // 1) Adaptar al formato que espera la UI
    const perf = adaptarRendimientoRutas(api);
    console.log('🛣️ Rutas data (adaptado):', perf);

    // 2) KPIs
    renderKPIsRutas(perf);

    // 3) Gráficas
    renderChartEfectividadPorRuta(perf);   // barras % éxito por ruta
    // Si luego agregas semanal: renderChartDistribucionSemanal(perf.weekly || []);

    // 4) Tabla de choferes (si tienes endpoint/estructura):
    // actualizarTablaChoferes(perf.drivers || []);

  } catch (error) {
    console.error('❌ Error cargando rutas:', error);
    mostrarError('Error al cargar datos de rutas');
  }
}

function adaptarRendimientoRutas(api) {
  // Soporta {success:true,data:[...]} o array directo
  const rows = Array.isArray(api) ? api : (api?.data || []);

  const effectivenessByRoute = rows.map(r => ({
    name:      r.routeName || r.nombre || r.ruta || 'N/D',
    delivered: Number(r.delivered ?? r.entregados ?? r.count ?? 0),
    success:   Number(r.successRate ?? r.exito ?? 0)   // %
  }));

  const totalRoutes = effectivenessByRoute.length;
  const avgSuccess  = totalRoutes
    ? effectivenessByRoute.reduce((s, r) => s + (r.success || 0), 0) / totalRoutes
    : 0;

  const bestRoute = [...effectivenessByRoute]
    .sort((a, b) => (b.success - a.success) || (b.delivered - a.delivered))[0] || {name:'N/D', success:0};

  return {
    totalRoutes,
    avgSuccess,             // %
    bestRoute,              // {name, success, delivered}
    effectivenessByRoute,   // [{name, delivered, success}]
    // weekly: [], drivers: [] // <- si después agregas más series
  };
}

// =========================
// 3️⃣ RENDERIZAR KPIs DE RUTAS
// =========================
function renderKPIsRutas(perf) {
  const $ = id => document.getElementById(id);

  // Asegúrate que tu HTML tenga estos IDs
  if ($('kpiRutasTotal')) $('kpiRutasTotal').textContent = perf.totalRoutes || 0;
  if ($('kpiEficienciaProm')) $('kpiEficienciaProm').textContent = `${(perf.avgSuccess || 0).toFixed(1)}%`;
  if ($('kpiMejorTasa')) $('kpiMejorTasa').textContent = `${(perf.bestRoute.success || 0).toFixed(0)}%`;
  if ($('kpiMejorRuta')) $('kpiMejorRuta').textContent = perf.bestRoute.name || 'N/D';
}

// =========================
// 4️⃣ GRÁFICO DE EFECTIVIDAD POR RUTA
// =========================
let _chartEfectividad;
function renderChartEfectividadPorRuta(perf) {
  const canvas = document.getElementById('chartEfectividadPorRuta');
  if (!canvas) return;

  const data = perf.effectivenessByRoute || [];
  if (!data.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = data.map(r => r.name);
  const values = data.map(r => r.success || 0);

  if (_chartEfectividad) _chartEfectividad.destroy();
  _chartEfectividad = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '% Éxito', data: values, borderWidth: 1 }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
      plugins: { legend: { display: false } }
    }
  });
}

function actualizarMetricasRutas(datos) {
    const container = document.getElementById('metricas-rutas');
    if (!container) return;
    
    const rutas = datos.data?.routes || [];
    const totalRutas = rutas.length;
    const promedioEficiencia = totalRutas > 0 ? 
       rutas.reduce((sum, r) => sum + (r.metrics?.deliveryRate || 0), 0) / totalRutas : 0;
    const mejorRuta = rutas.reduce((mejor, actual) => 
       (actual.metrics?.deliveryRate || 0) > (mejor.metrics?.deliveryRate || 0) ? actual : mejor, 
       { metrics: { deliveryRate: 0 }, routeName: 'N/A' }
    );
    
    
    container.innerHTML = `
    <div class="metric-card">
        <div class="metric-icon packages">🛣️</div>
        <div class="metric-value">${totalRutas}</div>
        <div class="metric-label">Total Rutas</div>
    </div>
    <div class="metric-card">
        <div class="metric-icon efficiency">📊</div>
        <div class="metric-value">${promedioEficiencia.toFixed(1)}%</div>
        <div class="metric-label">Eficiencia Promedio</div>
    </div>
    <div class="metric-card">
        <div class="metric-icon delivered">🏆</div>
        <div class="metric-value">${mejorRuta.metrics?.deliveryRate || 0}%</div>
        <div class="metric-label">Mejor Tasa Entrega</div>
    </div>
    <div class="metric-card">
        <div class="metric-icon success">🎯</div>
        <div class="metric-value">${mejorRuta.routeName?.split(' ')[0] || 'N/A'}</div>
        <div class="metric-label">Mejor Ruta</div>
    </div>
`;
}

function crearGraficoEficiencia(datos) {
    const ctx = document.getElementById('eficienciaChart');
    if (!ctx) return;
    
    if (chartsInstances.eficiencia) {
        chartsInstances.eficiencia.destroy();
    }
    
    // Usar datos de rutas en lugar de choferes
    const rutas = datos.data?.routes || [];
    
    chartsInstances.eficiencia = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: rutas.map(r => r.routeName || 'N/A'),
            datasets: [{
                label: 'Tasa de Entrega (%)',
                data: rutas.map(r => r.metrics?.deliveryRate || 0),
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: 'rgb(16, 185, 129)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

function crearGraficoSemanal(datos) {
    const ctx = document.getElementById('semanalChart');
    if (!ctx) return;
    
    if (chartsInstances.semanal) {
        chartsInstances.semanal.destroy();
    }
    
    // Obtener distribución semanal de todas las rutas combinadas
    const rutas = datos.data?.routes || [];
    
    // Combinar distribución semanal de todas las rutas
    const distribucionSemanal = {
        'Lunes': 0,
        'Martes': 0,
        'Miércoles': 0,
        'Jueves': 0,
        'Viernes': 0,
        'Sábado': 0,
        'Domingo': 0
    };
    
    rutas.forEach(ruta => {
        if (ruta.distributions?.weekdays) {
            Object.keys(ruta.distributions.weekdays).forEach(dia => {
                if (distribucionSemanal[dia] !== undefined) {
                    distribucionSemanal[dia] += ruta.distributions.weekdays[dia];
                }
            });
        }
    });
    
    const diasSemana = Object.keys(distribucionSemanal);
    const valores = Object.values(distribucionSemanal);
    
    chartsInstances.semanal = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: diasSemana,
            datasets: [{
                label: 'Entregas por día',
                data: valores,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: 'white',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    pointLabels: {
                        color: 'rgba(255, 255, 255, 0.8)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        backdropColor: 'transparent'
                    }
                }
            }
        }
    });
}

function actualizarTablaChoferes(datos) {
    const tbody = document.getElementById('cuerpoTablaChoferes');
    if (!tbody) return;
    
    // Cambiar para mostrar rutas en lugar de choferes
    const rutas = datos.data?.routes || [];
    
    // Ordenar rutas por tasa de entrega
    const rutasOrdenadas = [...rutas].sort((a, b) => 
        (b.metrics?.deliveryRate || 0) - (a.metrics?.deliveryRate || 0)
    );
    
    tbody.innerHTML = '';
    
    rutasOrdenadas.forEach((ruta, index) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><span class="ranking-badge">#${index + 1}</span></td>
            <td>${ruta.routeName || 'N/A'}</td>
            <td>${ruta.metrics?.totalPackages || 0}</td>
            <td>${ruta.metrics?.deliveredPackages || 0}</td>
            <td>${ruta.metrics?.deliveryRate || 0}%</td>
            <td>${formatearTiempo(ruta.metrics?.avgDeliveryTime || 0)}</td>
            <td>${ruta.metrics?.avgWeight || 0} kg</td>
            <td>${ruta.metrics?.deliveryRate || 0}%</td>
        `;
        tbody.appendChild(fila);
    });
}

// ============================================
// ANÁLISIS DE INCIDENCIAS
// ============================================
async function cargarIncidencias() {
    try {
        const token = localStorage.getItem('token');
        
        // Configurar fechas por defecto si no existen
        //setTodayDatesIncidentes();
        
        // Obtener fechas de los filtros
        const startDate = document.getElementById('incidentStartDate')?.value;
        const endDate = document.getElementById('incidentEndDate')?.value;
        
        // Construir parámetros
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        // Usar el endpoint de reportes que combina ambas fuentes
        const response = await fetch(`/api/reports/incidents?${params}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error('Error en la respuesta del servidor');
        }
        
        const summary = result.data.summary;
        const tiposIncidencia = result.data.distributions.byType;
        const tendencia = result.data.trends.weekly;
        
        const datos = {
            totalIncidencias: summary.totalIncidents,
            tasaIncidencia: summary.incidentRate,
            incidenciasResueltas: 0, // Puedes agregarlo si lo tienes
            tiposIncidencia: tiposIncidencia,
            tendenciaIncidencias: {}
        };
        
        // Convertir tendencia de array a objeto para el gráfico
        if (Array.isArray(tendencia)) {
            tendencia.forEach(item => {
                datos.tendenciaIncidencias[item.date] = item.incidents;
            });
        }
        
        console.log('⚠️ Incidencias procesadas:', datos);
        
        // Actualizar métricas
        actualizarMetricasIncidencias(datos);
        
        // Crear gráficos
        if (Object.keys(tiposIncidencia).length > 0) {
            crearGraficoTiposIncidencia(tiposIncidencia);
        }
        
        if (Object.keys(datos.tendenciaIncidencias).length > 0) {
            crearGraficoTendenciaIncidencias(datos.tendenciaIncidencias);
        }

        if (result.data.distributions.byBranch && Object.keys(result.data.distributions.byBranch).length > 0) {
            crearGraficoIncidenciasSucursal(result.data.distributions.byBranch);
        }

        
    } catch (error) {
        console.error('❌ Error cargando incidencias:', error);
        mostrarError('Error al cargar datos de incidencias');
    }
}

// Configurar fechas de incidencias (HOY por defecto)
function setTodayDatesIncidentes() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${año}-${mes}-${dia}`;
    
    const startDate = document.getElementById('incidentStartDate');
    const endDate = document.getElementById('incidentEndDate');
    
    // Solo configurar si están vacíos
    if (startDate && !startDate.value) startDate.value = fechaHoy;
    if (endDate && !endDate.value) endDate.value = fechaHoy;
}

// Configurar fechas de incidencias (HOY por defecto)
/*function setTodayDatesIncidentes() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${año}-${mes}-${dia}`;
    
    const startDate = document.getElementById('incidentStartDate');
    const endDate = document.getElementById('incidentEndDate');
    
    if (startDate) startDate.value = fechaHoy;
    if (endDate) endDate.value = fechaHoy;
}*/

// Cargar incidencias con filtros de fecha
async function cargarIncidenciasConFiltros() {
    try {
        const token = localStorage.getItem('token');
        const startDate = document.getElementById('incidentStartDate')?.value;
        const endDate = document.getElementById('incidentEndDate')?.value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        const response = await fetch(`/api/reports/incidents?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        if (result.success) {
            const datos = result.data.summary;
            const tiposIncidencia = result.data.distributions.byType;
            const tendencia = result.data.trends.weekly;
            
            // Actualizar métricas
            actualizarMetricasIncidencias({
                totalIncidencias: datos.totalIncidents,
                tasaIncidencia: datos.incidentRate,
                incidenciasResueltas: 0 // Agregar si tienes este dato
            });
            
            // Actualizar gráficos
            if (Object.keys(tiposIncidencia).length > 0) {
                crearGraficoTiposIncidencia(tiposIncidencia);
            }
            
            if (Array.isArray(tendencia) && tendencia.length > 0) {
                const tendenciaObj = {};
                tendencia.forEach(item => {
                    tendenciaObj[item.date] = item.incidents;
                });
                crearGraficoTendenciaIncidencias(tendenciaObj);
            }
        }
    } catch (error) {
        console.error('Error cargando incidencias con filtros:', error);
        mostrarError('Error al cargar incidencias filtradas');
    }
}

// Agregar event listeners para los botones
document.addEventListener('DOMContentLoaded', function() {
    // ... tu código existente ...
    
    // Event listeners para filtros de incidencias
    const filterIncidentsBtn = document.getElementById('filterIncidentsBtn');
    if (filterIncidentsBtn) {
        filterIncidentsBtn.addEventListener('click', cargarIncidenciasConFiltros);
    }
    
    const resetIncidentsBtn = document.getElementById('resetIncidentsBtn');
    if (resetIncidentsBtn) {
        resetIncidentsBtn.addEventListener('click', () => {
            setTodayDatesIncidentes();
            cargarIncidenciasConFiltros();
        });
    }
    
    // Configurar fechas al cambiar a la pestaña de incidencias
    document.querySelector('[data-tab="incidencias"]')?.addEventListener('click', () => {
        setTimeout(() => {
            setTodayDatesIncidentes();
        }, 100);
    });
});


function actualizarMetricasIncidencias(datos) {
    const container = document.getElementById('metricas-incidencias');
    if (!container) return;
    
    const totalIncidencias = datos.totalIncidencias || 0;
    const tasaIncidencia = datos.tasaIncidencia || 0;
    const resueltas = datos.incidenciasResueltas || 0;
    
    container.innerHTML = `
        <div class="metric-card">
            <div class="metric-icon pending">⚠️</div>
            <div class="metric-value">${totalIncidencias}</div>
            <div class="metric-label">Total Incidencias</div>
        </div>
        <div class="metric-card">
            <div class="metric-icon efficiency">📉</div>
            <div class="metric-value">${tasaIncidencia}%</div>
            <div class="metric-label">Tasa de Incidencia</div>
        </div>
        <div class="metric-card">
            <div class="metric-icon success">✅</div>
            <div class="metric-value">${(100 - tasaIncidencia).toFixed(1)}%</div>
            <div class="metric-label">Paquetes sin Incidencia</div>
        </div>
        <div class="metric-card">
            <div class="metric-icon time">📋</div>
            <div class="metric-value">${resueltas}</div>
            <div class="metric-label">Resueltas</div>
        </div>
    `;
}

function crearGraficoTiposIncidencia(datos) {
    const ctx = document.getElementById('tiposIncidenciaChart');
    if (!ctx) return;
    
    if (chartsInstances.tiposIncidencia) {
        chartsInstances.tiposIncidencia.destroy();
    }
    
    const colores = [
        'rgba(239, 68, 68, 0.8)',   // Rojo
        'rgba(249, 115, 22, 0.8)',  // Naranja
        'rgba(245, 158, 11, 0.8)',  // Amarillo
        'rgba(16, 185, 129, 0.8)',  // Verde
        'rgba(59, 130, 246, 0.8)'   // Azul
    ];
    
    chartsInstances.tiposIncidencia = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(datos),
            datasets: [{
                data: Object.values(datos),
                backgroundColor: colores,
                borderWidth: 0,
                hoverBorderWidth: 2,
                hoverBorderColor: 'white'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function crearGraficoTendenciaIncidencias(datos) {
    const ctx = document.getElementById('tendenciaIncidenciasChart');
    if (!ctx) return;
    
    if (chartsInstances.tendenciaIncidencias) {
        chartsInstances.tendenciaIncidencias.destroy();
    }
    
    chartsInstances.tendenciaIncidencias = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(datos).map(f => new Date(f).toLocaleDateString('es-ES', { 
                month: 'short', 
                day: 'numeric' 
            })),
            datasets: [{
                label: 'Incidencias por día',
                data: Object.values(datos),
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgb(239, 68, 68)',
                pointBorderColor: 'white',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

function crearGraficoIncidenciasSucursal(datos) {
    const ctx = document.getElementById('incidenciasSucursalChart');
    if (!ctx) return;
    
    if (chartsInstances.incidenciasSucursal) {
        chartsInstances.incidenciasSucursal.destroy();
    }
    
    chartsInstances.incidenciasSucursal = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(datos),
            datasets: [{
                label: 'Incidencias',
                data: Object.values(datos),
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderColor: 'rgb(239, 68, 68)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',  // Barras horizontales
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.7)' } },
                y: { ticks: { color: 'rgba(255, 255, 255, 0.7)' } }
            }
        }
    });
}


// ============================================
// GESTIÓN DE TABS
// ============================================
function cambiarTab(nuevoTab) {
    // Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Desactivar todos los botones
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Mostrar el contenido seleccionado
    const contenido = document.getElementById(nuevoTab);
    if (contenido) {
        contenido.classList.add('active');
    }
    
    // Activar el botón seleccionado
    const botonActivo = document.querySelector(`[data-tab="${nuevoTab}"]`);
    if (botonActivo) {
        botonActivo.classList.add('active');
    }
    
    // Actualizar tab actual
    tabActual = nuevoTab;
    
    // Configurar fechas solo al entrar por primera vez a incidencias
    if (nuevoTab === 'incidencias') {
        setTimeout(() => {
            setTodayDatesIncidentes();
        }, 50);
    }
    
    // Cargar datos para el nuevo tab
    setTimeout(() => {
        cargarDatos();
    }, 100);
}

// ============================================
// FILTROS Y EXPORTACIÓN
// ============================================
function aplicarFiltros() {
    console.log('🔍 Aplicando filtros...');
    if (tabActual === 'seguimiento') {
        cargarSeguimiento();
    } else {
        cargarDatos();
    }
}

function exportarCSV() {
    if (!datosGlobales) {
        mostrarError('No hay datos para exportar');
        return;
    }
    
    console.log('📄 Exportando a CSV...');
    
    // Determinar qué datos exportar según el tab activo
    let csvContent = '';
    let filename = `reporte_logitrack_${new Date().toISOString().split('T')[0]}.csv`;
    
    switch (tabActual) {
        case 'seguimiento':
            csvContent = exportarSeguimientoCSV();
            filename = `seguimiento_${filename}`;
            break;
        case 'rutas':
            csvContent = exportarRutasCSV();
            filename = `rutas_${filename}`;
            break;
        case 'incidencias':
            csvContent = exportarIncidenciasCSV();
            filename = `incidencias_${filename}`;
            break;
        default:
            csvContent = exportarDashboardCSV();
            filename = `dashboard_${filename}`;
    }
    
    if (csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }
}

function exportarSeguimientoCSV() {
    const headers = ['ID', 'Fecha', 'Cliente', 'Dirección', 'Ruta', 'Chofer', 'Estado', 'Peso', 'Tiempo', 'Incidencia'];
    
    // Obtener datos de la tabla actual
    const tbody = document.getElementById('cuerpoTablaSeguimiento');
    if (!tbody) return '';
    
    const filas = Array.from(tbody.querySelectorAll('tr')).map(fila => {
        const celdas = Array.from(fila.querySelectorAll('td')).map(celda => {
            // Limpiar el contenido de las celdas
            let texto = celda.textContent.trim();
            // Escapar comillas para CSV
            if (texto.includes('"')) {
                texto = texto.replace(/"/g, '""');
            }
            // Envolver en comillas si contiene comas
            if (texto.includes(',')) {
                texto = `"${texto}"`;
            }
            return texto;
        });
        return celdas.join(',');
    });
    
    return [headers.join(','), ...filas].join('\n');
}

function exportarRutasCSV() {
    const headers = ['Ranking', 'Chofer', 'Total Pedidos', 'Entregados', 'Tasa Éxito (%)', 'Tiempo Promedio', 'Peso Total', 'Eficiencia'];
    
    const tbody = document.getElementById('cuerpoTablaChoferes');
    if (!tbody) return '';
    
    const filas = Array.from(tbody.querySelectorAll('tr')).map(fila => {
        const celdas = Array.from(fila.querySelectorAll('td')).map(celda => {
            let texto = celda.textContent.trim();
            if (texto.includes('"')) {
                texto = texto.replace(/"/g, '""');
            }
            if (texto.includes(',')) {
                texto = `"${texto}"`;
            }
            return texto;
        });
        return celdas.join(',');
    });
    
    return [headers.join(','), ...filas].join('\n');
}

function exportarIncidenciasCSV() {
    if (!datosGlobales || !datosGlobales.tiposIncidencia) return '';
    
    const headers = ['Tipo de Incidencia', 'Cantidad'];
    const filas = Object.entries(datosGlobales.tiposIncidencia).map(([tipo, cantidad]) => {
        return `"${tipo}",${cantidad}`;
    });
    
    return [headers.join(','), ...filas].join('\n');
}

function exportarDashboardCSV() {
    const headers = ['Métrica', 'Valor'];
    const metricas = [
        ['Total Paquetes', datosGlobales?.totalPaquetes || 0],
        ['Paquetes Entregados', datosGlobales?.paquetesEntregados || 0],
        ['Paquetes Pendientes', datosGlobales?.paquetesPendientes || 0],
        ['Tasa de Éxito (%)', datosGlobales?.tasaExito || 0],
        ['Tiempo Promedio (min)', datosGlobales?.tiempoPromedio || 0],
        ['Eficiencia Promedio (%)', datosGlobales?.eficienciaPromedio || 0]
    ];
    
    const filas = metricas.map(([metrica, valor]) => `"${metrica}",${valor}`);
    
    return [headers.join(','), ...filas].join('\n');
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function actualizarElemento(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.textContent = valor;
    }
}

function formatearTiempo(minutos) {
    if (!minutos || minutos === 0) return '0 min';
    
    if (minutos < 60) {
        return `${Math.round(minutos)} min`;
    } else {
        const horas = Math.floor(minutos / 60);
        const mins = Math.round(minutos % 60);
        return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
    }
}

function formatearEstado(estado) {
    const estados = {
        'delivered': 'Entregado',
        'in_transit': 'En Tránsito',
        'pending': 'Pendiente',
        'incident': 'Con Incidencia',
        'entregado': 'Entregado',
        'en_transito': 'En Tránsito',
        'pendiente': 'Pendiente',
        'incidencia': 'Con Incidencia'
    };
    return estados[estado] || estado;
}

function mostrarCargando() {
    console.log('⏳ Cargando datos...');
    
    // Crear spinner de carga si no existe
    let spinner = document.getElementById('loading-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loading-spinner';
        spinner.className = 'loading-spinner';
        spinner.innerHTML = '<div class="spinner"></div><p>Cargando datos...</p>';
        spinner.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 9999;
            text-align: center;
        `;
        document.body.appendChild(spinner);
    }
    
    spinner.style.display = 'block';
}

function ocultarCargando() {
    console.log('✅ Datos cargados');
    
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

function mostrarError(mensaje) {
    console.error('❌ Error:', mensaje);
    
    // Crear elemento de error
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error alert';
    errorDiv.innerHTML = `
        <strong>Error:</strong> ${mensaje}
        <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: inherit; cursor: pointer; font-size: 18px;">&times;</button>
    `;
    
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        z-index: 10000;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 15px;
        border-radius: 10px;
        margin: 20px 0;
    `;
    
    // Insertar en el body
    document.body.appendChild(errorDiv);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

function mostrarExito(mensaje) {
    const exitoDiv = document.createElement('div');
    exitoDiv.className = 'success alert';
    exitoDiv.innerHTML = `
        <strong>Éxito:</strong> ${mensaje}
        <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: inherit; cursor: pointer; font-size: 18px;">&times;</button>
    `;
    
    exitoDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        z-index: 10000;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #22c55e;
        padding: 15px;
        border-radius: 10px;
        margin: 20px 0;
    `;
    
    document.body.appendChild(exitoDiv);
    
    setTimeout(() => {
        if (exitoDiv.parentElement) {
            exitoDiv.remove();
        }
    }, 3000);
}

// ============================================
// FUNCIONES DE UTILIDAD ADICIONALES
// ============================================

// Función para refrescar datos automáticamente
function iniciarAutoRefresh() {
    // Refrescar cada 5 minutos
    setInterval(() => {
        console.log('🔄 Auto-refrescando datos...');
        cargarDatos();
    }, 5 * 60 * 1000);
}

// Función para verificar conexión
async function verificarConexion() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/reports/health', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Función para limpiar gráficos al salir
function limpiarGraficos() {
    Object.values(chartsInstances).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    chartsInstances = {};
}

// Event listener para limpiar al salir de la página
window.addEventListener('beforeunload', () => {
    limpiarGraficos();
});

// Función para redimensionar gráficos cuando cambia el tamaño de ventana
window.addEventListener('resize', () => {
    Object.values(chartsInstances).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
            chart.resize();
        }
    });
});

// Iniciar auto-refresh cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        iniciarAutoRefresh();
    }, 10000); // Esperar 10 segundos antes de iniciar auto-refresh
});

console.log('📊 Sistema de Reportes LogiTrack cargado completamente');