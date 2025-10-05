const API_BASE = window.API_BASE_URL || '/api';
let packages = [];
let routes = [];
let currentPackage = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    loadDriverData();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    if (!['admin', 'chofer'].includes(user.role)) {
        alert('No tienes permisos para acceder a este panel.');
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', loadDriverData);
    
    // Event delegation para botones dinámicos
    document.getElementById('packagesContainer').addEventListener('click', handlePackageAction);
}

function handlePackageAction(e) {
    if (e.target.classList.contains('btn')) {
        const packageId = e.target.dataset.packageId;
        const action = e.target.dataset.action;
        
        switch (action) {
            case 'transit':
                markInTransit(packageId);
                break;
            case 'delivered':
                markDelivered(packageId);
                break;
            case 'details':
                viewDetails(packageId);
                break;
        }
    }
}

async function loadDriverData() {
    await loadPackages();
}

// 🎯 FUNCIÓN PRINCIPAL CORREGIDA
async function loadPackages() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token) {
        showError('No hay token de autenticación. Por favor, inicia sesión again.');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }
    
    // ✅ OBTENER LA RUTA DEL USUARIO
    const userRoute = getUserRoute(user);
    if (!userRoute) {
        showError('No tienes una ruta asignada. Contacta al administrador.');
        return;
    }
    
    try {
        showLoading();
        
        console.log('Cargando paquetes para ruta:', userRoute);
        
        // ✅ PETICIÓN CORREGIDA: Usar /api/packages/route/:routeId
        const response = await fetch(`${API_BASE}/packages/route/${userRoute}`, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 403) {
            throw new Error('Acceso denegado. No tienes permisos para ver paquetes.');
        }
        
        if (response.status === 401) {
            throw new Error('Token inválido o expirado. Por favor, inicia sesión again.');
        }
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // ✅ ESTRUCTURA DE DATOS CORREGIDA
            packages = data.data || [];
            updateStatistics();
            displayPackages();
            clearError();
        } else {
            throw new Error(data.message || 'Error cargando paquetes');
        }
        
    } catch (error) {
        console.error('Error cargando paquetes:', error);
        showError('Error cargando paquetes: ' + error.message);
        
        if (error.message.includes('denegado') || error.message.includes('inválido') || error.message.includes('expirado')) {
            setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                window.location.href = 'login.html';
            }, 3000);
        }
    }
}

// ✅ NUEVA FUNCIÓN: Obtener ruta del usuario
function getUserRoute(user) {
    // Si el usuario tiene ruta asignada directamente
    if (user.ruta) {
        return user.ruta;
    }
    
    // Si el nombre del usuario contiene la ruta (como "Ruta1")
    if (user.fullName && user.fullName.toLowerCase().includes('ruta')) {
        const routeMatch = user.fullName.toLowerCase().match(/ruta(\d+)/);
        if (routeMatch) {
            return `ruta${routeMatch[1]}`;
        }
    }
    
    // Si el email contiene la ruta
    if (user.email && user.email.includes('ruta')) {
        const routeMatch = user.email.match(/ruta(\d+)/);
        if (routeMatch) {
            return `ruta${routeMatch[1]}`;
        }
    }
    
    // Valor por defecto basado en el email o nombre
    if (user.email === 'ruta1@molecula83.com.mx' || user.fullName === 'Ruta1') {
        return 'ruta1';
    }
    
    return null;
}

function updateStatistics() {
    const total = packages.length;
    const pending = packages.filter(p => ['pending', 'assigned'].includes(p.status)).length;
    const transit = packages.filter(p => p.status === 'in_transit' || p.status === 'in transit').length;
    const delivered = packages.filter(p => p.status === 'delivered').length;
    
    document.getElementById('totalPackages').textContent = total;
    document.getElementById('pendingPackages').textContent = pending;
    document.getElementById('transitPackages').textContent = transit;
    document.getElementById('deliveredPackages').textContent = delivered;
}

