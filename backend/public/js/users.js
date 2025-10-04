// ============================================
// VARIABLES GLOBALES
// ============================================
let usuariosData = [];
let usuarioEditando = null;

// ============================================
// FUNCIONES DE CARGA DE DATOS
// ============================================
async function cargarUsuarios() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            usuariosData = data.data.users || [];
            console.log('Usuarios cargados desde API:', usuariosData.length);
        } else {
            console.log('Error al cargar usuarios desde API, usando datos de ejemplo');
            usuariosData = generarUsuariosEjemplo();
        }
        
    } catch (error) {
        console.log('API de usuarios no disponible, usando datos de ejemplo:', error);
        usuariosData = generarUsuariosEjemplo();
    }
    
    actualizarTablaUsuarios();
    actualizarEstadisticas();
}

// Cargar sucursales para el select
async function loadBranchesForSelect() {
    try {
        const response = await fetch('/api/public/branches');
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('userBranch');
            if (!select) return;
            
            select.innerHTML = '<option value="">Seleccionar sucursal...</option>';
            
            data.data.branches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = `${branch.nombre} - ${branch.direccion.ciudad}`;
                option.dataset.name = branch.nombre;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando sucursales:', error);
    }
}

// ============================================
// FUNCIONES DE API
// ============================================
async function crearUsuarioAPI(usuarioData) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usuarioData)
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Usuario creado exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al crear usuario', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al crear usuario', 'error');
        return false;
    }
}

async function editarUsuarioAPI(userId, usuarioData) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usuarioData)
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Usuario actualizado exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al actualizar usuario', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al actualizar usuario', 'error');
        return false;
    }
}

async function eliminarUsuarioAPI(userId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (response.ok) {
            mostrarMensaje('Usuario eliminado exitosamente', 'success');
            return true;
        } else {
            mostrarMensaje(result.message || 'Error al eliminar usuario', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error en API:', error);
        mostrarMensaje('Error de conexión al eliminar usuario', 'error');
        return false;
    }
}

async function cambiarEstadoUsuarioAPI(userId, nuevoEstado) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/admin/users/${userId}/estado`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });

        const result = await response.json();
        
        if (response.ok) {
            const accion = nuevoEstado === 'activo' ? 'activado' : 'desactivado';
            mostrarMensaje(`Usuario ${accion} exitosamente`, 'success');
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
function actualizarTablaUsuarios() {
    const tbody = document.querySelector('#tablaUsuarios tbody');
    console.log('Elemento tbody encontrado:', tbody);
    console.log('Datos para tabla:', usuariosData);

    if (!tbody) return;

    tbody.innerHTML = usuariosData.map(usuario => `
        <tr>
            <td>
                <div class="user-info">
                    <div class="user-avatar">${usuario.nombre.charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <div class="user-name">${usuario.nombre}</div>
                        <div class="user-email">${usuario.email}</div>
                    </div>
                </div>
            </td>
            <td><span class="role-badge role-${usuario.rol}">${usuario.rol}</span></td>
            <td><span class="status-badge status-${usuario.estado}">${usuario.estado}</span></td>
            <td>${new Date(usuario.fechaCreacion).toLocaleDateString('es-ES')}</td>
            <td>
                <div class="actions">
                    <button class="btn-action edit" data-user-id="${usuario.id}" title="Editar">
                        ✏️ Editar
                    </button>
                    <button class="btn-action ${usuario.estado === 'activo' ? 'deactivate' : 'activate'}" 
                            data-user-id="${usuario.id}" 
                            title="${usuario.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                        ${usuario.estado === 'activo' ? '🚫 Desactivar' : '✅ Activar'}
                    </button>
                    <button class="btn-action delete" data-user-id="${usuario.id}" title="Eliminar">
                        🗑️ Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Agregar event listeners después de crear las filas
    setupActionButtons();
}

function setupActionButtons() {
    // Botones de editar
    document.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            editarUsuario(userId);
        });
    });
    
    // Botones de activar/desactivar
    document.querySelectorAll('.btn-action.activate, .btn-action.deactivate').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            toggleEstadoUsuario(userId);
        });
    });
    
    // Botones de eliminar
    document.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            eliminarUsuario(userId);
        });
    });
}

