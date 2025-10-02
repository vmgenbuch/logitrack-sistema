

// ============================================
// VARIABLES GLOBALES
// ============================================
let sucursalesData = [];
let sucursalEditando = null;

// ============================================
// FUNCIONES DE CARGA DE DATOS
// ============================================
async function cargarSucursales() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/branches', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            sucursalesData = data.data.branches || [];
            console.log('Sucursales cargadas desde API:', sucursalesData.length);
        } else {
            console.log('Error al cargar sucursales desde API, usando datos de ejemplo');
            sucursalesData = generarSucursalesEjemplo();
        }
        
    } catch (error) {
        console.log('API de sucursales no disponible, usando datos de ejemplo:', error);
        sucursalesData = generarSucursalesEjemplo();
    }
    
    actualizarTablaSucursales();
    await cargarEstadisticas();
}

// Función para generar menú según rol
function generateRoleBasedMenu() {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    const navigationMenu = document.getElementById('navigationMenu');
    
    if (!navigationMenu) return;
    
    let menuItems = [];
    
    switch(user.role) {
        case 'admin':
            menuItems = [
                { href: 'dashboard-admin.html', text: 'Dashboard' },
                { href: 'packages.html', text: 'Paquetes' },
                { href: 'routes.html', text: 'Rutas' },
                { href: 'branches.html', text: 'Sucursales', active: true },
                { href: 'users.html', text: 'Usuarios' },
                { href: 'reports.html', text: 'Reportes' }
            ];
            break;
            
        case 'logistics':
            menuItems = [
                { href: 'packages.html', text: 'Paquetes' },
                { href: 'routes.html', text: 'Rutas' },
                { href: 'reports.html', text: 'Reportes' }
            ];
            break;
            
        case 'chofer':
            menuItems = [
                { href: 'packages.html', text: 'Mis Entregas' },
                { href: 'routes.html', text: 'Mi Ruta' }
            ];
            break;
            
        case 'supervisor':
            menuItems = [
                { href: 'packages.html', text: 'Paquetes' },
                { href: 'routes.html', text: 'Rutas' },
                { href: 'branches.html', text: 'Sucursales', active: true },
                { href: 'reports.html', text: 'Reportes' },
                { href: 'users.html', text: 'Usuarios' }
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

async function cargarEstadisticas() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/branches/stats', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            actualizarEstadisticas(data.data);
        } else {
            // Calcular estadísticas desde datos locales
            calcularEstadisticasLocales();
        }
        
    } catch (error) {
        console.log('Error cargando estadísticas:', error);
        calcularEstadisticasLocales();
    }
}

function calcularEstadisticasLocales() {
    const stats = {
        total: sucursalesData.length,
        activas: sucursalesData.filter(s => s.estado === 'activa').length,
        capacidadTotal: sucursalesData.reduce((total, sucursal) => total + (sucursal.capacidad || 0), 0),
        porZona: {}
    };
    
    // Contar zonas únicas
    const zonasUnicas = [...new Set(sucursalesData.map(s => s.zona))];
    stats.totalZones = zonasUnicas.length;
    
    actualizarEstadisticas(stats);
}

// ============================================
// FUNCIONES DE API
// ============================================
async function crearSucursalAPI(sucursalData) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/branches', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sucursalData)
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Sucursal creada exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al crear sucursal', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al crear sucursal', 'error');
        return false;
    }
}

async function editarSucursalAPI(sucursalId, sucursalData) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/branches/${sucursalId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sucursalData)
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Sucursal actualizada exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al actualizar sucursal', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al actualizar sucursal', 'error');
        return false;
    }
}

async function eliminarSucursalAPI(sucursalId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/branches/${sucursalId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Sucursal eliminada exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al eliminar sucursal', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al eliminar sucursal', 'error');
        return false;
    }
}

