const API_BASE = window.API_BASE_URL || '/api';
let packages = [];
let routes = [];
let branches = [];
let currentPackage = null;

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    configurarFechasPorDefecto();
    loadData();
    setupEventListeners();
});

function safeFormatDate(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            ...options
        });
    } catch (e) {
        return '-';
    }
}

function safeFormatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('es-MX');
    } catch (e) {
        return '-';
    }
}

// Configurar fechas por defecto (día actual)
function configurarFechasPorDefecto() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${año}-${mes}-${dia}`;
    
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    
    if (fechaDesde) fechaDesde.value = fechaHoy;
    if (fechaHasta) fechaHasta.value = fechaHoy;
}

// Verificar autenticación
function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    if (!['admin', 'logistics'].includes(user.role)) {
        alert('No tienes permisos para acceder a esta sección.');
        window.location.href = 'dashboard-admin.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
    generateRoleBasedMenu();
}

// Generar menú según rol
function generateRoleBasedMenu() {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    const navigationMenu = document.querySelector('.nav-links');
    
    if (!navigationMenu) return;
    
    let menuItems = [];
    
    switch(user.role) {
        case 'admin':
            menuItems = [
                { href: 'dashboard-admin.html', text: 'Dashboard' },
                { href: 'packages.html', text: 'Paquetes', active: true },
                { href: 'routes.html', text: 'Rutas' },
                { href: 'branches.html', text: 'Sucursales' },
                { href: 'users.html', text: 'Usuarios' },
                { href: 'reports.html', text: 'Reportes' }
            ];
            break;
            
        case 'logistics':
            menuItems = [
                { href: 'packages.html', text: 'Paquetes', active: true }
            ];
            break;
            
        default:
            menuItems = [
                { href: 'packages.html', text: 'Paquetes', active: true }
            ];
    }
    
    navigationMenu.innerHTML = menuItems.map(item => 
        `<a href="${item.href}" class="nav-link ${item.active ? 'active' : ''}">${item.text}</a>`
    ).join('');
}

// Configurar event listeners
function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('newPackageBtn').addEventListener('click', openNewPackageModal);
    document.getElementById('refreshBtn').addEventListener('click', loadPackages);
    document.getElementById('printSelectedBtn').addEventListener('click', printSelectedPackages);
    
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('packageForm').addEventListener('submit', handlePackageSubmit);
    
    // Filtros
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('routeFilter').addEventListener('change', applyFilters);
    document.getElementById('fechaDesde')?.addEventListener('change', applyFilters);
    document.getElementById('fechaHasta')?.addEventListener('change', applyFilters);
    
    const sucursalSelect = document.getElementById('sucursalDestino');
    if (sucursalSelect) {
        sucursalSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const direccionInput = document.getElementById('direccion');
            const clienteInput = document.getElementById('cliente');
            
            if (selectedOption.value && direccionInput && clienteInput) {
                direccionInput.value = selectedOption.dataset.address || '';
                clienteInput.value = selectedOption.dataset.nombre || '';
            }
        });
    }
    
    document.getElementById('packageModal').addEventListener('click', (e) => {
        if (e.target.id === 'packageModal') {
            closeModal();
        }
    });
}

// Cargar datos iniciales
async function loadData() {
    await Promise.all([
        loadRoutes(),
        loadBranches(),
        loadPackages()
    ]);
}

// Cargar rutas
async function loadRoutes() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE}/routes-management`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            routes = data.data;
            populateRouteSelectors();
        }
    } catch (error) {
        console.error('Error cargando rutas:', error);
        showError('Error cargando rutas');
    }
}

async function loadBranches() {
    try {
        const response = await fetch(`${API_BASE}/public/branches`);
        
        if (response.ok) {
            const data = await response.json();
            branches = data.success ? data.data.branches : [];
        }
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        branches = [];
    }
}

// Poblar selectores de rutas
function populateRouteSelectors() {
    const routeFilter = document.getElementById('routeFilter');
    const routeForm = document.getElementById('ruta');
    
    routeFilter.innerHTML = '<option value="">Todas las rutas</option>';
    routeForm.innerHTML = '<option value="">Seleccionar ruta</option>';
    
    routes.forEach(route => {
        if (route.status === 'active') {
            const filterOption = document.createElement('option');
            filterOption.value = route.id;
            filterOption.textContent = route.nombre;
            routeFilter.appendChild(filterOption);
            
            const formOption = document.createElement('option');
            formOption.value = route.id;
            formOption.textContent = `${route.nombre} (${route.capacidadMaxima} paq.)`;
            routeForm.appendChild(formOption);
        }
    });
}