function setupActionButtons() {
    // Botones de editar
    document.querySelectorAll('.btn-action.edit').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            editarUsuario(userId);
        });
    });
    
    // Botones de activar/desactivar
    document.querySelectorAll('.btn-action.activate, .btn-action.deactivate').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            toggleEstadoUsuario(userId);
        });
    });
    
    // Botones de eliminar
    document.querySelectorAll('.btn-action.delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = this.dataset.userId;
            eliminarUsuario(userId);
        });
    });
}

function actualizarEstadisticas() {
    const total = usuariosData.length;
    const activos = usuariosData.filter(u => u.estado === 'activo').length;
    const admins = usuariosData.filter(u => u.rol === 'admin').length;
    const choferes = usuariosData.filter(u => u.rol === 'chofer').length;

    // Usar los IDs correctos que encontramos
    const totalElement = document.getElementById('totalUsers');
    if (totalElement) totalElement.textContent = total;
    
    const activosElement = document.getElementById('activeUsers');
    if (activosElement) activosElement.textContent = activos;
    
    const choferesElement = document.getElementById('choferUsers');
    if (choferesElement) choferesElement.textContent = choferes;
    
    const adminsElement = document.getElementById('adminUsers');
    if (adminsElement) adminsElement.textContent = admins;

    console.log('Estadísticas actualizadas:', { total, activos, admins, choferes });
}

// ============================================
// FUNCIONES DE GESTIÓN DE USUARIOS
// ============================================
async function guardarUsuario() {
    const formData = {
        nombre: document.getElementById('nombreUsuario').value.trim(),
        email: document.getElementById('emailUsuario').value.trim(),
        telefono: document.getElementById('telefonoUsuario').value.trim(),
        rol: document.getElementById('rolUsuario').value
    };

    // Solo incluir contraseña si se está creando o si se cambió
    const passwordField = document.getElementById('passwordUsuario');
    if (passwordField.value.trim()) {
        formData.password = passwordField.value.trim();
    }

    // Validaciones básicas
    if (!formData.nombre || !formData.email || !formData.rol) {
        mostrarMensaje('Por favor completa todos los campos obligatorios', 'error');
        return;
    }

    if (!usuarioEditando && !formData.password) {
        mostrarMensaje('La contraseña es obligatoria para nuevos usuarios', 'error');
        return;
    }

    let success = false;

    if (usuarioEditando) {
        // Editar usuario existente
        success = await editarUsuarioAPI(usuarioEditando.id, formData);
    } else {
        // Crear nuevo usuario
        success = await crearUsuarioAPI(formData);
    }

    if (success) {
        cerrarModal();
        await cargarUsuarios(); // Recargar datos desde API
    }
}

function editarUsuario(userId) {
    usuarioEditando = usuariosData.find(u => u.id === userId);
    if (!usuarioEditando) return;

    // Llenar formulario con los IDs correctos del HTML
    document.getElementById('fullName').value = usuarioEditando.nombre;
    document.getElementById('email').value = usuarioEditando.email;
    document.getElementById('phone').value = usuarioEditando.telefono || '';
    document.getElementById('role').value = usuarioEditando.rol;
    document.getElementById('password').value = '';

    // Cambiar título y botón
    document.getElementById('modalTitle').textContent = 'Editar Usuario';

    // Mostrar modal
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

/*function editarUsuario(userId) {
    usuarioEditando = usuariosData.find(u => u.id === userId);
    if (!usuarioEditando) return;

    // Llenar formulario
    document.getElementById('nombreUsuario').value = usuarioEditando.nombre;
    document.getElementById('emailUsuario').value = usuarioEditando.email;
    document.getElementById('telefonoUsuario').value = usuarioEditando.telefono || '';
    document.getElementById('rolUsuario').value = usuarioEditando.rol;
    document.getElementById('passwordUsuario').value = '';

    // Cambiar título y botón
    document.getElementById('modalTitle').textContent = 'Editar Usuario';
    document.getElementById('btnGuardar').textContent = 'Actualizar Usuario';

    // Mostrar modal
    document.getElementById('modalUsuario').style.display = 'flex';
}*/

async function eliminarUsuario(userId) {
    const usuario = usuariosData.find(u => u.id === userId);
    if (!usuario) return;

    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${usuario.nombre}"?`)) {
        const success = await eliminarUsuarioAPI(userId);
        if (success) {
            await cargarUsuarios(); // Recargar datos desde API
        }
    }
}