async function cambiarEstadoSucursalAPI(sucursalId, nuevoEstado) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/branches/${sucursalId}/estado`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });

        const result = await response.json();
        
        if (response.ok) {
            const accion = nuevoEstado === 'activa' ? 'activada' : 'desactivada';
            mostrarMensaje(`Sucursal ${accion} exitosamente`, 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al cambiar estado', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al cambiar estado', 'error');
        return false;
    }
}

// ============================================
// FUNCIONES DE INTERFAZ
// ============================================
function actualizarTablaSucursales() {
    const tbody = document.querySelector('#tablaSucursales tbody');
    if (!tbody) return;

    tbody.innerHTML = sucursalesData.map(sucursal => `
        <tr>
            <td>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div style="font-weight: 500;">${sucursal.nombre}</div>
                    <div style="color: #718096; font-size: 0.8rem;">
                        ${sucursal.direccion?.calle || 'Dirección no disponible'}
                    </div>
                    <div style="color: #718096; font-size: 0.8rem;">
                        📧 ${sucursal.contacto?.email || 'N/A'} | 📞 ${sucursal.contacto?.telefono || 'N/A'}
                    </div>
                </div>
            </td>
            <td><code style="background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 4px;">${sucursal.codigo}</code></td>
            <td><span class="zone-badge zone-${sucursal.zona?.toLowerCase() || 'centro'}">${sucursal.zona || 'N/A'}</span></td>
            <td><span class="status-badge status-${sucursal.estado || 'activa'}">${sucursal.estado || 'activa'}</span></td>
            <td>${sucursal.capacidad || 0} paq/día</td>
            <td>
                <div class="actions">
                    <button data-action="edit" data-id="${sucursal.id}" class="btn btn-sm" title="Editar">
                        ✏️ Editar
                    </button>
                    <button data-action="toggle" data-id="${sucursal.id}" 
                            class="btn btn-sm ${sucursal.estado === 'activa' ? 'btn-warning' : 'btn-success'}" 
                            title="${sucursal.estado === 'activa' ? 'Desactivar' : 'Activar'}">
                        ${sucursal.estado === 'activa' ? '🚫 Desactivar' : '✅ Activar'}
                    </button>
                    <button data-action="delete" data-id="${sucursal.id}" class="btn btn-sm btn-danger" title="Eliminar">
                        🗑️ Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Agregar event listeners a los botones
    tbody.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function(e) {
            const action = this.dataset.action;
            const id = this.dataset.id;
            
            switch(action) {
                case 'edit':
                    editarSucursal(id);
                    break;
                case 'toggle':
                    toggleEstadoSucursal(id);
                    break;
                case 'delete':
                    eliminarSucursal(id);
                    break;
            }
        });
    });
}

function actualizarEstadisticas(stats) {
    // Actualizar contadores
    const totalElement = document.getElementById('totalBranches');
    if (totalElement) totalElement.textContent = stats.total || 0;
    
    const activasElement = document.getElementById('activeBranches');
    if (activasElement) activasElement.textContent = stats.activas || 0;
    
    const capacidadElement = document.getElementById('totalCapacity');
    if (capacidadElement) capacidadElement.textContent = stats.capacidadTotal || 0;
    
    const zonasElement = document.getElementById('totalZones');
    if (zonasElement) zonasElement.textContent = stats.totalZones || 0;

    console.log('Estadísticas actualizadas:', stats);
}

// ============================================
// FUNCIONES DE GESTIÓN DE SUCURSALES
// ============================================
async function guardarSucursal() {
    const formData = {
        nombre: document.getElementById('nombre').value.trim(),
        codigo: document.getElementById('codigo').value.trim(),
        direccion: {
            calle: document.getElementById('calle').value.trim(),
            colonia: document.getElementById('colonia').value.trim(),
            ciudad: document.getElementById('ciudad').value.trim(),
            estado: document.getElementById('estado').value.trim(),
            codigoPostal: document.getElementById('codigoPostal').value.trim()
        },
        contacto: {
            telefono: document.getElementById('telefono').value.trim(),
            email: document.getElementById('email').value.trim(),
            responsable: document.getElementById('responsable').value.trim()
        },
        zona: document.getElementById('zona').value,
        capacidad: parseInt(document.getElementById('capacidad').value)
    };

    // Validaciones básicas
    if (!formData.nombre || !formData.codigo || !formData.direccion.calle || 
        !formData.direccion.colonia || !formData.contacto.email || !formData.zona) {
        mostrarMensaje('Por favor completa todos los campos obligatorios', 'error');
        return;
    }

    if (!formData.capacidad || formData.capacidad <= 0) {
        mostrarMensaje('La capacidad debe ser un número positivo', 'error');
        return;
    }

    let success = false;

    if (sucursalEditando) {
        // Editar sucursal existente
        success = await editarSucursalAPI(sucursalEditando.id, formData);
    } else {
        // Crear nueva sucursal
        success = await crearSucursalAPI(formData);
    }

    if (success) {
        cerrarModal();
        await cargarSucursales(); // Recargar datos desde API
    }
}