function displayPackages() {
    const container = document.getElementById('packagesContainer');
    
    if (packages.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No hay paquetes asignados a tu ruta</h3></div>';
        return;
    }
    
    let html = '';
    packages.forEach(pkg => {
        const createdDate = safeFormatDate(pkg.fechaCreacion);
        html += '<div class="package-item">';
        html += '<div class="package-info">';
        html += '<div class="package-main">';
        html += '<div class="tracking-number">' + pkg.trackingNumber + '</div>';
        html += '<div class="client-name">' + pkg.cliente + '</div>';
        html += '<div class="address">' + pkg.direccion + '</div>';
        html += '</div>';
        html += '<div class="package-meta">';
        html += '<div class="meta-item"><span class="meta-label">Estado:</span><span class="status-badge status-' + pkg.status + '">' + getStatusText(pkg.status) + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Peso:</span><span class="meta-value">' + pkg.pesoSalida + ' kg</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Prioridad:</span><span class="priority-badge priority-' + pkg.prioridad + '">' + getPriorityText(pkg.prioridad) + '</span></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="package-actions">';
        html += getPackageActions(pkg);
        html += '</div>';
        html += '</div>';
    });
    
    container.innerHTML = html;
}

function getPackageActions(pkg) {
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        return '<button class="btn btn-primary" data-package-id="' + pkg.id + '" data-action="transit">🚛 Marcar En Tránsito</button>';
    } else if (pkg.status === 'in_transit' || pkg.status === 'in transit') {
        return '<button class="btn btn-success" data-package-id="' + pkg.id + '" data-action="delivered">✅ Marcar Entregado</button>';
    }
    return '<button class="btn" data-package-id="' + pkg.id + '" data-action="details">👁️ Ver Detalles</button>';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado', 
        'in_transit': 'En Tránsito',
        'in transit': 'En Tránsito',
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

function markInTransit(packageId) {
    updatePackageStatus(packageId, {
        status: 'in_transit',
        tiempoSalidaReparto: new Date().toISOString()
    });
}

function markDelivered(packageId) {
    const receiverName = prompt('Nombre de quien recibe:');
    if (receiverName) {
        updatePackageStatus(packageId, {
            status: 'delivered',
            tiempoEntrega: new Date().toISOString(),
            nombreQuienRecibio: receiverName,
            pesoEntrega: packages.find(p => p.id === packageId).pesoSalida
        });
    }
}

function viewDetails(packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (pkg) {
        const details = 'DETALLES DEL PAQUETE\n\n' +
            'Tracking: ' + pkg.trackingNumber + '\n' +
            'Cliente: ' + pkg.cliente + '\n' +
            'Dirección: ' + pkg.direccion + '\n' +
            'Estado: ' + getStatusText(pkg.status) + '\n' +
            'Peso: ' + pkg.pesoSalida + ' kg\n' +
            'Prioridad: ' + getPriorityText(pkg.prioridad) + '\n' +
            'Fecha creación: ' + safeFormatDateTime(pkg.fechaCreacion);
        alert(details);
    }
}