// Poblar selector de sucursales
function populateBranchSelector() {
    const selectSucursal = document.getElementById('sucursalDestino');
    
    if (!selectSucursal) return;
    
    selectSucursal.innerHTML = '<option value="">Seleccionar sucursal</option>';
    
    if (!Array.isArray(branches) || branches.length === 0) return;
    
    branches.forEach(sucursal => {
        const option = document.createElement('option');
        option.value = sucursal.id;
        option.textContent = `${sucursal.nombre} - ${sucursal.direccion.ciudad}`;
        const direccionCompleta = `${sucursal.direccion.calle}, ${sucursal.direccion.colonia}, ${sucursal.direccion.ciudad}, ${sucursal.direccion.estado} ${sucursal.direccion.codigoPostal}`;
        option.dataset.address = direccionCompleta;
        option.dataset.nombre = sucursal.nombre;
        selectSucursal.appendChild(option);
    });
}

// Cargar paquetes
async function loadPackages() {
  const token = localStorage.getItem('token');

  try {
    showLoading();

    // Lee filtros del UI
    const fechaDesde = document.getElementById('fechaDesde')?.value || '';
    const fechaHasta = document.getElementById('fechaHasta')?.value || '';
    const status     = document.getElementById('statusFilter')?.value || '';
    const ruta       = document.getElementById('routeFilter')?.value || '';

    // Construye querystring
    const params = new URLSearchParams();
    if (fechaDesde) params.set('fromDate', fechaDesde);   // yyyy-MM-dd
    if (fechaHasta) params.set('toDate',   fechaHasta);
    if (status)     params.set('status',   status);
    if (ruta)       params.set('ruta',     ruta);

    const url = `${API_BASE}/packages${params.toString() ? `?${params}` : ''}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!data.success) throw new Error(data.message || 'Error cargando paquetes');

    // Mapear snake_case → camelCase (como ya lo hacías)
    packages = (data.data.packages || []).map(pkg => ({
      id: pkg.id,
      trackingNumber: pkg.tracking_number,
      cliente: pkg.cliente,
      telefono: pkg.telefono,
      direccion: pkg.direccion,
      sucursalDestino: pkg.sucursal_destino,
      ruta: pkg.ruta,
      prioridad: pkg.prioridad,
      pesoEstimado: pkg.peso_estimado,
      pesoSalida: pkg.peso_salida,
      pesoEntrega: pkg.peso_entrega,
      descripcion: pkg.descripcion,
      status: pkg.status,
      fechaCreacion: pkg.fecha_creacion,
      tiempoSalidaReparto: pkg.tiempo_salida_reparto,
      tiempoEntrega: pkg.tiempo_entrega,
      incidencia: pkg.incidencia,
      nombreQuienRecibio: pkg.nombre_quien_recibio,
      cargoQuienRecibio: pkg.cargo_quien_recibio,
      fotoSalida: pkg.foto_salida,
      fotoEntrega: pkg.foto_entrega,
      firmaDigital: pkg.firma_digital,
      validacionReceptor: pkg.validacion_receptor
    }));

    updateStatistics();
    applyFilters();  // ahora filtrará básicamente por texto/estado/ruta
    clearError();
  } catch (error) {
    console.error('Error cargando paquetes:', error);
    showError(`Error cargando paquetes: ${error.message}`);
    displayPackages([]);
  }
}




/*async function loadPackages() {
    const token = localStorage.getItem('token');
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/packages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Mapear snake_case a camelCase
            packages = (data.data.packages || []).map(pkg => ({
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                cliente: pkg.cliente,
                telefono: pkg.telefono,
                direccion: pkg.direccion,
                sucursalDestino: pkg.sucursal_destino,
                ruta: pkg.ruta,
                prioridad: pkg.prioridad,
                pesoEstimado: pkg.peso_estimado,
                pesoSalida: pkg.peso_salida,
                pesoEntrega: pkg.peso_entrega,
                descripcion: pkg.descripcion,
                status: pkg.status,
                fechaCreacion: pkg.fecha_creacion,
                tiempoSalidaReparto: pkg.tiempo_salida_reparto,
                tiempoEntrega: pkg.tiempo_entrega,
                incidencia: pkg.incidencia,
                nombreQuienRecibio: pkg.nombre_quien_recibio,
                cargoQuienRecibio: pkg.cargo_quien_recibio,
                fotoSalida: pkg.foto_salida,
                fotoEntrega: pkg.foto_entrega,
                firmaDigital: pkg.firma_digital,
                validacionReceptor: pkg.validacion_receptor
            }));
            
            updateStatistics();
            applyFilters();
            clearError();
        } else {
            throw new Error(data.message || 'Error cargando paquetes');
        }
    } catch (error) {
        console.error('Error cargando paquetes:', error);
        showError(`Error cargando paquetes: ${error.message}`);
        displayPackages([]);
    }
}*/




// Actualizar estadísticas
function updateStatistics() {
    const total = packages.length;
    const pending = packages.filter(p => p.status === 'pending').length;
    const transit = packages.filter(p => p.status === 'in_transit').length;
    const delivered = packages.filter(p => p.status === 'delivered').length;
    
    document.getElementById('totalPackages').textContent = total;
    document.getElementById('pendingPackages').textContent = pending;
    document.getElementById('transitPackages').textContent = transit;
    document.getElementById('deliveredPackages').textContent = delivered;
}

// Aplicar filtros
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const routeFilter = document.getElementById('routeFilter').value;
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    
    let filteredPackages = packages.filter(pkg => {
        const matchesSearch = !searchTerm || 
            pkg.trackingNumber.toLowerCase().includes(searchTerm) ||
            pkg.cliente.toLowerCase().includes(searchTerm) ||
            pkg.direccion.toLowerCase().includes(searchTerm) ||
            pkg.id.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !statusFilter || pkg.status === statusFilter;
        const matchesRoute = !routeFilter || pkg.ruta === routeFilter;
        
        let matchesDate = true;
        
        if (fechaDesde || fechaHasta) {
           let pkgDate = '';
           if (pkg.fechaCreacion) {
              const d = new Date(pkg.fechaCreacion);
              const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
              pkgDate = local.toISOString().split('T')[0]; // yyyy-MM-dd local
            }
           if (fechaDesde && fechaHasta)      matchesDate = pkgDate >= fechaDesde && pkgDate <= fechaHasta;
           else if (fechaDesde)               matchesDate = pkgDate >= fechaDesde;
           else if (fechaHasta)               matchesDate = pkgDate <= fechaHasta;
        }

        /*if (fechaDesde || fechaHasta) {
            // Extraer solo la fecha sin conversión UTC
            const pkgDate = pkg.fechaCreacion ? pkg.fechaCreacion.split('T')[0] : '';
            
            if (fechaDesde && fechaHasta) {
                matchesDate = pkgDate >= fechaDesde && pkgDate <= fechaHasta;
            } else if (fechaDesde) {
                matchesDate = pkgDate >= fechaDesde;
            } else if (fechaHasta) {
                matchesDate = pkgDate <= fechaHasta;
            }
        }*/
        
        return matchesSearch && matchesStatus && matchesRoute && matchesDate;
    });
    
    displayPackages(filteredPackages);
}

// Mostrar paquetes
function displayPackages(packagesToShow) {
    const container = document.getElementById('packagesContainer');
    
    if (!packagesToShow || !Array.isArray(packagesToShow) || packagesToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No hay paquetes</h3>
                <p>No hay paquetes que coincidan con los filtros seleccionados</p>
            </div>
        `;
        return;
    }
    
    const tableHTML = `
        <table class="packages-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="selectAll"></th>
                    <th>Tracking</th>
                    <th>Cliente</th>
                    <th>Dirección</th>
                    <th>Ruta</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>Peso (kg)</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${packagesToShow.map(pkg => createPackageRow(pkg)).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
    setupTableEventListeners();
}

// Configurar event listeners de la tabla
function setupTableEventListeners() {
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', toggleSelectAll);
    }
    
    document.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.dataset.action;
            const id = this.dataset.id;
            
            switch(action) {
                case 'view':
                    viewPackage(id);
                    break;
                case 'edit':
                    editPackage(id);
                    break;
                case 'print':
                    const pkg = packages.find(p => p.id === id);
                    if (pkg && typeof generateMasterLabel === 'function') {
                        generateMasterLabel(pkg);
                    }
                    break;
                case 'print-zpl':
                    imprimirEtiquetaZebra(id);
                    break;
                case 'cancel':
                    cancelPackage(id);
                    break;
            }
        });
    });
}

// Crear fila de paquete
function createPackageRow(pkg) {
    const route = routes.find(r => r.id === pkg.ruta);
    const routeName = route ? route.nombre : 'Ruta no encontrada';
    
    const createdDate = safeFormatDate(pkg.fechaCreacion, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
    
    let pesoDisplay = '';
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        pesoDisplay = `${pkg.pesoEstimado || pkg.pesoSalida || 0} kg`;
    } else if (pkg.status === 'in_transit') {
        pesoDisplay = `${pkg.pesoSalida || 0} kg`;
    } else if (pkg.status === 'delivered') {
        pesoDisplay = `${pkg.pesoSalida || 0} → ${pkg.pesoEntrega || 0} kg`;
    } else {
        pesoDisplay = `${pkg.pesoEstimado || pkg.pesoSalida || 0} kg`;
    }
    
    return `
        <tr>
            <td><input type="checkbox" class="package-checkbox" value="${pkg.id}"></td>
            <td>
                <strong>${pkg.trackingNumber}</strong><br>
                <small style="color: #718096;">${pkg.id.slice(0, 8)}...</small>
            </td>
            <td>
                <strong>${pkg.cliente}</strong>
                ${pkg.telefono ? `<br><small>${pkg.telefono}</small>` : ''}
            </td>
            <td>
                <div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${pkg.direccion}">
                    ${pkg.direccion}
                </div>
            </td>
            <td>${routeName}</td>
            <td><span class="status-badge status-${pkg.status}">${getStatusText(pkg.status)}</span></td>
            <td><span class="priority-badge priority-${pkg.prioridad}">${getPriorityText(pkg.prioridad)}</span></td>
            <td>${pesoDisplay}</td>
            <td>${createdDate}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-sm" data-action="view" data-id="${pkg.id}" title="Ver detalles">👁️</button>
                    ${pkg.status === 'pending' ? `
                        <button class="btn btn-sm" data-action="edit" data-id="${pkg.id}" title="Editar">✏️</button>
                        <button class="btn btn-sm" data-action="print-zpl" data-id="${pkg.id}" title="Imprimir">🖨️</button>
                        <button class="btn btn-danger btn-sm" data-action="cancel" data-id="${pkg.id}" title="Cancelar">❌</button>
                    ` : `
                        <button class="btn btn-sm" data-action="print-zpl" data-id="${pkg.id}" title="Imprimir">🖨️</button>
                    `}
                </div>
            </td>
        </tr>
    `;
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado',
        'in_transit': 'En Tránsito',
        'delivered': 'Entregado',
        'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
}

function getPriorityText(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'alta': 'Alta',
        'urgente': 'Urgente'
    };
    return priorityMap[priority] || priority;
}



// Crear fila de paquete
function createPackageRow(pkg) {
    const route = routes.find(r => r.id === pkg.ruta);
    const routeName = route ? route.nombre : 'Ruta no encontrada';
    
    const createdDate = safeFormatDate(pkg.fechaCreacion, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
    
    // Determinar qué peso mostrar
    let pesoDisplay = '';
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        // Mostrar peso estimado
        pesoDisplay = `${pkg.pesoEstimado || pkg.pesoSalida || 0} kg`;
    } else if (pkg.status === 'in_transit' || pkg.status === 'in transit') {
        // Mostrar peso de salida (verificado por chofer)
        pesoDisplay = `${pkg.pesoSalida || 0} kg`;
    } else if (pkg.status === 'delivered') {
        // Mostrar salida → entrega
        pesoDisplay = `${pkg.pesoSalida || 0} → ${pkg.pesoEntrega || 0} kg`;
    } else {
        pesoDisplay = `${pkg.pesoEstimado || pkg.pesoSalida || 0} kg`;
    }
    
    return `
        <tr>
            <td>
                <input type="checkbox" class="package-checkbox" value="${pkg.id}">
            </td>
            <td>
                <strong>${pkg.trackingNumber}</strong>
                <br>
                <small style="color: #718096;">${pkg.id.slice(0, 8)}...</small>
            </td>
            <td>
                <strong>${pkg.cliente}</strong>
                ${pkg.telefono ? `<br><small>${pkg.telefono}</small>` : ''}
            </td>
            <td>
                <div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                     title="${pkg.direccion}">
                    ${pkg.direccion}
                </div>
            </td>
            <td>${routeName}</td>
            <td>
                <span class="status-badge status-${pkg.status}">
                    ${getStatusText(pkg.status)}
                </span>
            </td>
            <td>
                <span class="priority-badge priority-${pkg.prioridad}">
                    ${getPriorityText(pkg.prioridad)}
                </span>
            </td>
            <td>${pesoDisplay}</td>
            <td>${createdDate}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-sm" data-action="view" data-id="${pkg.id}" title="Ver detalles">
                        👁️
                    </button>
                    ${pkg.status === 'pending' ? `
                        <button class="btn btn-sm" data-action="edit" data-id="${pkg.id}" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn-sm" data-action="print" data-id="${pkg.id}" title="Imprimir Etiqueta">
                            🖨️
                        </button>
                        <button class="btn btn-danger btn-sm" data-action="cancel" data-id="${pkg.id}" title="Cancelar">
                            ❌
                        </button>
                    ` : `
                        <button class="btn btn-sm" data-action="print-zpl" data-id="${pkg.id}" title="Imprimir Etiqueta Zebra">
                            🖨️
                        </button>
                    `}
                </div>
            </td>
        </tr>
    `;
}

// Obtener texto del estado
function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado',
        'in_transit': 'En Tránsito',
        'delivered': 'Entregado',
        'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
}

// Obtener texto de prioridad
function getPriorityText(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'alta': 'Alta',
        'urgente': 'Urgente'
    };
    return priorityMap[priority] || priority;
}


// Abrir modal para nuevo paquete
async function openNewPackageModal() {
    currentPackage = null;
    document.getElementById('modalTitle').textContent = 'Nuevo Paquete';
    document.getElementById('packageForm').reset();
    
    // Poblar selector de sucursales
    populateBranchSelector();
    
    // Agregar event listener para el selector de sucursales después de poblarlo
    const sucursalSelect = document.getElementById('sucursalDestino');
    if (sucursalSelect) {
        sucursalSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const direccionInput = document.getElementById('direccion');
            const clienteInput = document.getElementById('cliente');
            
            if (selectedOption.value && direccionInput && clienteInput) {
                direccionInput.value = selectedOption.dataset.address || '';
                clienteInput.value = selectedOption.dataset.nombre || '';
            }
        });
    }
    
    document.getElementById('packageModal').classList.add('active');
}

// Abrir modal para editar paquete
async function editPackage(packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return;
    
    currentPackage = pkg;
    document.getElementById('modalTitle').textContent = 'Editar Paquete';
    
    // Poblar selector de sucursales
    populateBranchSelector();
    
    // Agregar event listener para el selector después de poblarlo
    const sucursalSelect = document.getElementById('sucursalDestino');
    if (sucursalSelect) {
        sucursalSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const direccionInput = document.getElementById('direccion');
            const clienteInput = document.getElementById('cliente');
            
            if (selectedOption.value && direccionInput && clienteInput) {
                direccionInput.value = selectedOption.dataset.address || '';
                clienteInput.value = selectedOption.dataset.nombre || '';
            }
        });
    }
    
    // Llenar formulario
    document.getElementById('cliente').value = pkg.cliente;
    document.getElementById('telefono').value = pkg.telefono || '';
    document.getElementById('direccion').value = pkg.direccion;
    
    // Seleccionar sucursal si existe
    if (pkg.sucursalDestino && sucursalSelect) {
        sucursalSelect.value = pkg.sucursalDestino;
    }
    
    document.getElementById('ruta').value = pkg.ruta;
    document.getElementById('prioridad').value = pkg.prioridad;
    document.getElementById('pesoEstimado').value = pkg.pesoEstimado || pkg.pesoSalida || '';
    //document.getElementById('pesoEstimado').value = pkg.pesoEstimado;
    document.getElementById('descripcion').value = pkg.descripcion || '';
    
    document.getElementById('packageModal').classList.add('active');
}

// Ver detalles del paquete
function viewPackage(packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return;
    
    const route = routes.find(r => r.id === pkg.ruta);
    const routeName = route ? route.nombre : 'Ruta no encontrada';
    
    // Buscar sucursal de destino
    const branch = branches.find(b => b.branchId === pkg.sucursalDestino);
    const branchName = branch ? `${branch.name} - ${branch.city}` : 'No especificada';
    
    const details = `
        📦 DETALLES DEL PAQUETE
        
        Tracking: ${pkg.trackingNumber}
        Cliente: ${pkg.cliente}
        Teléfono: ${pkg.telefono || 'No especificado'}
        Dirección: ${pkg.direccion}
        Sucursal Destino: ${branchName}
        Ruta: ${routeName}
        Estado: ${getStatusText(pkg.status)}
        Prioridad: ${getPriorityText(pkg.prioridad)}
        
        Peso Salida: ${pkg.pesoSalida} kg
        Peso Entrega: ${pkg.pesoEntrega || 'Pendiente'} kg
        
        Fecha Creación: ${safeFormatDateTime(pkg.fechaCreacion)}
        ${pkg.tiempoSalidaReparto ? `Salida a Reparto: ${safeFormatDateTime(pkg.tiempoSalidaReparto)}` : ''}
        ${pkg.tiempoEntrega ? `Tiempo Entrega: ${safeFormatDateTime(pkg.tiempoEntrega)}` : ''}
        
        Descripción: ${pkg.descripcion || 'No especificada'}
        Incidencia: ${pkg.incidencia}
        
        ${pkg.nombreQuienRecibio ? `Recibido por: ${pkg.nombreQuienRecibio}` : ''}
        ${pkg.cargoQuienRecibio ? `Cargo: ${pkg.cargoQuienRecibio}` : ''}
        
        Validación Receptor: ${pkg.validacionReceptor?.statusValidacion || 'Pendiente'}
    `;
    
    alert(details);
}

// Cancelar paquete
async function cancelPackage(packageId) {
    if (!confirm('¿Estás seguro de que deseas cancelar este paquete?')) {
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE}/packages/${packageId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Paquete cancelado exitosamente');
            loadPackages();
        } else {
            throw new Error(data.message || 'Error cancelando paquete');
        }
        
    } catch (error) {
        console.error('Error cancelando paquete:', error);
        showError(`Error cancelando paquete: ${error.message}`);
    }
}

// Cerrar modal
function closeModal() {
    document.getElementById('packageModal').classList.remove('active');
    currentPackage = null;
}

// Manejar envío del formulario
async function handlePackageSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const packageData = {
        cliente: formData.get('cliente'),
        telefono: formData.get('telefono'),
        direccion: formData.get('direccion'),
        sucursalDestino: formData.get('sucursalDestino'),
        ruta: formData.get('ruta'),
        prioridad: formData.get('prioridad'),
        pesoEstimado: parseFloat(formData.get('pesoEstimado')),
        descripcion: formData.get('descripcion')
    };
    
    const token = localStorage.getItem('token');
    
    try {
        const url = currentPackage ? 
            `${API_BASE}/packages/${currentPackage.id}` : 
            `${API_BASE}/packages`;
        
        const method = currentPackage ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(packageData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            const message = currentPackage ? 'Paquete actualizado exitosamente' : 'Paquete creado exitosamente';
            showSuccess(message);
            closeModal();
            loadPackages();
        } else {
            throw new Error(data.message || 'Error guardando paquete');
        }
        
    } catch (error) {
        console.error('Error guardando paquete:', error);
        showError(`Error guardando paquete: ${error.message}`);
    }
}

// Funciones de utilidad
function showLoading() {
    document.getElementById('packagesContainer').innerHTML = '<div class="loading">Cargando paquetes...</div>';
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `
        <div style="background: #fed7d7; color: #c53030; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            ⚠️ ${message}
        </div>
    `;
    
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

function showSuccess(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `
        <div style="background: #c6f6d5; color: #22543d; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            ✅ ${message}
        </div>
    `;
    
    setTimeout(() => {
        container.innerHTML = '';
    }, 3000);
}

function clearError() {
    document.getElementById('errorContainer').innerHTML = '';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Funciones para selección múltiple
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const packageCheckboxes = document.querySelectorAll('.package-checkbox');
    
    packageCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}

function getSelectedPackageIds() {
    const checkedBoxes = document.querySelectorAll('.package-checkbox:checked');
    return Array.from(checkedBoxes).map(checkbox => checkbox.value);
}

function printSelectedPackages() {
    const selectedIds = getSelectedPackageIds();
    
    if (selectedIds.length === 0) {
        alert('Por favor selecciona al menos un paquete para imprimir');
        return;
    }
    
    // Usar la función de impresión por lotes
    if (typeof generateBatchLabels === 'function') {
        generateBatchLabels(selectedIds);
    } else {
        // Fallback: imprimir uno por uno
        selectedIds.forEach(id => {
            const pkg = packages.find(p => p.id === id);
            if (pkg && typeof generateMasterLabel === 'function') {
                setTimeout(() => generateMasterLabel(pkg), 500);
            }
        });
    }
}

// ==============================================
// FUNCIONES DE IMPRESIÓN ZEBRA ZPL
// ==============================================

async function imprimirEtiquetaZebra(packageId) {
    const token = localStorage.getItem('token');
    const pkg = packages.find(p => p.id === packageId);
    
    if (!pkg) {
        showError('Paquete no encontrado');
        return;
    }
    
    try {
        showLoading();
        
        // Obtener código ZPL del backend
        const response = await fetch(`${API_BASE}/labels/zpl/${pkg.trackingNumber}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const zplCode = result.data.zpl;
        
        // Mostrar opciones de impresión
        mostrarOpcionesImpresionZebra(zplCode, pkg);
        
    } catch (error) {
        console.error('Error generando etiqueta:', error);
        showError('Error al generar etiqueta ZPL: ' + error.message);
    } finally {
        // Ocultar loading después de un momento
        setTimeout(() => {
            const loadingEl = document.querySelector('.loading');
            if (loadingEl) loadingEl.remove();
        }, 500);
    }
}

