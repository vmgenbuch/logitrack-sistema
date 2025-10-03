const API_BASE = window.API_BASE_URL || '/api';
let currentPackage = null;
let incidentPhotoData = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    loadPendingPackages();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    // Verificar que sea receptor local
    if (user.role !== 'local') {
        alert('No tienes permisos para acceder a esta sección.');
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
}

let cameraStream = null;

// Agregar estos event listeners en setupEventListeners()
function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('searchBtn').addEventListener('click', searchPackage);
    document.getElementById('trackingSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPackage();
    });
    
    // Modal de incidente
    document.getElementById('closeIncidentModal').addEventListener('click', closeIncidentModal);
    document.getElementById('cancelIncidentBtn').addEventListener('click', closeIncidentModal);
    document.getElementById('incidentForm').addEventListener('submit', submitIncident);
    
    // Cámara y foto - NUEVOS LISTENERS
    /*document.getElementById('startCameraBtn').addEventListener('click', startCamera);
    document.getElementById('stopCameraBtn').addEventListener('click', stopCamera);
    document.getElementById('capturePhotoBtn').addEventListener('click', capturePhoto);
    document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
        document.getElementById('incidentPhoto').click();
    });*/
    
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('searchBtn').addEventListener('click', searchPackage);
    document.getElementById('trackingSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPackage();
    });
    
    // Modal de incidente
    document.getElementById('closeIncidentModal').addEventListener('click', closeIncidentModal);
    document.getElementById('cancelIncidentBtn').addEventListener('click', closeIncidentModal);
    document.getElementById('incidentForm').addEventListener('submit', submitIncident);
    
    
}

// Buscar paquete por tracking
async function searchPackage() {
    const trackingNumber = document.getElementById('trackingSearch').value.trim();
    
    if (!trackingNumber) {
        showAlert('Por favor ingresa un número de tracking', 'error');
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE}/packages/tracking/${trackingNumber}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentPackage = data.data;
            displayPackageDetails(currentPackage);
        } else {
            showAlert('Paquete no encontrado', 'error');
        }
    } catch (error) {
        showAlert('Error buscando paquete: ' + error.message, 'error');
    }
}

// Mostrar detalles del paquete
function displayPackageDetails(pkg) {
    const container = document.getElementById('packageDetails');
    
    // Calcular ventana de validación (4 horas desde entrega)
    const validationWindow = calculateValidationWindow(pkg);
    
    let validationHTML = '';
    if (pkg.status === 'delivered') {
        if (validationWindow.canValidate) {
            validationHTML = `
                <div class="validation-window">
                    <strong>⏰ Ventana de Validación Activa</strong>
                    <p>Tienes hasta ${validationWindow.deadline} para validar o reportar incidencias.</p>
                    <p>Tiempo restante: ${validationWindow.timeRemaining}</p>
                </div>
            `;
        } else if (validationWindow.isExpired) {
            validationHTML = `
                <div class="validation-window expired">
                    <strong>⏰ Ventana de Validación Expirada</strong>
                    <p>El plazo para validar este paquete venció el ${validationWindow.deadline}</p>
                </div>
            `;
        }
    }
    
    // Verificar si ya fue validado
    const isValidated = pkg.validacionReceptor?.statusValidacion !== 'pendiente';
    if (isValidated) {
        validationHTML = `
            <div class="validation-window validated">
                <strong>✅ Paquete Validado</strong>
                <p>Estado: ${pkg.validacionReceptor.statusValidacion === 'aprobado' ? 'Aprobado' : 'Incidencia Reportada'}</p>
                ${pkg.validacionReceptor.tipoIncidencia ? `<p>Tipo: ${pkg.validacionReceptor.tipoIncidencia}</p>` : ''}
            </div>
        `;
    }
    
    container.innerHTML = `
        <h2>Detalles del Paquete</h2>
        
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Tracking</div>
                <div class="detail-value">${pkg.trackingNumber}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Cliente</div>
                <div class="detail-value">${pkg.cliente}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Estado</div>
                <div class="detail-value">
                    <span class="status-badge status-${pkg.status}">${getStatusText(pkg.status)}</span>
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Peso Estimado</div>
                <div class="detail-value">${pkg.pesoEstimado || 'N/A'} kg</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Peso Entregado</div>
                <div class="detail-value">${pkg.pesoEntrega || 'N/A'} kg</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Recibido por</div>
                <div class="detail-value">${pkg.nombreQuienRecibio || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Fecha Entrega</div>
                <div class="detail-value">${pkg.tiempoEntrega ? safeFormatDateTime(pkg.tiempoEntrega) : 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Efectividad</div>
                <div class="detail-value">${pkg.efectividad || 'N/A'}%</div>
            </div>
        </div>
        
        ${validationHTML}
        
        <div class="action-buttons">
            ${pkg.status === 'delivered' && validationWindow.canValidate && !isValidated ? `
                <button class="btn btn-success" id="approvePackageBtn">
                <button class="btn btn-danger" id="openIncidentBtn">
            ` : ''}
            ${pkg.status !== 'delivered' ? `
                <button class="btn btn-danger" onclick="openIncidentModal()">⚠️ Reportar No Recibido</button>
            ` : ''}
        </div>
    `;

    // Al final de displayPackageDetails(), antes del último }
    const approveBtn = document.getElementById('approvePackageBtn');
    const incidentBtn = document.getElementById('openIncidentBtn');

    if (approveBtn) {
       approveBtn.addEventListener('click', approvePackage);
    }
    if (incidentBtn) {
       incidentBtn.addEventListener('click', openIncidentModal);
  }
    
    container.classList.add('active');
}