async function updatePackageStatus(packageId, updateData) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showError('No hay token de autenticación');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/packages/${packageId}`, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.status === 403) {
            throw new Error('No tienes permisos para actualizar este paquete');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Estado actualizado exitosamente');
            loadPackages();
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        showError('Error actualizando estado: ' + error.message);
    }
}

function showLoading() {
    document.getElementById('packagesContainer').innerHTML = '<div class="loading">Cargando paquetes...</div>';
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = '<div style="background: #fed7d7; color: #c53030; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">⚠️ ' + message + '</div>';
}

function showSuccess(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = '<div style="background: #c6f6d5; color: #22543d; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">✅ ' + message + '</div>';
    setTimeout(() => container.innerHTML = '', 3000);
}

function clearError() {
    document.getElementById('errorContainer').innerHTML = '';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    window.location.href = 'login.html';
}

/*const API_BASE = 'http://localhost:3000/api';
let packages = [];
let routes = [];
let currentPackage = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    loadDriverData();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    if (!['admin', 'chofer'].includes(user.role)) {
        alert('No tienes permisos para acceder a este panel.');
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', loadDriverData);
    
    // Event delegation para botones dinámicos
    document.getElementById('packagesContainer').addEventListener('click', handlePackageAction);
}

function handlePackageAction(e) {
    if (e.target.classList.contains('btn')) {
        const packageId = e.target.dataset.packageId;
        const action = e.target.dataset.action;
        
        switch (action) {
            case 'transit':
                markInTransit(packageId);
                break;
            case 'delivered':
                markDelivered(packageId);
                break;
            case 'details':
                viewDetails(packageId);
                break;
        }
    }
}

async function loadDriverData() {
    await loadPackages();
}

async function loadPackages() {
    const token = localStorage.getItem('token');
    
    try {
        showLoading();
        
        const response = await fetch(API_BASE + '/packages', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            packages = (data.data.packages || []).map(mapPackageFromAPI);
            updateStatistics();
            displayPackages();
            clearError();
        } else {
            throw new Error(data.message || 'Error cargando paquetes');
        }
        
    } catch (error) {
        console.error('Error cargando paquetes:', error);
        showError('Error cargando paquetes: ' + error.message);
    }
}

function updateStatistics() {
    const total = packages.length;
    const pending = packages.filter(p => ['pending', 'assigned'].includes(p.status)).length;
    const transit = packages.filter(p => p.status === 'in transit').length;
    const delivered = packages.filter(p => p.status === 'delivered').length;
    
    document.getElementById('totalPackages').textContent = total;
    document.getElementById('pendingPackages').textContent = pending;
    document.getElementById('transitPackages').textContent = transit;
    document.getElementById('deliveredPackages').textContent = delivered;
}

function displayPackages() {
    const container = document.getElementById('packagesContainer');
    
    if (packages.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No hay paquetes asignados</h3></div>';
        return;
    }
    
    let html = '';
    packages.forEach(pkg => {
        const createdDate = safeFormatDate(pkg.fechaCreacion);
        html += '<div class="package-item">';
        html += '<div class="package-info">';
        html += '<div class="package-main">';
        html += '<div class="tracking-number">' + pkg.trackingNumber + '</div>';
        html += '<div class="client-name">' + pkg.cliente + '</div>';
        html += '<div class="address">' + pkg.direccion + '</div>';
        html += '</div>';
        html += '<div class="package-meta">';
        html += '<div class="meta-item"><span class="meta-label">Estado:</span><span class="status-badge status-' + pkg.status + '">' + getStatusText(pkg.status) + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Peso:</span><span class="meta-value">' + pkg.pesoSalida + ' kg</span></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="package-actions">';
        html += getPackageActions(pkg);
        html += '</div>';
        html += '</div>';
    });
    
    container.innerHTML = html;
}

function getPackageActions(pkg) {
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        return '<button class="btn btn-primary" data-package-id="' + pkg.id + '" data-action="transit">🚛 Marcar En Tránsito</button>';
    } else if (pkg.status === 'in_transit') {
        return '<button class="btn btn-success" data-package-id="' + pkg.id + '" data-action="delivered">✅ Marcar Entregado</button>';
    }
    return '<button class="btn" data-package-id="' + pkg.id + '" data-action="details">👁️ Ver Detalles</button>';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado', 
        'in transit': 'En Tránsito',
        'delivered': 'Entregado'
    };
    return statusMap[status] || status;
}

function markInTransit(packageId) {
    updatePackageStatus(packageId, {
        status: 'in transit',
        tiempoSalidaReparto: new Date().toISOString()
    });
}

function markDelivered(packageId) {
    const receiverName = prompt('Nombre de quien recibe:');
    if (receiverName) {
        updatePackageStatus(packageId, {
            status: 'delivered',
            tiempoEntrega: new Date().toISOString(),
            nombreQuienRecibio: receiverName,
            pesoEntrega: packages.find(p => p.id === packageId).pesoSalida
        });
    }
}

function viewDetails(packageId) {
    const pkg = packages.find(p => p.id === packageId);
    if (pkg) {
        const details = 'DETALLES DEL PAQUETE\\n\\n' +
            'Tracking: ' + pkg.trackingNumber + '\\n' +
            'Cliente: ' + pkg.cliente + '\\n' +
            'Dirección: ' + pkg.direccion + '\\n' +
            'Estado: ' + getStatusText(pkg.status) + '\\n' +
            'Peso: ' + pkg.pesoSalida + ' kg';
        alert(details);
    }
}

async function updatePackageStatus(packageId, updateData) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(API_BASE + '/packages/' + packageId, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Estado actualizado exitosamente');
            loadPackages();
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        showError('Error actualizando estado: ' + error.message);
    }
}

function showLoading() {
    document.getElementById('packagesContainer').innerHTML = '<div class="loading">Cargando paquetes...</div>';
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = '<div style="background: #fed7d7; color: #c53030; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">⚠️ ' + message + '</div>';
    setTimeout(() => container.innerHTML = '', 5000);
}

function showSuccess(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = '<div style="background: #c6f6d5; color: #22543d; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">✅ ' + message + '</div>';
    setTimeout(() => container.innerHTML = '', 3000);
}

function clearError() {
    document.getElementById('errorContainer').innerHTML = '';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    window.location.href = 'login.html';
}*/