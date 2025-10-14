const API_BASE = window.API_BASE_URL || '/api';
let currentPackage = null;
let incidentPhotoData = null;

// ✅ AGREGAR ESTA FUNCIÓN DE MAPEO
function mapPackageFromAPI(pkg) {
    if (!pkg) return null;
    
    return {
        ...pkg,
        // Mapear snake_case a camelCase
        trackingNumber: pkg.tracking_number,
        pesoEstimado: pkg.peso_estimado,
        pesoSalida: pkg.peso_salida,
        pesoEntrega: pkg.peso_entrega,
        fechaCreacion: pkg.fecha_creacion,
        tiempoSalidaReparto: pkg.tiempo_salida_reparto,
        tiempoEntrega: pkg.tiempo_entrega,
        diferenciaPeso: pkg.diferencia_peso,
        nombreQuienRecibio: pkg.nombre_quien_recibio,
        cargoQuienRecibio: pkg.cargo_quien_recibio,
        fotoSalida: pkg.foto_salida,
        fotoEntrega: pkg.foto_entrega,
        firmaDigital: pkg.firma_digital,
        sucursalDestino: pkg.sucursal_destino,
        
        // Mapear validacion_receptor (CRÍTICO)
        validacionReceptor: pkg.validacion_receptor ? {
            fechaValidacion: pkg.validacion_receptor.fechaValidacion,
            receptorLocal: pkg.validacion_receptor.receptorLocal,
            statusValidacion: pkg.validacion_receptor.statusValidacion || 'pendiente',
            tipoIncidencia: pkg.validacion_receptor.tipoIncidencia,
            descripcionIncidencia: pkg.validacion_receptor.descripcionIncidencia,
            fotoIncidencia: pkg.validacion_receptor.fotoIncidencia,
            severidad: pkg.validacion_receptor.severidad,
            requiereDevolucion: pkg.validacion_receptor.requiereDevolucion
        } : {
            statusValidacion: 'pendiente'
        }
    };
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    loadPendingPackages();
    loadMyIncidents();
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
        const response = await fetch(`${API_BASE}/packages/${trackingNumber}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentPackage = mapPackageFromAPI(data.data);
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
                <button class="btn btn-success" id="approvePackageBtn">✅ Aprobar Recepción</button>
                <button class="btn btn-danger" id="openIncidentBtn">⚠️ Reportar Incidencia</button>
            ` : ''}
            ${pkg.status !== 'delivered' ? `
                <button class="btn btn-danger" id="openIncidentBtnNotDelivered">⚠️ Reportar No Recibido</button>
            ` : ''}
        </div>
    `;

    const approveBtn = document.getElementById('approvePackageBtn');
    const incidentBtn = document.getElementById('openIncidentBtn');
    const incidentBtnNotDelivered = document.getElementById('openIncidentBtnNotDelivered');

    if (approveBtn) {
       approveBtn.addEventListener('click', approvePackage);
    }
    if (incidentBtn) {
       incidentBtn.addEventListener('click', openIncidentModal);
    }
    if (incidentBtnNotDelivered) {
       incidentBtnNotDelivered.addEventListener('click', openIncidentModal);
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
            currentPackage = mapPackageFromAPI(data.data);
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
    stopCamera();
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

    // ✅ PASO 1: SIEMPRE crear registro en tabla incidents
    const incidentData = {
        trackingNumber: currentPackage.trackingNumber || 'Sin tracking',
        packageId: currentPackage.id || null,
        type: incidentType,
        severity: severidad,
        description: description,
        photo: incidentPhotoData,
        reportedBy: user.fullName || user.username,
        branchId: user.id,
        branchName: user.sucursal || user.fullName || 'Sin Sucursal', 
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    try {
        // Crear incidente en tabla incidents
        const incidentResponse = await fetch(`${API_BASE}/incidents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(incidentData)
        });
        
        const incidentResult = await incidentResponse.json();
        
        if (!incidentResult.success) {
            throw new Error(incidentResult.message || 'Error creando incidente');
        }
        
        // ✅ PASO 2: Si existe el paquete, TAMBIÉN actualizar validacion_receptor
        if (currentPackage.id) {
            const validationData = {
                validacion_receptor: {
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
                    comentariosResolucion: null,
                    incidentId: incidentResult.data.id
                }
            };
            
            const packageResponse = await fetch(`${API_BASE}/packages/${currentPackage.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(validationData)
            });
            
            const packageResult = await packageResponse.json();
            
            if (packageResult.success) {
                currentPackage = mapPackageFromAPI(packageResult.data);
                displayPackageDetails(currentPackage);
            }
        }
        
        // ✅ Éxito
        showAlert('⚠️ Incidente reportado exitosamente', 'success');
        closeIncidentModal();
        
        // Limpiar búsqueda si no había paquete
        if (!currentPackage.id) {
            document.getElementById('incidentTrackingInput').value = '';
        }
        
        loadPendingPackages();
        loadMyIncidents();
        
    } catch (error) {
        console.error('Error reportando incidente:', error);
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
            const pendingPackages = (data.data.packages || []).map(mapPackageFromAPI).filter(pkg => {
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
            currentPackage = mapPackageFromAPI(data.data);
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

// ==========================================
// ✅ FUNCIONES NUEVAS PARA MIS INCIDENTES
// ==========================================

// Cargar incidentes reportados por el local
async function loadMyIncidents() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    try {
        const response = await fetch(`${API_BASE}/incidents?reportedBy=${encodeURIComponent(user.fullName || user.username)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const incidents = Array.isArray(data.data) ? data.data : (data.data?.incidents || []);
            displayMyIncidents(incidents);
        }
    } catch (error) {
        console.error('Error cargando mis incidentes:', error);
    }
}

