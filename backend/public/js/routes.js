const API_BASE = '/api';

// ============================================
// GESTIÓN DE RUTAS LOGITRACK
// ============================================

// Variables globales
let rutasData = [];
let editingRouteId = null;


// ============================================
// HELPERS DE AUTENTICACIÓN
// ============================================

// Obtiene el token almacenado en localStorage
function getAuthToken() {
  return localStorage.getItem('token') || '';
}

// Crea los headers con el token incluido
function getAuthHeaders(extra = {}) {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}`, ...extra } : { ...extra };
}

/*function getAuthHeaders(extra = {}) {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}*/

// Wrapper de fetch con manejo de 401 centralizado
async function apiFetch(path, options = {}) {
  const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '';
  const headers = getAuthHeaders(options.headers || {});

  const resp = await fetch(`${base}${path}`, { ...options, headers });

  if (resp.status === 401) {
    // sesión inválida / expirada → forzar relogueo
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('userData');
    } finally {
      alert('Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.');
      window.location.href = 'login.html';
    }
    // corta la ejecución de quien llamó
    throw new Error('Unauthorized');
  }

  return resp;
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🛣️ Iniciando Gestión de Rutas LogiTrack');
    
    // Configurar event listeners
    configurarEventListeners();
    
    // Verificar autenticación
    verificarAutenticacion();
    
    // Cargar datos iniciales
    cargarRutas();
});



function configurarEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', cerrarSesion);
    }
    
    // Nueva ruta
    const newRouteBtn = document.getElementById('newRouteBtn');
    if (newRouteBtn) {
        newRouteBtn.addEventListener('click', () => {
            editingRouteId = null;
            mostrarModal('Nueva Ruta');
            limpiarFormulario();
        });
    }
    
    // Event delegation para botones de acciones
    const routesContainer = document.getElementById('routesContainer');
    if (routesContainer) {
        routesContainer.addEventListener('click', handleRouteAction);
    }
    
    // Modal
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    
    if (closeModal) closeModal.addEventListener('click', cerrarModal);
    if (cancelBtn) cancelBtn.addEventListener('click', cerrarModal);
    
    // Formulario
    const routeForm = document.getElementById('routeForm');
    if (routeForm) {
        routeForm.addEventListener('submit', manejarSubmitFormulario);
    }
    
    // Cerrar modal al hacer clic fuera
    const modal = document.getElementById('routeModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                cerrarModal();
            }
        });
    }
}

function handleRouteAction(e) {
    if (e.target.classList.contains('btn')) {
        const routeId = e.target.dataset.routeId;
        const action = e.target.dataset.action;
        
        switch (action) {
            case 'edit':
                editarRuta(routeId);
                break;
            case 'delete':
                eliminarRuta(routeId);
                break;
        }
    }
}

function verificarAutenticacion() {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('userData');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    let user = {};
    if (userData) {
        try {
            user = JSON.parse(userData);
        } catch (error) {
            console.error('Error parsing user data:', error);
        }
    }

    if (!['admin', 'logistics'].includes(user.role)) {
        alert('No tienes permisos para acceder a esta sección.');
        window.location.href = 'dashboard-admin.html';
        return;
    }
    
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.textContent = user.fullName || user.username || 'Usuario';
    }
    
    generateRoleBasedMenu(); 
}

function generateRoleBasedMenu() {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    const navigationMenu = document.querySelector('.nav-links');
    
    if (!navigationMenu) return;
    
    let menuItems = [];
    
    switch(user.role) {
        case 'admin':
            menuItems = [
                { href: 'dashboard-admin.html', text: 'Dashboard' },
                { href: 'packages.html', text: 'Paquetes' },
                { href: 'routes.html', text: 'Rutas', active: true },
                { href: 'branches.html', text: 'Sucursales' },
                { href: 'users.html', text: 'Usuarios' },
                { href: 'reports.html', text: 'Reportes' }
            ];
            break;
            
        case 'logistics':
            menuItems = [
                { href: 'packages.html', text: 'Paquetes' }
            ];
            break;
            
        default:
            menuItems = [
                { href: 'packages.html', text: 'Paquetes' }
            ];
    }
    
    navigationMenu.innerHTML = menuItems.map(item => 
        `<a href="${item.href}" class="nav-link ${item.active ? 'active' : ''}">${item.text}</a>`
    ).join('');
}

// ============================================
// CARGA DE DATOS - CONECTADO A APIS REALES
// ============================================
// Carga de rutas desde el API (usa apiFetch y token)
// Carga de rutas desde el API (con token y manejo de 401)
async function cargarRutas() {
  try {
    console.log('🔄 Cargando rutas desde el API...');
    const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '';

    const resp = await fetch(`${base}/routes-management`, {
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });

    if (resp.status === 401) {
      alert('Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.');
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
      } finally {
        window.location.href = 'login.html';
      }
      return;
    }
    if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);

    const data = await resp.json();
    if (!data || data.success === false) {
      throw new Error(data?.message || 'Respuesta inválida del servidor');
    }

    // 👇 Normaliza al shape que usa tu UI (routeId, routeName, etc.)
    const payload = data.data || {};
    const raw = Array.isArray(payload.routes || payload) ? (payload.routes || payload) : [];
    rutasData = transformarDatosRutas(raw); // <- usa tu función existente

    console.log(`✅ Rutas cargadas: ${rutasData.length}`);

    // 👇 Usa tus funciones reales
    actualizarEstadisticas();
    mostrarRutas();
    mostrarExito('Gestión de Rutas cargada completamente');

  } catch (err) {
    console.error('❌ Error cargando rutas:', err);
    mostrarError(`Error al cargar rutas: ${err.message || err}`);
    rutasData = [];
    actualizarEstadisticas();
    mostrarRutas();
  }
}




/*async function cargarRutas() {
    try {
        mostrarCargando(true);
        const token = localStorage.getItem('token');
        
        // 🎯 USAR LA API REAL DE RUTAS (endpoint público)
        const response = await fetch('/api/routes-management', {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            
            // Transformar datos del formato backend al formato frontend
            rutasData = transformarDatosRutas(data.data || []);
            
            console.log('✅ Rutas cargadas desde API real:', rutasData.length);
        } else {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        actualizarEstadisticas();
        mostrarRutas();
        mostrarCargando(false);
        
    } catch (error) {
        console.error('❌ Error cargando rutas:', error);
        mostrarError('Error al cargar rutas: ' + error.message);
        mostrarCargando(false);
        
        // Si falla la API, mostrar mensaje de error pero no datos falsos
        rutasData = [];
        actualizarEstadisticas();
        mostrarRutas();
    }
}*/

// 🔄 TRANSFORMAR DATOS DEL BACKEND AL FRONTEND
function transformarDatosRutas(rutasBackend) {
    return rutasBackend.map(ruta => ({
        routeId: ruta.id,
        routeName: ruta.nombre,
        routeCode: generarCodigoRuta(ruta.nombre),
        coverageArea: Array.isArray(ruta.zonaCobertura) 
            ? ruta.zonaCobertura.join(', ') 
            : ruta.zonaCobertura || 'No especificada',
        maxCapacity: ruta.capacidadMaxima || 50,
        estimatedTime: calcularTiempoEstimado(ruta),
        priority: ruta.prioridad || 'normal',
        status: ruta.status,
        description: ruta.descripcion || '',
        vehicle: ruta.vehiculoAsignado || 'Sin asignar',
        metrics: {
            totalPackages: ruta.estadisticas?.totalPaquetes || 0,
            deliveredPackages: ruta.estadisticas?.paquetesEntregados || 0,
            deliveryRate: ruta.estadisticas?.tasaEntrega || 0,
            avgDeliveryTime: ruta.estadisticas?.tiempoPromedioEntrega || 0
        }
    }));
}

function generarCodigoRuta(nombre) {
    if (!nombre) return 'RTA-00';
    
    const palabras = nombre.split(' ');
    let codigo = '';
    
    palabras.forEach(palabra => {
        if (codigo.length < 3) {
            codigo += palabra.substring(0, 1).toUpperCase();
        }
    });
    
    return codigo.padEnd(3, 'X') + '-01';
}

function calcularTiempoEstimado(ruta) {
    // Lógica básica para estimar tiempo basado en capacidad y zona
    const baseTime = 3;
    const capacityFactor = (ruta.capacidadMaxima || 50) / 50;
    return Math.round((baseTime * capacityFactor) * 10) / 10;
}

// ============================================
// ACTUALIZACIÓN DE INTERFAZ
// ============================================
function actualizarEstadisticas() {
    const totalRutas = rutasData.length;
    const rutasActivas = rutasData.filter(r => r.status === 'active').length;
    const rutasConPaquetes = rutasData.filter(r => (r.metrics?.totalPackages || 0) > 0).length;
    
    // Calcular eficiencia promedio
    const rutasConMetricas = rutasData.filter(r => r.metrics?.deliveryRate && r.metrics.deliveryRate > 0);
    const eficienciaPromedio = rutasConMetricas.length > 0 
        ? Math.round(rutasConMetricas.reduce((sum, r) => sum + r.metrics.deliveryRate, 0) / rutasConMetricas.length)
        : 0;
    
    actualizarElemento('totalRoutes', totalRutas);
    actualizarElemento('activeRoutes', rutasActivas);
    actualizarElemento('routesWithPackages', rutasConPaquetes);
    actualizarElemento('avgEfficiency', `${eficienciaPromedio}%`);
}

function mostrarRutas() {
    const container = document.getElementById('routesContainer');
    if (!container) return;
    
    if (rutasData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🛣️</div>
                <h3>No hay rutas configuradas</h3>
                <p>Comienza creando tu primera ruta</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <table class="routes-table">
            <thead>
                <tr>
                    <th>Ruta</th>
                    <th>Código</th>
                    <th>Zona de Cobertura</th>
                    <th>Capacidad</th>
                    <th>Paquetes</th>
                    <th>Eficiencia</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    rutasData.forEach(ruta => {
        const paquetesActuales = ruta.metrics?.totalPackages || 0;
        const capacidadUsada = ruta.maxCapacity > 0 ? Math.round((paquetesActuales / ruta.maxCapacity) * 100) : 0;
        const eficiencia = Math.round(ruta.metrics?.deliveryRate || 0);
        
        html += `
            <tr>
                <td>
                    <strong>${ruta.routeName}</strong>
                    <br><small style="color: #718096;">${ruta.description || 'Sin descripción'}</small>
                </td>
                <td>${ruta.routeCode || '-'}</td>
                <td>
                    ${ruta.coverageArea}
                    <br><small style="color: #718096;">Vehículo: ${ruta.vehicle}</small>
                </td>
                <td>
                    ${paquetesActuales}/${ruta.maxCapacity}
                    <br><small style="color: #718096;">${capacidadUsada}% usado</small>
                </td>
                <td>
                    <strong>${paquetesActuales}</strong>
                    <br><small style="color: #718096;">${ruta.metrics?.deliveredPackages || 0} entregados</small>
                </td>
                <td>
                    <strong>${eficiencia}%</strong>
                    <br><small style="color: #718096;">${formatearTiempo(ruta.metrics?.avgDeliveryTime || 0)}</small>
                </td>
                <td>
                    <span class="status-badge ${ruta.status === 'active' ? 'status-active' : 'status-inactive'}">
                        ${ruta.status === 'active' ? 'Activa' : 'Inactiva'}
                    </span>
                </td>
                <td>
                    <div class="actions">
                        <button class="btn btn-sm" data-route-id="${ruta.routeId}" data-action="edit">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-sm btn-danger" data-route-id="${ruta.routeId}" data-action="delete">
                            🗑️ Eliminar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// ============================================