function mostrarOpcionesImpresionZebra(zplCode, pkg) {
    // Crear modal con opciones (SIN onclick inline)
    const modalHTML = `
        <div id="zebraModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: white; border-radius: 12px; padding: 30px; max-width: 600px; width: 90%;">
                <h2 style="margin-top: 0; color: #2d3748;">🖨️ Imprimir Etiqueta Zebra</h2>
                <p style="color: #4a5568; margin-bottom: 20px;">
                    Paquete: <strong>${pkg.trackingNumber}</strong><br>
                    Cliente: <strong>${pkg.cliente}</strong>
                </p>
                
                <div style="background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #2d3748;">Selecciona una opción:</p>
                    
                    <button id="btnPreview" 
                            style="width: 100%; padding: 12px; margin: 5px 0; background: #805ad5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        👁️ Vista Previa de Etiqueta
                    </button>
                    
                    <button id="btnImpresoraRed" 
                            style="width: 100%; padding: 12px; margin: 5px 0; background: #4299e1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        🌐 Enviar a Impresora (USB/Red)
                    </button>
                    
                    <button id="btnCopiarZPL" 
                            style="width: 100%; padding: 12px; margin: 5px 0; background: #48bb78; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        📋 Copiar Código ZPL
                    </button>
                    
                    <button id="btnDescargarZPL" 
                            style="width: 100%; padding: 12px; margin: 5px 0; background: #ed8936; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        💾 Descargar archivo .ZPL
                    </button>
                </div>
                
                <details style="margin-bottom: 20px;">
                    <summary style="cursor: pointer; color: #4a5568; font-weight: bold; margin-bottom: 10px;">Ver código ZPL</summary>
                    <pre style="background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 11px; max-height: 200px;">${zplCode}</pre>
                </details>
                
                <button id="btnCerrarModal" 
                        style="width: 100%; padding: 12px; background: #718096; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    // Insertar modal en el body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // AGREGAR EVENT LISTENERS después de insertar el HTML
    const decodedZPL = zplCode.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
    
    document.getElementById('btnPreview').addEventListener('click', () => {
        mostrarVistaPrevia(decodedZPL);
    });
    
    document.getElementById('btnImpresoraRed').addEventListener('click', () => {
        enviarAImpresoraRed(decodedZPL);
    });
    
    document.getElementById('btnCopiarZPL').addEventListener('click', () => {
        copiarZPL(decodedZPL);
    });
    
    document.getElementById('btnDescargarZPL').addEventListener('click', () => {
        descargarZPL(decodedZPL, pkg.trackingNumber);
    });
    
    document.getElementById('btnCerrarModal').addEventListener('click', () => {
        cerrarModalZebra();
    });
}

function escapeForAttribute(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

async function enviarAImpresoraRed(zplCode) {
    try {
        // Verificar si Browser Print está disponible
        if (typeof BrowserPrint === 'undefined') {
            alert('⚠️ Zebra Browser Print no detectado.\n\nPara imprimir:\n1. Instala Zebra Browser Print\n2. O usa "Descargar archivo .ZPL"');
            return;
        }
        
        // Obtener impresora por defecto
        BrowserPrint.getDefaultDevice('printer', function(device) {
            if (!device || !device.name) {
                alert('❌ No se detectó ninguna impresora Zebra conectada.\n\nVerifica que:\n1. La impresora esté encendida\n2. Esté conectada por USB\n3. Los drivers estén instalados');
                return;
            }
            
            console.log('Impresora detectada:', device.name);
            
            // Enviar código ZPL
            device.send(zplCode, 
                function() { 
                    alert('✅ Etiqueta enviada a la impresora: ' + device.name);
                    cerrarModalZebra();
                },
                function(error) { 
                    console.error('Error de impresión:', error);
                    alert('❌ Error al imprimir: ' + error);
                }
            );
        }, function(error) {
            console.error('Error obteniendo impresora:', error);
            alert('❌ Error al buscar impresora: ' + error);
        });
        
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error: ' + error.message);
    }
}
/*async function enviarAImpresoraRed(zplCode) {
    const ip = prompt('Ingresa la IP de la impresora Zebra:', '192.168.1.100');
    
    if (!ip) return;
    
    try {
        // Intentar usar Browser Print si está disponible
        if (typeof BrowserPrint !== 'undefined') {
            BrowserPrint.getDefaultDevice('printer', function(device) {
                device.send(zplCode, 
                    function() { 
                        alert('✅ Etiqueta enviada a la impresora');
                        cerrarModalZebra();
                    },
                    function(error) { 
                        alert('❌ Error: ' + error);
                    }
                );
            });
        } else {
            // Fallback: mostrar instrucciones
            alert(`⚠️ Zebra Browser Print no detectado.\n\nPara imprimir por red:\n1. Instala Zebra Browser Print\n2. O usa el método "Copiar código ZPL"\n3. Y pégalo en Zebra Setup Utilities`);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}*/

async function copiarZPL(zplCode) {
    try {
        await navigator.clipboard.writeText(zplCode);
        alert('✅ Código ZPL copiado al portapapeles\n\nPuedes pegarlo en:\n- Zebra Setup Utilities\n- Zebra Designer\n- O enviarlo directamente a la impresora');
    } catch (error) {
        alert('❌ Error al copiar: ' + error.message);
    }
}

function descargarZPL(zplCode, trackingNumber) {
    try {
        const blob = new Blob([zplCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiqueta_${trackingNumber}_${Date.now()}.zpl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('✅ Archivo ZPL descargado\n\nEnvíalo a tu impresora Zebra usando:\n- Zebra Setup Utilities\n- O cópialo al puerto de red de la impresora');
    } catch (error) {
        alert('❌ Error al descargar: ' + error.message);
    }
}

function cerrarModalZebra() {
    const modal = document.getElementById('zebraModal');
    if (modal) {
        modal.remove();
    }
}

function mostrarVistaPrevia(zplCode) {
    // Opción 1: Usar Labelary con parámetros en URL
    const labelaryUrl = `http://labelary.com/viewer.html?zpl=${encodeURIComponent(zplCode)}&dpmm=8&width=4&height=6`;
    
    // Abrir en nueva ventana
    const previewWindow = window.open(labelaryUrl, 'ZPL_Preview', 'width=900,height=700,resizable=yes,scrollbars=yes');
    
    if (!previewWindow) {
        // Si el popup fue bloqueado, mostrar alternativa
        if (confirm('El popup fue bloqueado. ¿Deseas abrir la vista previa en una nueva pestaña?')) {
            window.open(labelaryUrl, '_blank');
        }
    } else {
        previewWindow.focus();
    }
}

function logout() {
    const token = localStorage.getItem('token');
    if (token) {
        fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).catch(() => {
            // Ignorar errores de logout
        });
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    window.location.href = 'login.html';
}

