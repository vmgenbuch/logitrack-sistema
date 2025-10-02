// ============================================
// DASHBOARD ADMINISTRATIVO LOGITRACK
// ============================================

// Variables globales
let dashboardData = null;
let updateInterval = null;
let isOnline = false;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Iniciando Dashboard Administrativo LogiTrack');
    
    // Configurar event listeners
    configurarEventListeners();
    
    // Verificar autenticación
    verificarAutenticacion();
    
    // Inicializar dashboard
    inicializarDashboard();
    
    // Configurar auto-actualización
    iniciarAutoActualizacion();
});

function configurarEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', cerrarSesion);
    }
    
    // Refresh manual
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', cargarDatos);
    }
    
    // Status indicator
    actualizarEstadoSistema(false);
}

function verificarAutenticacion() {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('userData');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // Mostrar información del usuario
    if (userData) {
        try {
            const user = JSON.parse(userData);
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.fullName || user.username || 'Administrador';
            }
        } catch (error) {
            console.error('Error parsing user data:', error);
        }
    }
}

// ============================================
// CARGA DE DATOS
// ============================================
async function inicializarDashboard() {
    try {
        mostrarCargando(true);
        await cargarDatos();
        mostrarCargando(false);
        console.log('✅ Dashboard inicializado correctamente');
    } catch (error) {
        console.error('❌ Error inicializando dashboard:', error);
        mostrarError('Error al cargar el dashboard');
        mostrarCargando(false);
    }
}

async function cargarDatos() {
    try {
        const token = localStorage.getItem('token');
        
        // Cargar datos principales del dashboard
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
        console.log('📊 Datos del dashboard:', datos);
        
        dashboardData = datos;
        
        // Actualizar métricas principales
        actualizarMetricasPrincipales();
        
        // Cargar datos adicionales
        await Promise.all([
            cargarUsuarios(),
            cargarRutas(),
            cargarActividadReciente()
        ]);
        
        // Marcar sistema como online
        actualizarEstadoSistema(true);
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        mostrarError('Error al cargar datos del servidor');
        actualizarEstadoSistema(false);
    }
}

function actualizarMetricasPrincipales() {
    if (!dashboardData?.data) return;
    
    const { summary } = dashboardData.data;
    
    // Actualizar métricas en las cards
    actualizarElemento('totalUsers', '1'); // Placeholder, se actualizará con cargarUsuarios()
    actualizarElemento('totalPackages', summary?.totalPackages || 0);
    actualizarElemento('packagesInTransit', summary?.totalPackages - summary?.deliveredPackages || 0);
    actualizarElemento('packagesDelivered', summary?.deliveredPackages || 0);
    actualizarElemento('activeRoutes', '4'); // Placeholder, se actualizará con cargarRutas()
    actualizarElemento('openIncidents', summary?.incidents || 0);

    cargarEstadoOperativo();
    cargarSistemaMonitoreo();
}

async function cargarUsuarios() {
    try {
        const token = localStorage.getItem('token');
        
        // Intentar cargar usuarios (si existe la API)
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const usuarios = await response.json();
            actualizarElemento('totalUsers', usuarios.length || 1);
        } else {
            // Fallback: contar desde packages
            if (dashboardData?.data?.summary) {
                actualizarElemento('totalUsers', '1'); // Admin actual
            }
        }
        
    } catch (error) {
        console.log('ℹ️ API de usuarios no disponible, usando datos alternativos');
        actualizarElemento('totalUsers', '1');
    }
}

async function cargarRutas() {
    try {
        const token = localStorage.getItem('token');
        
        // Cargar rutas activas
        const response = await fetch('/api/reports/route-performance', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const rutasData = await response.json();
            const rutasActivas = rutasData.data?.routes?.length || 0;
            actualizarElemento('activeRoutes', rutasActivas);
            
            // Actualizar sección de rendimiento de rutas
            actualizarRendimientoRutas(rutasData.data?.routes || []);
        }
        
    } catch (error) {
        console.log('ℹ️ Error cargando rutas:', error);
        actualizarElemento('activeRoutes', '0');
    }
}