// Calcular ventana de validación
function calculateValidationWindow(pkg) {
    if (!pkg.tiempoEntrega) {
        return {
            canValidate: false,
            isExpired: false,
            deadline: null,
            timeRemaining: null
        };
    }
    
    const deliveryTime = safeParseDate(pkg.tiempoEntrega);
    const now = new Date();
    const fourHoursLater = new Date(deliveryTime.getTime() + (4 * 60 * 60 * 1000));
    
    const canValidate = now < fourHoursLater;
    const isExpired = now >= fourHoursLater;
    
    let timeRemaining = '';
    if (canValidate) {
        const diffMs = fourHoursLater - now;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeRemaining = `${hours}h ${minutes}m`;
    }
    
    return {
        canValidate,
        isExpired,
        deadline: fourHoursLater.toLocaleString('es-MX'),
        timeRemaining
    };
}

// Aprobar paquete
async function approvePackage() {
    if (!currentPackage) return;
    
    if (!confirm('¿Confirmas que el paquete fue recibido correctamente sin incidencias?')) {
        return;
    }
    
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    const validationData = {
        validacionReceptor: {
            fechaValidacion: new Date().toISOString(),
            receptorLocal: user.fullName || user.username,
            statusValidacion: 'aprobado',
            tipoIncidencia: null,
            descripcionIncidencia: null,
            fotoIncidencia: null,
            severidad: null,
            requiereDevolucion: false
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(validationData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('✅ Paquete aprobado exitosamente', 'success');
            currentPackage = data.data;
            displayPackageDetails(currentPackage);
            loadPendingPackages();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showAlert('Error aprobando paquete: ' + error.message, 'error');
    }
}

// Abrir modal de incidente
function openIncidentModal() {
    if (!currentPackage) return;
    
    // Verificar ventana de validación solo si está entregado
    if (currentPackage.status === 'delivered') {
        const validationWindow = calculateValidationWindow(currentPackage);
        if (!validationWindow.canValidate) {
            showAlert('La ventana de validación (4 horas) ha expirado', 'error');
            return;
        }
    }
    
    document.getElementById('incidentModal').classList.add('active');

    // Agregar event listeners de cámara DESPUÉS de abrir el modal
    document.getElementById('startCameraBtn').addEventListener('click', startCamera);
    document.getElementById('stopCameraBtn').addEventListener('click', stopCamera);
    document.getElementById('capturePhotoBtn').addEventListener('click', capturePhoto);
    document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
        document.getElementById('incidentPhoto').click();
    });

    document.getElementById('incidentPhoto').addEventListener('change', handlePhotoUpload);
}

// Iniciar cámara
async function startCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' },
            audio: false 
        });
        
        const video = document.getElementById('cameraPreview');
        video.srcObject = cameraStream;
        document.getElementById('cameraContainer').style.display = 'block';
        
    } catch (error) {
        showAlert('No se pudo acceder a la cámara: ' + error.message, 'error');
    }
}

// Capturar foto
function capturePhoto() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('photoCanvas');
    const preview = document.getElementById('photoPreview');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    incidentPhotoData = canvas.toDataURL('image/jpeg', 0.8);
    
    preview.src = incidentPhotoData;
    preview.style.display = 'block';
    
    stopCamera();
    showAlert('Foto capturada exitosamente', 'success');
}

// Detener cámara
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById('cameraContainer').style.display = 'none';
}

function closeIncidentModal() {
    document.getElementById('incidentModal').classList.remove('active');
    document.getElementById('incidentForm').reset();
    document.getElementById('photoPreview').style.display = 'none';
    stopCamera(); // Detener cámara si está activa
    incidentPhotoData = null;
}