function editarSucursal(sucursalId) {
    sucursalEditando = sucursalesData.find(s => s.id === sucursalId);
    if (!sucursalEditando) return;

    // Llenar formulario con datos existentes
    document.getElementById('nombre').value = sucursalEditando.nombre;
    document.getElementById('codigo').value = sucursalEditando.codigo;
    
    // Dirección
    document.getElementById('calle').value = sucursalEditando.direccion?.calle || '';
    document.getElementById('colonia').value = sucursalEditando.direccion?.colonia || '';
    document.getElementById('ciudad').value = sucursalEditando.direccion?.ciudad || '';
    document.getElementById('estado').value = sucursalEditando.direccion?.estado || '';
    document.getElementById('codigoPostal').value = sucursalEditando.direccion?.codigoPostal || '';
    
    // Contacto
    document.getElementById('telefono').value = sucursalEditando.contacto?.telefono || '';
    document.getElementById('email').value = sucursalEditando.contacto?.email || '';
    document.getElementById('responsable').value = sucursalEditando.contacto?.responsable || '';
    
    // Otros campos
    document.getElementById('zona').value = sucursalEditando.zona || '';
    document.getElementById('capacidad').value = sucursalEditando.capacidad || '';

    // Cambiar título y botón
    document.getElementById('modalTitle').textContent = 'Editar Sucursal';

    // Mostrar modal
    document.getElementById('branchModal').style.display = 'flex';
    document.getElementById('branchModal').classList.add('active');
}

async function eliminarSucursal(sucursalId) {
    const sucursal = sucursalesData.find(s => s.id === sucursalId);
    if (!sucursal) return;

    if (confirm(`¿Estás seguro de que deseas eliminar la sucursal "${sucursal.nombre}"?`)) {
        const success = await eliminarSucursalAPI(sucursalId);
        if (success) {
            await cargarSucursales(); // Recargar datos desde API
        }
    }
}

async function toggleEstadoSucursal(sucursalId) {
    const sucursal = sucursalesData.find(s => s.id === sucursalId);
    if (!sucursal) return;

    const nuevoEstado = sucursal.estado === 'activa' ? 'inactiva' : 'activa';
    const success = await cambiarEstadoSucursalAPI(sucursalId, nuevoEstado);
    
    if (success) {
        await cargarSucursales(); // Recargar datos desde API
    }
}