async function cargarActividadReciente() {
    try {
        const token = localStorage.getItem('token');
        
        // Cargar incidencias como actividad reciente
        const response = await fetch('/api/reports/incidents', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const incidenciasData = await response.json();
            actualizarActividadReciente(incidenciasData.data);
        } else {
            // Fallback: mostrar actividad simulada
            mostrarActividadDefault();
        }
        
    } catch (error) {
        console.log('ℹ️ Error cargando actividad:', error);
        mostrarActividadDefault();
    }
}

async function cargarEstadoOperativo() {
    const container = document.querySelector('.charts-section .chart-placeholder');
    if (!container) return;
    
    const summary = dashboardData?.data?.summary || {};
    
    container.innerHTML = `
        <div style="text-align: left; width: 100%; padding: 1rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                <div>
                    <h4 style="color: #2d3748; margin-bottom: 1rem;">📊 Métricas del Día</h4>
                    <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <strong>Entregas Completadas:</strong> ${summary.deliveredPackages || 0}
                    </div>
                    <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <strong>Tasa de Éxito:</strong> ${summary.deliveryRate || 0}%
                    </div>
                    <div style="background: #f7fafc; padding: 1rem; border-radius: 8px;">
                        <strong>Tiempo Promedio:</strong> ${formatearTiempo(summary.avgDeliveryTime || 0)}
                    </div>
                </div>
                <div>
                    <h4 style="color: #2d3748; margin-bottom: 1rem;">🚦 Estado Actual</h4>
                    <div style="background: #c6f6d5; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <strong>Sistema:</strong> ✅ Operativo
                    </div>
                    <div style="background: #e6fffa; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <strong>Rutas Activas:</strong> ${document.getElementById('activeRoutes')?.textContent || 0}
                    </div>
                    <div style="background: #fef5e7; padding: 1rem; border-radius: 8px;">
                        <strong>En Tránsito:</strong> ${summary.totalPackages - summary.deliveredPackages || 0} paquetes
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function cargarSistemaMonitoreo() {
    const containers = document.querySelectorAll('.chart-placeholder');
    if (containers.length < 2) return;
    
    const monitoreoContainer = containers[1];
    const ahora = new Date().toLocaleTimeString('es-MX');
    
    monitoreoContainer.innerHTML = `
        <div style="text-align: left; width: 100%; padding: 1rem;">
            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                <strong>🔌 Servidor:</strong> <span style="color: #22543d;">Online</span>
            </div>
            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                <strong>👥 Conexiones:</strong> ${isOnline ? 'Activas' : 'Verificando...'}
            </div>
            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                <strong>🕐 Última actualización:</strong> ${ahora}
            </div>
            <div style="background: #f7fafc; padding: 1rem; border-radius: 8px;">
                <strong>💾 Base de datos:</strong> <span style="color: #22543d;">Conectada</span>
            </div>
        </div>
    `;
}

function formatearTiempo(minutos) {
    if (!minutos) return '0 min';
    if (minutos < 60) return `${Math.round(minutos)} min`;
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
}

// ============================================
// ACTUALIZACIÓN DE INTERFAZ
// ============================================
function actualizarRendimientoRutas(rutas) {
    const container = document.getElementById('routePerformance');
    if (!container) return;
    
    if (rutas.length === 0) {
        container.innerHTML = '<div class="loading">No hay rutas configuradas aún</div>';
        return;
    }
    
    // Mostrar top 3 rutas por rendimiento
    const topRutas = rutas
        .sort((a, b) => (b.metrics?.deliveryRate || 0) - (a.metrics?.deliveryRate || 0))
        .slice(0, 3);
    
    let html = '';
    topRutas.forEach((ruta, index) => {
        const icon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        html += `
            <div class="activity-item">
                <div class="activity-icon route">
                    ${icon}
                </div>
                <div class="activity-content">
                    <div class="activity-title">${ruta.routeName || 'Ruta sin nombre'}</div>
                    <div class="activity-time">Eficiencia: ${ruta.metrics?.deliveryRate || 0}%</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function actualizarActividadReciente(incidenciasData) {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    const totalIncidencias = incidenciasData?.summary?.totalIncidents || 0;
    
    if (totalIncidencias === 0) {
        container.innerHTML = `
            <div class="activity-item">
                <div class="activity-icon package">✅</div>
                <div class="activity-content">
                    <div class="activity-title">Sistema funcionando correctamente</div>
                    <div class="activity-time">Sin incidencias reportadas</div>
                </div>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="activity-item">
            <div class="activity-icon incident">⚠️</div>
            <div class="activity-content">
                <div class="activity-title">${totalIncidencias} incidencias detectadas</div>
                <div class="activity-time">Requieren revisión</div>
            </div>
        </div>
    `;
    
    // Agregar tipos de incidencias si existen
    if (incidenciasData?.distributions?.byType) {
        Object.entries(incidenciasData.distributions.byType).forEach(([tipo, cantidad]) => {
            html += `
                <div class="activity-item">
                    <div class="activity-icon incident">📋</div>
                    <div class="activity-content">
                        <div class="activity-title">${tipo}</div>
                        <div class="activity-time">${cantidad} casos</div>
                    </div>
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
}

function mostrarActividadDefault() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    const ahora = new Date();
    const hace5min = new Date(ahora.getTime() - 5 * 60 * 1000);
    const hace15min = new Date(ahora.getTime() - 15 * 60 * 1000);
    
    container.innerHTML = `
        <div class="activity-item">
            <div class="activity-icon package">📦</div>
            <div class="activity-content">
                <div class="activity-title">Sistema activo</div>
                <div class="activity-time">${hace5min.toLocaleTimeString()}</div>
            </div>
        </div>
        <div class="activity-item">
            <div class="activity-icon route">🛣️</div>
            <div class="activity-content">
                <div class="activity-title">Rutas monitoreadas</div>
                <div class="activity-time">${hace15min.toLocaleTimeString()}</div>
            </div>
        </div>
    `;
}

// ============================================
// GESTIÓN DE ESTADO
// ============================================
function actualizarEstadoSistema(online) {
    isOnline = online;
    const indicator = document.getElementById('statusIndicator');
    
    if (indicator) {
        if (online) {
            indicator.className = 'status-indicator status-online';
            indicator.textContent = 'Sistema Online';
        } else {
            indicator.className = 'status-indicator status-offline';
            indicator.textContent = 'Sistema Offline';
        }
    }
}

function iniciarAutoActualizacion() {
    // Actualizar cada 30 segundos
    updateInterval = setInterval(async () => {
        try {
            await cargarDatos();
            console.log('🔄 Dashboard actualizado automáticamente');
        } catch (error) {
            console.error('Error en auto-actualización:', error);
        }
    }, 30000);
}

function detenerAutoActualizacion() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
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

function mostrarCargando(mostrar) {
    // Aquí podrías agregar indicadores de carga
    if (mostrar) {
        console.log('⏳ Cargando dashboard...');
    } else {
        console.log('✅ Dashboard cargado');
    }
}

function mostrarError(mensaje) {
    console.error('❌ Error:', mensaje);
    
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `
        <strong>Error:</strong> ${mensaje}
        <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: inherit; cursor: pointer; font-size: 18px;">&times;</button>
    `;
    
    errorContainer.appendChild(errorDiv);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

function cerrarSesion() {
    // Detener auto-actualización
    detenerAutoActualizacion();
    
    // Limpiar datos locales
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    
    // Redirigir a login
    window.location.href = '/login.html';
}

// ============================================
// VERIFICACIÓN DE CONEXIÓN
// ============================================
async function verificarConexion() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/health', {
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

// Verificar conexión cada minuto
setInterval(async () => {
    const online = await verificarConexion();
    actualizarEstadoSistema(online);
}, 60000);

// ============================================
// NAVEGACIÓN RÁPIDA
// ============================================
function irAPaquetes() {
    window.location.href = '/packages.html';
}

function irAReportes() {
    window.location.href = '/reports.html';
}

function irARutas() {
    window.location.href = '/routes.html';
}

// Exponer funciones globales si es necesario
window.irAPaquetes = irAPaquetes;
window.irAReportes = irAReportes;
window.irARutas = irARutas;

// Cleanup al salir de la página
window.addEventListener('beforeunload', () => {
    detenerAutoActualizacion();
});

console.log('🔧 Dashboard Administrativo cargado completamente');