async function toggleEstadoUsuario(userId) {
    const usuario = usuariosData.find(u => u.id === userId);
    if (!usuario) return;

    const nuevoEstado = usuario.estado === 'activo' ? 'inactivo' : 'activo';
    const success = await cambiarEstadoUsuarioAPI(userId, nuevoEstado);
    
    if (success) {
        await cargarUsuarios(); // Recargar datos desde API
    }
}

// ============================================
// FUNCIONES DE MODAL
// ============================================
function abrirModal() {
    console.log('Intentando abrir modal...');
    usuarioEditando = null;
    
    const modal = document.getElementById('userModal');
    console.log('Modal encontrado:', modal);
    
    if (!modal) {
        console.error('Modal no encontrado');
        return;
    }
    
    // Limpiar formulario
    const form = document.getElementById('userForm');
    if (form) form.reset();
    
    // Cargar sucursales
    loadBranchesForSelect();
    
    // Event listener para mostrar/ocultar campo sucursal según rol
    const roleSelect = document.getElementById('role');
    if (roleSelect) {
        // Remover listeners anteriores si existen
        const newRoleSelect = roleSelect.cloneNode(true);
        roleSelect.parentNode.replaceChild(newRoleSelect, roleSelect);
        
        newRoleSelect.addEventListener('change', function() {
            const branchField = document.getElementById('branchFieldGroup');
            const branchSelect = document.getElementById('userBranch');
            
            if (this.value === 'local') {
                branchField.style.display = 'block';
                branchSelect.required = true;
            } else {
                branchField.style.display = 'none';
                branchSelect.required = false;
            }
        });
    }
    
    // Configurar para nuevo usuario
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Nuevo Usuario';
    
    // Mostrar modal
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    usuarioEditando = null;
    
    // Limpiar formulario
    document.getElementById('userForm').reset();
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

function generarUsuariosEjemplo() {
    return [
        {
            id: '1',
            nombre: 'Juan Pérez',
            email: 'admin@logitrack.com',
            telefono: '81-1234-5678',
            rol: 'admin',
            estado: 'activo',
            fechaCreacion: new Date().toISOString()
        },
        {
            id: '2',
            nombre: 'María González',
            email: 'maria@logitrack.com',
            telefono: '81-2345-6789',
            rol: 'chofer',
            estado: 'activo',
            fechaCreacion: new Date().toISOString()
        },
        {
            id: '3',
            nombre: 'Carlos Rodríguez',
            email: 'carlos@logitrack.com',
            telefono: '81-3456-7890',
            rol: 'chofer',
            estado: 'inactivo',
            fechaCreacion: new Date().toISOString()
        }
    ];
}

// ============================================
// FILTROS Y BÚSQUEDA
// ============================================
function filtrarUsuarios() {
    const busqueda = document.getElementById('buscarUsuario').value.toLowerCase();
    const filtroRol = document.getElementById('filtroRol').value;
    const filtroEstado = document.getElementById('filtroEstado').value;

    const usuariosFiltrados = usuariosData.filter(usuario => {
        const coincideBusqueda = usuario.nombre.toLowerCase().includes(busqueda) || 
                                usuario.email.toLowerCase().includes(busqueda);
        const coincidenRol = filtroRol === '' || usuario.rol === filtroRol;
        const coincidenEstado = filtroEstado === '' || usuario.estado === filtroEstado;
        
        return coincideBusqueda && coincidenRol && coincidenEstado;
    });

    // Actualizar tabla con usuarios filtrados
    const tbody = document.querySelector('#tablaUsuarios tbody');
    if (!tbody) return;

    tbody.innerHTML = usuariosFiltrados.map(usuario => `
    <tr>
        <td>
            <div class="user-info">
                <div class="user-avatar">${usuario.nombre.charAt(0).toUpperCase()}</div>
                <div class="user-details">
                    <div class="user-name">${usuario.nombre}</div>
                    <div class="user-email">${usuario.email}</div>
                </div>
            </div>
        </td>
        <td><span class="role-badge role-${usuario.rol}">${usuario.rol}</span></td>
        <td><span class="status-badge status-${usuario.estado}">${usuario.estado}</span></td>
        <td>${new Date(usuario.fechaCreacion).toLocaleDateString('es-ES')}</td>
        <td>
            <div class="actions">
                <button class="btn-action edit" data-user-id="${usuario.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action ${usuario.estado === 'activo' ? 'deactivate' : 'activate'}" 
                        data-user-id="${usuario.id}" 
                        title="${usuario.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                    <i class="fas ${usuario.estado === 'activo' ? 'fa-user-slash' : 'fa-user-check'}"></i>
                </button>
                <button class="btn-action delete" data-user-id="${usuario.id}" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    </tr>
`).join('');

// Agregar event listeners después de filtrar
setupActionButtons();
}

// ============================================
// EVENTOS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Generar menú según rol del usuario
    generateRoleBasedMenu();

    // Cargar usuarios al iniciar
    cargarUsuarios();
    
    // Event listeners para filtros
    document.getElementById('buscarUsuario')?.addEventListener('input', filtrarUsuarios);
    document.getElementById('filtroRol')?.addEventListener('change', filtrarUsuarios);
    document.getElementById('filtroEstado')?.addEventListener('change', filtrarUsuarios);
    
    // Cerrar modal al hacer clic fuera
    document.getElementById('modalUsuario')?.addEventListener('click', function(e) {
        if (e.target === this) {
            cerrarModal();
        }
    });
});