// GESTIÓN DE FORMULARIOS - CON BACKEND REAL
// ============================================
function mostrarModal(titulo) {
    const modal = document.getElementById('routeModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (modalTitle) modalTitle.textContent = titulo;
    if (modal) modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('routeModal');
    if (modal) modal.classList.remove('active');
    limpiarFormulario();
    editingRouteId = null;
}

function limpiarFormulario() {
    const form = document.getElementById('routeForm');
    if (form) form.reset();
    
    // Valores por defecto
    document.getElementById('maxCapacity').value = '50';
    document.getElementById('estimatedTime').value = '4';
    document.getElementById('priority').value = 'normal';
    document.getElementById('status').value = 'active';
}

function editarRuta(routeId) {
    const ruta = rutasData.find(r => r.routeId === routeId);
    if (!ruta) return;
    
    editingRouteId = routeId;
    mostrarModal('Editar Ruta');
    
    // Llenar formulario con datos existentes
    document.getElementById('routeName').value = ruta.routeName || '';
    document.getElementById('routeCode').value = ruta.routeCode || '';
    document.getElementById('coverageArea').value = ruta.coverageArea || '';
    document.getElementById('maxCapacity').value = ruta.maxCapacity || 50;
    document.getElementById('estimatedTime').value = ruta.estimatedTime || 4;
    document.getElementById('priority').value = ruta.priority || 'normal';
    document.getElementById('status').value = ruta.status || 'active';
    document.getElementById('description').value = ruta.description || '';
}

async function manejarSubmitFormulario(e) {
  e.preventDefault();

  const formData = new FormData(e.target);

  // 🔄 TRANSFORMAR DATOS AL FORMATO BACKEND
  const rutaData = {
    nombre: formData.get('routeName'),
    descripcion: formData.get('description'),
    zonaCobertura: (formData.get('coverageArea') || '')
                      .split(',')
                      .map(z => z.trim())
                      .filter(Boolean),
    capacidadMaxima: parseInt(formData.get('maxCapacity')) || 50,
    status: formData.get('status'),
    prioridad: formData.get('priority')
  };

  try {
    const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '';

    if (editingRouteId) {
      // 📝 ACTUALIZAR
      const resp = await fetch(`${base}/routes-management/${editingRouteId}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(rutaData)
      });
      if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'No se pudo actualizar la ruta');

      mostrarExito('Ruta actualizada exitosamente');
    } else {
      // ➕ CREAR
      const resp = await fetch(`${base}/routes-management`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(rutaData)
      });
      if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'No se pudo crear la ruta');

      mostrarExito('Nueva ruta creada exitosamente');
    }

    cerrarModal();
    await cargarRutas();

  } catch (error) {
    console.error('Error guardando ruta:', error);
    mostrarError('Error al guardar la ruta: ' + error.message);
  }
}

/*async function manejarSubmitFormulario(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const token = localStorage.getItem('token');
    
    // 🔄 TRANSFORMAR DATOS AL FORMATO BACKEND
    const rutaData = {
        nombre: formData.get('routeName'),
        descripcion: formData.get('description'),
        zonaCobertura: formData.get('coverageArea').split(',').map(zona => zona.trim()),
        capacidadMaxima: parseInt(formData.get('maxCapacity')) || 50,
        status: formData.get('status'),
        prioridad: formData.get('priority')
    };
    
    try {
        let response;
        
        if (editingRouteId) {
            // 📝 ACTUALIZAR RUTA EXISTENTE - Sin API, solo frontend
            mostrarExito('Ruta actualizada (solo local - falta endpoint backend)');
            
            // Actualizar en la lista local
            const index = rutasData.findIndex(r => r.routeId === editingRouteId);
            if (index !== -1) {
                rutasData[index] = {
                    ...rutasData[index],
                    routeName: rutaData.nombre,
                    description: rutaData.descripcion,
                    coverageArea: rutaData.zonaCobertura.join(', '),
                    maxCapacity: rutaData.capacidadMaxima,
                    status: rutaData.status
                };
                
                actualizarEstadisticas();
                mostrarRutas();
                cerrarModal();
            }
            return;
        } else {
            // ➕ CREAR NUEVA RUTA - Sin API, solo frontend
            mostrarExito('Nueva ruta creada (solo local - falta endpoint backend)');
            
            const nuevaRuta = {
                routeId: `ruta${rutasData.length + 1}`,
                routeName: rutaData.nombre,
                routeCode: generarCodigoRuta(rutaData.nombre),
                coverageArea: rutaData.zonaCobertura.join(', '),
                maxCapacity: rutaData.capacidadMaxima,
                estimatedTime: calcularTiempoEstimado({ capacidadMaxima: rutaData.capacidadMaxima }),
                priority: rutaData.prioridad || 'normal',
                status: rutaData.status,
                description: rutaData.descripcion,
                vehicle: 'Sin asignar',
                metrics: {
                    totalPackages: 0,
                    deliveredPackages: 0,
                    deliveryRate: 0,
                    avgDeliveryTime: 0
                }
            };
            
            rutasData.push(nuevaRuta);
            actualizarEstadisticas();
            mostrarRutas();
            cerrarModal();
            return;
        }
        
    } catch (error) {
        console.error('Error guardando ruta:', error);
        mostrarError('Error al guardar la ruta: ' + error.message);
    }
}*/

/*async function eliminarRuta(routeId) {
    const ruta = rutasData.find(r => r.routeId === routeId);
    if (!ruta) return;
    
    if (confirm(`¿Estás seguro de que quieres eliminar la ruta "${ruta.routeName}"?`)) {
        const token = localStorage.getItem('token');
        
        try {
            const response = await fetch(`/api/admin/routes/${routeId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                mostrarExito('Ruta eliminada correctamente');
                await cargarRutas();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al eliminar la ruta');
            }
            
        } catch (error) {
            console.error('Error eliminando ruta:', error);
            mostrarError('Error al eliminar la ruta: ' + error.message);
        }
    }
}*/

async function eliminarRuta(routeId) {
  const ruta = rutasData.find(r => r.routeId === routeId);
  if (!ruta) return;

  if (!confirm(`¿Estás seguro de que quieres eliminar la ruta "${ruta.routeName}"?`)) return;

  try {
    const base = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : '';

    const resp = await fetch(`${base}/routes-management/${routeId}`, {
      method: 'DELETE',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });

    if (resp.status === 401) {
      alert('Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.');
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
      } finally {
        window.location.href = 'login.html';
      }
      return;
    }
    if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);

    const data = await resp.json();
    if (!data.success) throw new Error(data.message || 'Error al eliminar la ruta');

    mostrarExito('Ruta eliminada correctamente');
    await cargarRutas();

  } catch (error) {
    console.error('Error eliminando ruta:', error);
    mostrarError('Error al eliminar la ruta: ' + error.message);
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

function formatearTiempo(horas) {
    if (!horas || horas === 0) return '0h';
    
    if (horas < 1) {
        return `${Math.round(horas * 60)}min`;
    } else {
        const h = Math.floor(horas);
        const m = Math.round((horas - h) * 60);
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
}

function mostrarCargando(mostrar) {
    const container = document.getElementById('routesContainer');
    if (!container) return;
    
    if (mostrar) {
        container.innerHTML = '<div class="loading">Cargando rutas...</div>';
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
    
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

function mostrarExito(mensaje) {
    console.log('✅ Éxito:', mensaje);
    
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) return;
    
    const exitoDiv = document.createElement('div');
    exitoDiv.className = 'error';
    exitoDiv.style.background = '#c6f6d5';
    exitoDiv.style.color = '#22543d';
    exitoDiv.innerHTML = `
        <strong>Éxito:</strong> ${mensaje}
        <button onclick="this.parentElement.remove()" style="float: right; background: none; border: none; color: inherit; cursor: pointer; font-size: 18px;">&times;</button>
    `;
    
    errorContainer.appendChild(exitoDiv);
    
    setTimeout(() => {
        if (exitoDiv.parentElement) {
            exitoDiv.remove();
        }
    }, 3000);
}

function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    window.location.href = '/login.html';
}

console.log('🛣️ Gestión de Rutas cargada completamente');