// Manejar foto de incidente
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        incidentPhotoData = e.target.result;
        document.getElementById('photoPreview').src = incidentPhotoData;
        document.getElementById('photoPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// Enviar incidente
async function submitIncident(e) {
    e.preventDefault();
    
    if (!currentPackage) return;
    
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    const incidentType = document.getElementById('incidentType').value;
    const severidad = document.getElementById('severidad').value;
    const description = document.getElementById('incidentDescription').value;

    // Si NO hay ID de paquete, crear incidente independiente
    if (!currentPackage.id) {
        const incidentData = {
            trackingNumber: currentPackage.trackingNumber,
            packageId: null,
            type: incidentType,
            severity: severidad,
            description: description,
            photo: incidentPhotoData,
            reportedBy: user.fullName || user.username,
            branchId: user.id,  // ✅ Usar user.id en lugar de user.branchId
            branchName: user.sucursal || 'Sin Sucursal', 
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        try {
            const response = await fetch(`${API_BASE}/incidents`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(incidentData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('⚠️ Incidente reportado exitosamente', 'success');
                closeIncidentModal();
                document.getElementById('incidentTrackingInput').value = '';
                loadPendingPackages();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            showAlert('Error reportando incidente: ' + error.message, 'error');
        }
        return;
    }
    
    const validationData = {
        validacionReceptor: {
            fechaValidacion: new Date().toISOString(),
            receptorLocal: user.fullName || user.username,
            statusValidacion: 'incidencia',
            tipoIncidencia: incidentType,
            descripcionIncidencia: description,
            fotoIncidencia: incidentPhotoData,
            severidad: severidad,
            requiereDevolucion: severidad === 'alta',
            incidenciaResuelta: false,
            fechaResolucion: null,
            comentariosResolucion: null
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(validationData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('⚠️ Incidente reportado exitosamente', 'success');
            closeIncidentModal();
            currentPackage = data.data;
            displayPackageDetails(currentPackage);
            loadPendingPackages();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showAlert('Error reportando incidente: ' + error.message, 'error');
    }
}

// Cargar paquetes pendientes de validación
async function loadPendingPackages() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    try {
        const response = await fetch(`${API_BASE}/packages`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Filtrar solo paquetes entregados y pendientes de validación
            const pendingPackages = data.data.packages.filter(pkg => {
                const isDelivered = pkg.status === 'delivered';
                const isPending = pkg.validacionReceptor?.statusValidacion === 'pendiente';
                const window = calculateValidationWindow(pkg);
                return isDelivered && isPending && window.canValidate;
            });
            
            displayPendingPackages(pendingPackages);
        }
    } catch (error) {
        console.error('Error cargando paquetes:', error);
    }
}

function displayPendingPackages(packages) {
    const container = document.getElementById('pendingList');
    
    if (packages.length === 0) {
        container.innerHTML = '<p style="color: #718096;">No hay paquetes pendientes de validación</p>';
        return;
    }
    
    container.innerHTML = packages.map(pkg => {
        const window = calculateValidationWindow(pkg);
        return `
            <div class="pending-item" data-package-id="${pkg.id}">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${pkg.trackingNumber}</strong>
                        <p style="color: #718096; margin-top: 0.25rem;">
                            ${pkg.cliente} - ${pkg.direccion.substring(0, 50)}...
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge status-pending">Pendiente</span>
                        <p style="color: #dd6b20; font-size: 0.9rem; margin-top: 0.5rem;">
                            ⏰ ${window.timeRemaining} restantes
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Agregar event listeners después de crear el HTML
    document.querySelectorAll('.pending-item').forEach(item => {
        item.addEventListener('click', function() {
            const packageId = this.dataset.packageId;
            selectPendingPackage(packageId);
        });
    });

}

async function selectPendingPackage(packageId) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE}/packages/${packageId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentPackage = data.data;
            document.getElementById('trackingSearch').value = currentPackage.trackingNumber;
            displayPackageDetails(currentPackage);
            
            // Scroll al detalle del paquete
            document.getElementById('packageDetails').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }
    } catch (error) {
        showAlert('Error cargando paquete: ' + error.message, 'error');
    }
}

// Helpers
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

function showAlert(message, type) {
    const container = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : 
                      type === 'error' ? 'alert-error' : 'alert-warning';
    
    container.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

// Botón para abrir modal de incidente sin buscar paquete
document.getElementById('reportNewIncidentBtn')?.addEventListener('click', () => {
    const trackingInput = document.getElementById('incidentTrackingInput').value.trim();
    
    // Configurar modal para incidente sin paquete específico
    currentPackage = {
        trackingNumber: trackingInput || 'Sin tracking',
        cliente: 'No especificado',
        direccion: 'No especificado',
        status: trackingInput ? 'unknown' : 'no_recibido'
    };
    
    // Abrir modal de incidente
    document.getElementById('incidentModal').classList.add('active');
    
    // Pre-seleccionar tipo "no_recibido" si no hay tracking
    if (!trackingInput) {
        document.getElementById('incidentType').value = 'no_recibido';
    }

    // Agregar event listeners de cámara DESPUÉS de abrir el modal
    setupCameraListeners();
});

function setupCameraListeners() {
    document.getElementById('startCameraBtn')?.addEventListener('click', startCamera);
    document.getElementById('stopCameraBtn')?.addEventListener('click', stopCamera);
    document.getElementById('capturePhotoBtn')?.addEventListener('click', capturePhoto);
    document.getElementById('uploadPhotoBtn')?.addEventListener('click', () => {
        document.getElementById('incidentPhoto').click();
    });
    document.getElementById('incidentPhoto')?.addEventListener('change', handlePhotoUpload);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    window.location.href = 'login.html';
}