// Event listener para el formulario
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const role = document.getElementById('role').value;
    let branchId = null;
    let sucursal = null;
    
    // Si es receptor local, obtener sucursal
    if (role === 'local') {
        const branchSelect = document.getElementById('userBranch');
        branchId = branchSelect.value;
        sucursal = branchSelect.options[branchSelect.selectedIndex]?.dataset.name;
        
        if (!branchId) {
            alert('Por favor selecciona una sucursal para el receptor local');
            return;
        }
    }
    
    const formData = {
        nombre: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        telefono: document.getElementById('phone').value.trim(),
        rol: role,
        branchId: branchId,
        sucursal: sucursal,
        password: document.getElementById('password').value.trim()
    };
    
    console.log('Datos del formulario:', formData);
    
    if (!formData.nombre || !formData.email || !formData.rol || !formData.password) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }
    
    let success = false;
    
    if (usuarioEditando) {
        success = await editarUsuarioAPI(usuarioEditando.id, formData);
    } else {
        success = await crearUsuarioAPI(formData);
    }
    
    if (success) {
        cerrarModal();
        await cargarUsuarios();
    }
});

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
                { href: 'branches.html', text: 'Sucursales' },
                { href: 'users.html', text: 'Usuarios', active: true },
                { href: 'reports.html', text: 'Reportes' }
            ];
            break;
            
        case 'logistics':
             alert('No tienes permisos para acceder a esta sección.');
             window.location.href = 'packages.html';
            return;
            
        default:
            // Otros roles no deberían acceder a usuarios
            menuItems = [
                { href: 'packages.html', text: 'Paquetes' }
            ];
    }
    
    navigationMenu.innerHTML = menuItems.map(item => 
        `<a href="${item.href}" class="nav-link ${item.active ? 'active' : ''}">${item.text}</a>`
    ).join('');
}

// Y actualizar el evento DOMContentLoaded en users.js:
document.addEventListener('DOMContentLoaded', function() {
    // Generar menú según rol del usuario
    generateRoleBasedMenu();
    
    // Cargar usuarios al iniciar
    cargarUsuarios();
    
    // ... resto del código existente
});

// Event listener para el botón nuevo usuario
document.getElementById('newUserBtn').addEventListener('click', abrirModal);

// Event listener para cerrar modal
document.getElementById('closeModal').addEventListener('click', cerrarModal);
document.getElementById('cancelBtn').addEventListener('click', cerrarModal);