// ============================================
// FUNCIONES DE MODAL
// ============================================
function abrirModal() {
    sucursalEditando = null;
    
    // Limpiar formulario
    document.getElementById('branchForm').reset();
    
    // Configurar para nueva sucursal
    document.getElementById('modalTitle').textContent = 'Nueva Sucursal';
    
    // Mostrar modal
    const modal = document.getElementById('branchModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('branchModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    sucursalEditando = null;
    
    // Limpiar formulario
    document.getElementById('branchForm').reset();
}

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================
function mostrarMensaje(mensaje, tipo) {
    // Crear elemento de mensaje
    const mensajeDiv = document.createElement('div');
    mensajeDiv.className = `message ${tipo}`;
    mensajeDiv.textContent = mensaje;
    
    // Estilos del mensaje
    mensajeDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background-color: ${tipo === 'success' ? '#10b981' : '#ef4444'};
    `;
    
    document.body.appendChild(mensajeDiv);
    
    // Remover después de 3 segundos
    setTimeout(() => {
        mensajeDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.parentNode.removeChild(mensajeDiv);
            }
        }, 300);
    }, 3000);
}

function generarSucursalesEjemplo() {
    return [
        {
            id: '1',
            nombre: 'Sucursal Centro',
            codigo: 'MTY-01',
            direccion: {
                calle: 'Av. Constitución 1234',
                colonia: 'Centro',
                ciudad: 'Monterrey',
                estado: 'Nuevo León',
                codigoPostal: '64000'
            },
            contacto: {
                telefono: '81-1234-5678',
                email: 'centro@logistica.com',
                responsable: 'Juan Pérez'
            },
            zona: 'Centro',
            estado: 'activa',
            capacidad: 500,
            fechaCreacion: new Date().toISOString()
        },
        {
            id: '2',
            nombre: 'Sucursal Norte',
            codigo: 'MTY-02',
            direccion: {
                calle: 'Av. Lincoln 567',
                colonia: 'Mitras Norte',
                ciudad: 'Monterrey',
                estado: 'Nuevo León',
                codigoPostal: '64460'
            },
            contacto: {
                telefono: '81-2345-6789',
                email: 'norte@logistica.com',
                responsable: 'María González'
            },
            zona: 'Norte',
            estado: 'activa',
            capacidad: 300,
            fechaCreacion: new Date().toISOString()
        }
    ];
}

// ============================================
// FILTROS Y BÚSQUEDA
// ============================================
function filtrarSucursales() {
    const busqueda = document.getElementById('searchInput').value.toLowerCase();
    const filtroZona = document.getElementById('zoneFilter').value;
    const filtroEstado = document.getElementById('statusFilter').value;

    const sucursalesFiltradas = sucursalesData.filter(sucursal => {
        const coincideBusqueda = sucursal.nombre.toLowerCase().includes(busqueda) || 
                                sucursal.codigo.toLowerCase().includes(busqueda) ||
                                (sucursal.direccion?.calle || '').toLowerCase().includes(busqueda);
        const coincidenZona = filtroZona === '' || sucursal.zona === filtroZona;
        const coincidenEstado = filtroEstado === '' || sucursal.estado === filtroEstado;
        
        return coincideBusqueda && coincidenZona && coincidenEstado;
    });

    // Actualizar tabla con sucursales filtradas
    const tbody = document.querySelector('#tablaSucursales tbody');
    if (!tbody) return;

    tbody.innerHTML = sucursalesFiltradas.map(sucursal => `
        <tr>
            <td>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div style="font-weight: 500;">${sucursal.nombre}</div>
                    <div style="color: #718096; font-size: 0.8rem;">
                        ${sucursal.direccion?.calle || 'Dirección no disponible'}
                    </div>
                    <div style="color: #718096; font-size: 0.8rem;">
                        📧 ${sucursal.contacto?.email || 'N/A'} | 📞 ${sucursal.contacto?.telefono || 'N/A'}
                    </div>
                </div>
            </td>
            <td><code style="background: #f7fafc; padding: 0.25rem 0.5rem; border-radius: 4px;">${sucursal.codigo}</code></td>
            <td><span class="zone-badge zone-${sucursal.zona?.toLowerCase() || 'centro'}">${sucursal.zona || 'N/A'}</span></td>
            <td><span class="status-badge status-${sucursal.estado || 'activa'}">${sucursal.estado || 'activa'}</span></td>
            <td>${sucursal.capacidad || 0} paq/día</td>
            <td>
                <div class="actions">
                    <button data-action="edit" data-id="${sucursal.id}" class="btn btn-sm" title="Editar">
                        ✏️ Editar
                    </button>
                    <button data-action="toggle" data-id="${sucursal.id}" 
                            class="btn btn-sm ${sucursal.estado === 'activa' ? 'btn-warning' : 'btn-success'}" 
                            title="${sucursal.estado === 'activa' ? 'Desactivar' : 'Activar'}">
                        ${sucursal.estado === 'activa' ? '🚫 Desactivar' : '✅ Activar'}
                    </button>
                    <button data-action="delete" data-id="${sucursal.id}" class="btn btn-sm btn-danger" title="Eliminar">
                        🗑️ Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Agregar event listeners a los botones filtrados
    tbody.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function(e) {
            const action = this.dataset.action;
            const id = this.dataset.id;
            
            switch(action) {
                case 'edit':
                    editarSucursal(id);
                    break;
                case 'toggle':
                    toggleEstadoSucursal(id);
                    break;
                case 'delete':
                    eliminarSucursal(id);
                    break;
            }
        });
    });
}

// ============================================
// EVENTOS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Generar menú según rol del usuario
    generateRoleBasedMenu();
    
    // Cargar sucursales al iniciar
    cargarSucursales();
    
    // Event listeners para modal
    document.getElementById('newBranchBtn').addEventListener('click', abrirModal);
    document.getElementById('closeModal').addEventListener('click', cerrarModal);
    document.getElementById('cancelBtn').addEventListener('click', cerrarModal);
    
    // Event listener para el formulario
    document.getElementById('branchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await guardarSucursal();
    });
    
    // Event listeners para filtros
    document.getElementById('searchInput').addEventListener('input', filtrarSucursales);
    document.getElementById('zoneFilter').addEventListener('change', filtrarSucursales);
    document.getElementById('statusFilter').addEventListener('change', filtrarSucursales);
    
    // Event listener para botón actualizar
    document.getElementById('refreshBtn').addEventListener('click', cargarSucursales);
    
    // Cerrar modal al hacer clic fuera
    document.getElementById('branchModal').addEventListener('click', function(e) {
        if (e.target === this) {
            cerrarModal();
        }
    });
    
    // Event listener para logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        window.location.href = 'login.html';
    });
});