function displayMyIncidents(incidents) {
    const container = document.getElementById('myIncidentsList');
    
    if (!container) return; // Si no existe el contenedor, salir
    
    if (incidents.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #718096;">
                <div style="font-size: 3rem; margin-bottom: 10px;">✅</div>
                <p style="font-size: 1.1rem; margin: 0;">No has reportado incidentes</p>
                <p style="font-size: 0.9rem; margin-top: 5px;">Cuando reportes un incidente, aparecerá aquí</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = incidents.map(incident => {
        const statusLabels = {
            'pending': 'Pendiente',
            'in_progress': 'En Proceso',
            'resolved': 'Resuelto'
        };
        
        const typeLabels = {
            'producto_dañado': 'Producto Dañado',
            'producto_incompleto': 'Producto Incompleto',
            'mal_estado': 'Mal Estado',
            'no_corresponde': 'No Corresponde',
            'no_recibido': 'No Recibido',
            'otro': 'Otro'
        };
        
        const status = incident.status || 'pending';
        const statusText = statusLabels[status] || 'Pendiente';
        const statusClass = status.replace(/_/g, '-');
        
        const severity = (incident.severity || 'baja').toLowerCase();
        const typeText = typeLabels[incident.type] || incident.type || 'Incidente';
        
        const createdAt = new Date(incident.created_at || Date.now())
            .toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
        
        const commentsCount = Array.isArray(incident.comments) ? incident.comments.length : 0;
        const tracking = incident.tracking_number || 'Sin tracking';
        
        return `
            <div class="incident-card" data-incident-id="${incident.id}">
                <div class="incident-header">
                    <div class="incident-info">
                        <h3>${typeText}</h3>
                        <div class="incident-meta">
                            <span>📦 ${tracking}</span>
                            <span>📅 ${createdAt}</span>
                        </div>
                    </div>
                    <div class="incident-status">
                        <span class="status-badge status-${statusClass}">${statusText}</span>
                        <span class="severity-badge severity-${severity}">Severidad: ${severity.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="incident-description">
                    ${incident.description || 'Sin descripción'}
                </div>
                
                <div class="incident-footer">
                    <div class="incident-comments">
                        ${commentsCount > 0 ? `💬 ${commentsCount} comentario${commentsCount !== 1 ? 's' : ''} del supervisor` : '⏳ Sin respuesta aún'}
                    </div>
                    <div class="incident-date">
                        ${status === 'resolved' && incident.resolved_at 
                            ? `Resuelto: ${new Date(incident.resolved_at).toLocaleString('es-MX', { timeZone: 'America/Monterrey' })}`
                            : 'En seguimiento'}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Agregar event listeners a las tarjetas
    document.querySelectorAll('.incident-card').forEach(card => {
        card.addEventListener('click', function() {
            const incidentId = this.dataset.incidentId;
            viewIncidentDetail(incidentId);
        });
    });
}

// Ver detalle de un incidente
async function viewIncidentDetail(incidentId) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showIncidentDetailModal(data.data);
        }
    } catch (error) {
        console.error('Error cargando detalle del incidente:', error);
        showAlert('Error al cargar el detalle del incidente', 'error');
    }
}

function showIncidentDetailModal(incident) {
    const statusLabels = {
        'pending': 'Pendiente',
        'in_progress': 'En Proceso',
        'resolved': 'Resuelto'
    };
    
    const typeLabels = {
        'producto_dañado': 'Producto Dañado',
        'producto_incompleto': 'Producto Incompleto',
        'mal_estado': 'Mal Estado',
        'no_corresponde': 'No Corresponde',
        'no_recibido': 'No Recibido',
        'otro': 'Otro'
    };
    
    const status = incident.status || 'pending';
    const statusText = statusLabels[status] || 'Pendiente';
    const statusClass = status.replace(/_/g, '-');
    const typeText = typeLabels[incident.type] || 'Incidente';
    const severity = (incident.severity || 'baja').toLowerCase();
    
    const createdAt = new Date(incident.created_at || Date.now())
        .toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
    
    const resolvedAt = incident.resolved_at 
        ? new Date(incident.resolved_at).toLocaleString('es-MX', { timeZone: 'America/Monterrey' })
        : null;
    
    const comments = Array.isArray(incident.comments) ? incident.comments : [];
    
    // Crear modal si no existe
    let modal = document.getElementById('incidentDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'incidentDetailModal';
        modal.className = 'incident-detail-modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="incident-detail-content">
            <button class="close-detail" id="closeIncidentDetailBtn">×</button>
            
            <div style="margin-bottom: 20px;">
                <h2 style="color: white; margin: 0 0 10px 0;">${typeText}</h2>
                <div style="display: flex; gap: 10px;">
                    <span class="status-badge status-${statusClass}">${statusText}</span>
                    <span class="severity-badge severity-${severity}">Severidad: ${severity.toUpperCase()}</span>
                </div>
            </div>
            
            <div class="detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                <div>
                    <div style="color: #a0aec0; font-size: 0.85rem; margin-bottom: 5px;">📦 TRACKING</div>
                    <div style="color: white; font-weight: 600;">${incident.tracking_number || 'Sin tracking'}</div>
                </div>
                <div>
                    <div style="color: #a0aec0; font-size: 0.85rem; margin-bottom: 5px;">📅 FECHA REPORTE</div>
                    <div style="color: white; font-weight: 600;">${createdAt}</div>
                </div>
                ${resolvedAt ? `
                <div>
                    <div style="color: #a0aec0; font-size: 0.85rem; margin-bottom: 5px;">✅ FECHA RESOLUCIÓN</div>
                    <div style="color: white; font-weight: 600;">${resolvedAt}</div>
                </div>
                ` : ''}
            </div>
            
            <div style="background: rgba(0, 0, 0, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: white; margin: 0 0 10px 0;">📝 Descripción</h3>
                <p style="color: #cbd5e0; line-height: 1.6; margin: 0;">${incident.description || 'Sin descripción'}</p>
            </div>
            
            ${incident.photo ? `
            <div style="margin-bottom: 20px;">
                <h3 style="color: white; margin: 0 0 10px 0;">📸 Evidencia</h3>
                <img id="incidentPhotoDetail" src="${incident.photo}" alt="Evidencia" 
                     style="max-width: 100%; border-radius: 12px; cursor: pointer;">
            </div>
            ` : ''}
            
            <div class="comments-section">
                <h3 style="color: white; margin: 0 0 15px 0;">💬 Seguimiento del Supervisor</h3>
                ${comments.length > 0 ? comments.map(comment => `
                    <div class="comment-item">
                        <div class="comment-header">
                            <span class="comment-author">👤 ${comment.author || 'Supervisor'}</span>
                            <span class="comment-date">${new Date(comment.created_at || Date.now()).toLocaleString('es-MX', { timeZone: 'America/Monterrey' })}</span>
                        </div>
                        <div class="comment-text">${comment.text || comment.comment || ''}</div>
                    </div>
                `).join('') : `
                    <p style="color: #a0aec0; text-align: center; padding: 20px;">
                        ${status === 'resolved' 
                            ? 'Incidente resuelto sin comentarios adicionales' 
                            : '⏳ El supervisor aún no ha agregado comentarios'}
                    </p>
                `}
            </div>
            
            ${status === 'resolved' ? `
            <div style="background: rgba(16, 185, 129, 0.2); border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 10px;">✅</div>
                <div style="color: #10b981; font-size: 1.1rem; font-weight: 600;">Incidente Resuelto</div>
                <div style="color: #cbd5e0; font-size: 0.9rem; margin-top: 5px;">Este incidente ha sido marcado como resuelto por el supervisor</div>
            </div>
            ` : ''}
        </div>
    `;
    
    modal.classList.add('active');
    
    // Agregar event listener al botón de cerrar
    document.getElementById('closeIncidentDetailBtn').addEventListener('click', closeIncidentDetailModal);
    
    // Agregar event listener a la foto si existe
    const photoImg = document.getElementById('incidentPhotoDetail');
    if (photoImg) {
        photoImg.addEventListener('click', function() {
            window.open(incident.photo, '_blank');
        });
    }
}

function closeIncidentDetailModal() {
    const modal = document.getElementById('incidentDetailModal');
    if (modal) {
        modal.classList.remove('active');
    }
}