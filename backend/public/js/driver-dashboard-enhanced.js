const API_BASE = window.API_BASE_URL || '/api';
let packages = [];
let currentPackage = null;
let cameraStream = null;
let signaturePad = null;

// Arrays para almacenar múltiples fotos con sus pesos
let pickupPhotos = []; // [{photoData, weight, timestamp}]
let deliveryPhotos = []; // [{photoData, weight, timestamp}]

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    initSignaturePad();
    loadPackages();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', loadPackages);
}

function setupPickupModalListeners() {
    const closeBtn = document.getElementById('closePickupBtn');
    const cancelBtn = document.getElementById('cancelPickupBtn');
    const confirmBtn = document.getElementById('confirmPickupBtn');
    const startCameraBtn = document.getElementById('startPickupCamera');
    const capturePhotoBtn = document.getElementById('capturePickupPhoto');
    const stopCameraBtn = document.getElementById('stopPickupCamera');
    
    if (closeBtn) closeBtn.addEventListener('click', closePickupModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closePickupModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmPickup);
    if (startCameraBtn) startCameraBtn.addEventListener('click', () => startCamera('pickup'));
    if (capturePhotoBtn) capturePhotoBtn.addEventListener('click', () => capturePhoto('pickup'));
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', () => stopCamera('pickup'));
}

function setupDeliveryModalListeners() {
    const closeBtn = document.getElementById('closeDeliveryBtn');
    const cancelBtn = document.getElementById('cancelDeliveryBtn');
    const confirmBtn = document.getElementById('confirmDeliveryBtn');
    const startCameraBtn = document.getElementById('startDeliveryCamera');
    const capturePhotoBtn = document.getElementById('captureDeliveryPhoto');
    const stopCameraBtn = document.getElementById('stopDeliveryCamera');
    const clearSigBtn = document.getElementById('clearSignatureBtn');
    
    if (closeBtn) closeBtn.addEventListener('click', closeDeliveryModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeliveryModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmDelivery);
    if (startCameraBtn) startCameraBtn.addEventListener('click', () => startCamera('delivery'));
    if (capturePhotoBtn) capturePhotoBtn.addEventListener('click', () => capturePhoto('delivery'));
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', () => stopCamera('delivery'));
    if (clearSigBtn) clearSigBtn.addEventListener('click', clearSignature);
}

// ===== GESTIÓN DE PAQUETES =====
async function loadPackages() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showError('No hay token de autenticación');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/packages/my-assignments`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            packages = (data.data.packages || []).map(mapPackageFromAPI);
            console.log(`Paquetes cargados: ${packages.length}`);
            updateStatistics();
            displayPackages();
            clearError();
        } else {
            throw new Error(data.message || 'Error cargando paquetes');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('Error cargando paquetes: ' + error.message);
    }
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
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: #718096;"><h3>No hay paquetes asignados a tu ruta</h3></div>';
        return;
    }
    
    let html = '';
    packages.forEach(pkg => {
        const statusClass = pkg.status.replace('_', '-').replace(' ', '-');
        const statusText = getStatusText(pkg.status);
        
        html += `
            <div class="package-card">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h3>${pkg.trackingNumber}</h3>
                        <p style="color: #718096; margin-top: 0.5rem;">${pkg.cliente}</p>
                        <p style="color: #718096;">${pkg.direccion}</p>
                    </div>
                    <span class="status-badge status-${statusClass}">${statusText}</span>
                </div>
                
                <div style="display: flex; gap: 2rem; margin-bottom: 1rem; color: #718096;">
                    <div><strong>Peso:</strong> ${pkg.pesoSalida || pkg.pesoEstimado || 'N/A'} kg</div>
                    <div><strong>Prioridad:</strong> ${getPriorityText(pkg.prioridad)}</div>
                </div>
                
                ${getPackageActions(pkg)}
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    setupPackageButtonListeners();
}

function setupPackageButtonListeners() {
    document.querySelectorAll('.btn-pickup').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const packageId = e.target.dataset.packageId;
            openPickupModal(packageId);
        });
    });
    
    document.querySelectorAll('.btn-deliver').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const packageId = e.target.dataset.packageId;
            openDeliveryModal(packageId);
        });
    });
}

function getPackageActions(pkg) {
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        return `<button class="btn btn-primary btn-pickup" data-package-id="${pkg.id}">📦 Recoger Paquete</button>`;
    } else if (pkg.status === 'in_transit' || pkg.status === 'in transit') {
        return `<button class="btn btn-success btn-deliver" data-package-id="${pkg.id}">✅ Entregar Paquete</button>`;
    } else if (pkg.status === 'delivered') {
        return `
            <div class="evidence-preview">
                ${pkg.fotoEntrega ? `<div class="evidence-item"><img src="${pkg.fotoEntrega}" alt="Foto entrega"></div>` : ''}
                ${pkg.firmaDigital ? `<div class="evidence-item"><img src="${pkg.firmaDigital}" alt="Firma"></div>` : ''}
            </div>
            <small style="color: #718096;">Entregado a: ${pkg.nombreQuienRecibio || 'N/A'}</small>
        `;
    }
    return '';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado',
        'in_transit': 'En Tránsito',
        'in transit': 'En Tránsito',
        'delivered': 'Entregado'
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

// ===== MODAL: RECOGER PAQUETE =====
function openPickupModal(packageId) {
    currentPackage = packages.find(p => p.id === packageId);
    if (!currentPackage) return;
    
    // Reset photos array
    pickupPhotos = [];
    
    const pesoInicial = currentPackage.pesoEstimado || currentPackage.pesoSalida || 0;
    
    document.getElementById('pickupInfo').innerHTML = `
        <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <strong>${currentPackage.trackingNumber}</strong><br>
            Cliente: ${currentPackage.cliente}<br>
            Peso estimado: ${pesoInicial} kg
        </div>
    `;
    
    document.getElementById('pickupPhotosContainer').innerHTML = '';
    document.getElementById('pickupModal').classList.add('active');
    
    setupPickupModalListeners();
}

function closePickupModal() {
    document.getElementById('pickupModal').classList.remove('active');
    stopCamera('pickup');
    resetPickupForm();
}

function resetPickupForm() {
    pickupPhotos = [];
    document.getElementById('pickupPhotosContainer').innerHTML = '';
}

// ===== CAPTURA DE FOTOS CON PESO =====
async function startCamera(type) {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' },
            audio: false 
        });
        
        const videoElement = document.getElementById(`${type}CameraPreview`);
        videoElement.srcObject = cameraStream;
        document.getElementById(`${type}CameraContainer`).style.display = 'block';
        
    } catch (error) {
        alert('No se pudo acceder a la cámara: ' + error.message);
    }
}

function capturePhoto(type) {
    const video = document.getElementById(`${type}CameraPreview`);
    const canvas = document.getElementById(`${type}Canvas`);
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Solicitar el peso para esta foto
    const weight = prompt('Ingresa el peso mostrado en la báscula para esta foto (kg):');
    
    if (weight === null) {
        // Usuario canceló
        return;
    }
    
    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 0) {
        alert('Por favor ingresa un peso válido');
        return;
    }
    
    // Agregar foto al array correspondiente
    const photoObj = {
        photoData: photoData,
        weight: weightNum,
        timestamp: new Date().toISOString()
    };
    
    if (type === 'pickup') {
        pickupPhotos.push(photoObj);
        displayPickupPhotos();
    } else {
        deliveryPhotos.push(photoObj);
        displayDeliveryPhotos();
    }
    
    stopCamera(type);
}

function displayPickupPhotos() {
    const container = document.getElementById('pickupPhotosContainer');
    
    if (pickupPhotos.length === 0) {
        container.innerHTML = '<p style="color: #718096; text-align: center;">No hay fotos capturadas</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">';
    
    pickupPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-card">
                <img src="${photo.photoData}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                <div style="padding: 0.5rem; background: #f7fafc; margin-top: 0.5rem; border-radius: 4px;">
                    <strong>Peso: ${photo.weight} kg</strong>
                    <button class="btn-delete-photo" data-type="pickup" data-index="${index}" 
                            style="float: right; background: #ef4444; color: white; border: none; 
                            padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Event listeners para eliminar fotos
    document.querySelectorAll('.btn-delete-photo[data-type="pickup"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deletePhoto('pickup', index);
        });
    });
}

function displayDeliveryPhotos() {
    const container = document.getElementById('deliveryPhotosContainer');
    
    if (deliveryPhotos.length === 0) {
        container.innerHTML = '<p style="color: #718096; text-align: center;">No hay fotos capturadas</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">';
    
    deliveryPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-card">
                <img src="${photo.photoData}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                <div style="padding: 0.5rem; background: #f7fafc; margin-top: 0.5rem; border-radius: 4px;">
                    <strong>Peso: ${photo.weight} kg</strong>
                    <button class="btn-delete-photo" data-type="delivery" data-index="${index}" 
                            style="float: right; background: #ef4444; color: white; border: none; 
                            padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Event listeners para eliminar fotos
    document.querySelectorAll('.btn-delete-photo[data-type="delivery"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deletePhoto('delivery', index);
        });
    });
}

function deletePhoto(type, index) {
    if (!confirm('¿Estás seguro de eliminar esta foto?')) {
        return;
    }
    
    if (type === 'pickup') {
        pickupPhotos.splice(index, 1);
        displayPickupPhotos();
    } else {
        deliveryPhotos.splice(index, 1);
        displayDeliveryPhotos();
    }
}

function stopCamera(type) {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById(`${type}CameraContainer`).style.display = 'none';
}

async function confirmPickup() {
    if (pickupPhotos.length === 0) {
        if (!confirm('¿Deseas continuar sin fotos del paquete en la báscula?')) {
            return;
        }
    }
    
    // ✅ CORREGIDO: Enviar fotos directamente al nuevo endpoint
    const token = localStorage.getItem('token');
    const updateData = {
        fotosBascula: pickupPhotos // Array de fotos con pesos
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}/pickup-photos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            const result = await response.json();
            const pesoTotal = result.data.peso_salida;
            showSuccess(`Paquete recogido exitosamente. Peso total: ${pesoTotal} kg (${pickupPhotos.length} fotos)`);
            closePickupModal();
            await loadPackages();
        } else {
            throw new Error('Error al actualizar paquete');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ===== MODAL: ENTREGAR PAQUETE =====
function openDeliveryModal(packageId) {
    currentPackage = packages.find(p => p.id === packageId);
    if (!currentPackage) return;
    
    // Reset photos array
    deliveryPhotos = [];
    
    document.getElementById('deliveryInfo').innerHTML = `
        <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <strong>${currentPackage.trackingNumber}</strong><br>
            Cliente: ${currentPackage.cliente}<br>
            Dirección: ${currentPackage.direccion}<br>
            Peso salida: ${currentPackage.pesoSalida} kg
        </div>
    `;
    
    document.getElementById('deliveryPhotosContainer').innerHTML = '';
    document.getElementById('deliveryModal').classList.add('active');
    
    setupDeliveryModalListeners();
}

function closeDeliveryModal() {
    document.getElementById('deliveryModal').classList.remove('active');
    stopCamera('delivery');
    clearSignature();
    resetDeliveryForm();
}

function resetDeliveryForm() {
    document.getElementById('receiverName').value = '';
    document.getElementById('receiverPosition').value = '';
    deliveryPhotos = [];
    document.getElementById('deliveryPhotosContainer').innerHTML = '';
}

async function confirmDelivery() {
    const receiverName = document.getElementById('receiverName').value;
    const receiverPosition = document.getElementById('receiverPosition').value;
    
    if (!receiverName) {
        alert('Por favor ingresa el nombre de quien recibe');
        return;
    }
    
    if (deliveryPhotos.length === 0) {
        if (!confirm('¿Deseas continuar sin fotos de entrega?')) {
            return;
        }
    }
    
    const signatureData = signaturePad.toDataURL();
    if (isCanvasBlank(signaturePad.canvas)) {
        alert('Por favor captura la firma del receptor');
        return;
    }
    
    // ✅ CORREGIDO: Enviar fotos directamente al nuevo endpoint
    const token = localStorage.getItem('token');
    const updateData = {
        fotosEntrega: deliveryPhotos, // Array de fotos con pesos
        nombreQuienRecibio: receiverName,
        cargoQuienRecibio: receiverPosition,
        firmaDigital: signatureData
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}/delivery-photos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            const result = await response.json();
            const pesoTotal = result.data.peso_entrega;
            showSuccess(`Paquete entregado exitosamente. Peso total: ${pesoTotal} kg (${deliveryPhotos.length} fotos)`);
            closeDeliveryModal();
            await loadPackages();
        } else {
            throw new Error('Error al actualizar paquete');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ===== FIRMA DIGITAL =====
function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    const ctx = canvas.getContext('2d');
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    signaturePad = {
        canvas: canvas,
        ctx: ctx,
        toDataURL: () => canvas.toDataURL('image/png')
    };
    
    function startDrawing(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        [lastX, lastY] = getCoordinates(e, rect);
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const [x, y] = getCoordinates(e, rect);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        [lastX, lastY] = [x, y];
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    function getCoordinates(e, rect) {
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        return [x, y];
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e);
    });
    canvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
    if (signaturePad) {
        signaturePad.ctx.clearRect(0, 0, signaturePad.canvas.width, signaturePad.canvas.height);
    }
}

function isCanvasBlank(canvas) {
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    for (let i = 0; i < pixelData.length; i += 4) {
        if (pixelData[i + 3] !== 0) {
            return false;
        }
    }
    return true;
}

// ===== UI HELPERS =====
function showLoading() {
    document.getElementById('packagesContainer').innerHTML = '<div style="text-align: center; padding: 2rem;">Cargando paquetes...</div>';
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `<div class="alert alert-error">${message}</div>`;
    setTimeout(() => container.innerHTML = '', 5000);
}

function showSuccess(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `<div class="alert alert-success">${message}</div>`;
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

/*const API_BASE = window.API_BASE_URL || '/api';
let packages = [];
let currentPackage = null;
let cameraStream = null;
let signaturePad = null;

// Arrays para almacenar múltiples fotos con sus pesos
let pickupPhotos = []; // [{photoData, weight, timestamp}]
let deliveryPhotos = []; // [{photoData, weight, timestamp}]

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    initSignaturePad();
    loadPackages();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = user.fullName || user.username;
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshBtn').addEventListener('click', loadPackages);
}

function setupPickupModalListeners() {
    const closeBtn = document.getElementById('closePickupBtn');
    const cancelBtn = document.getElementById('cancelPickupBtn');
    const confirmBtn = document.getElementById('confirmPickupBtn');
    const startCameraBtn = document.getElementById('startPickupCamera');
    const capturePhotoBtn = document.getElementById('capturePickupPhoto');
    const stopCameraBtn = document.getElementById('stopPickupCamera');
    
    if (closeBtn) closeBtn.addEventListener('click', closePickupModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closePickupModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmPickup);
    if (startCameraBtn) startCameraBtn.addEventListener('click', () => startCamera('pickup'));
    if (capturePhotoBtn) capturePhotoBtn.addEventListener('click', () => capturePhoto('pickup'));
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', () => stopCamera('pickup'));
}

function setupDeliveryModalListeners() {
    const closeBtn = document.getElementById('closeDeliveryBtn');
    const cancelBtn = document.getElementById('cancelDeliveryBtn');
    const confirmBtn = document.getElementById('confirmDeliveryBtn');
    const startCameraBtn = document.getElementById('startDeliveryCamera');
    const capturePhotoBtn = document.getElementById('captureDeliveryPhoto');
    const stopCameraBtn = document.getElementById('stopDeliveryCamera');
    const clearSigBtn = document.getElementById('clearSignatureBtn');
    
    if (closeBtn) closeBtn.addEventListener('click', closeDeliveryModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeliveryModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmDelivery);
    if (startCameraBtn) startCameraBtn.addEventListener('click', () => startCamera('delivery'));
    if (capturePhotoBtn) capturePhotoBtn.addEventListener('click', () => capturePhoto('delivery'));
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', () => stopCamera('delivery'));
    if (clearSigBtn) clearSigBtn.addEventListener('click', clearSignature);
}

// ===== GESTIÓN DE PAQUETES =====
async function loadPackages() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showError('No hay token de autenticación');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/packages/my-assignments`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            packages = (data.data.packages || []).map(mapPackageFromAPI);
            console.log(`Paquetes cargados: ${packages.length}`);
            updateStatistics();
            displayPackages();
            clearError();
        } else {
            throw new Error(data.message || 'Error cargando paquetes');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError('Error cargando paquetes: ' + error.message);
    }
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
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: #718096;"><h3>No hay paquetes asignados a tu ruta</h3></div>';
        return;
    }
    
    let html = '';
    packages.forEach(pkg => {
        const statusClass = pkg.status.replace('_', '-').replace(' ', '-');
        const statusText = getStatusText(pkg.status);
        
        html += `
            <div class="package-card">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h3>${pkg.trackingNumber}</h3>
                        <p style="color: #718096; margin-top: 0.5rem;">${pkg.cliente}</p>
                        <p style="color: #718096;">${pkg.direccion}</p>
                    </div>
                    <span class="status-badge status-${statusClass}">${statusText}</span>
                </div>
                
                <div style="display: flex; gap: 2rem; margin-bottom: 1rem; color: #718096;">
                    <div><strong>Peso:</strong> ${pkg.pesoSalida || pkg.pesoEstimado || 'N/A'} kg</div>
                    <div><strong>Prioridad:</strong> ${getPriorityText(pkg.prioridad)}</div>
                </div>
                
                ${getPackageActions(pkg)}
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    setupPackageButtonListeners();
}

function setupPackageButtonListeners() {
    document.querySelectorAll('.btn-pickup').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const packageId = e.target.dataset.packageId;
            openPickupModal(packageId);
        });
    });
    
    document.querySelectorAll('.btn-deliver').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const packageId = e.target.dataset.packageId;
            openDeliveryModal(packageId);
        });
    });
}

function getPackageActions(pkg) {
    if (pkg.status === 'pending' || pkg.status === 'assigned') {
        return `<button class="btn btn-primary btn-pickup" data-package-id="${pkg.id}">📦 Recoger Paquete</button>`;
    } else if (pkg.status === 'in_transit' || pkg.status === 'in transit') {
        return `<button class="btn btn-success btn-deliver" data-package-id="${pkg.id}">✅ Entregar Paquete</button>`;
    } else if (pkg.status === 'delivered') {
        return `
            <div class="evidence-preview">
                ${pkg.fotoEntrega ? `<div class="evidence-item"><img src="${pkg.fotoEntrega}" alt="Foto entrega"></div>` : ''}
                ${pkg.firmaDigital ? `<div class="evidence-item"><img src="${pkg.firmaDigital}" alt="Firma"></div>` : ''}
            </div>
            <small style="color: #718096;">Entregado a: ${pkg.nombreQuienRecibio || 'N/A'}</small>
        `;
    }
    return '';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'assigned': 'Asignado',
        'in_transit': 'En Tránsito',
        'in transit': 'En Tránsito',
        'delivered': 'Entregado'
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

// ===== MODAL: RECOGER PAQUETE =====
function openPickupModal(packageId) {
    currentPackage = packages.find(p => p.id === packageId);
    if (!currentPackage) return;
    
    // Reset photos array
    pickupPhotos = [];
    
    const pesoInicial = currentPackage.pesoEstimado || currentPackage.pesoSalida || 0;
    
    document.getElementById('pickupInfo').innerHTML = `
        <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <strong>${currentPackage.trackingNumber}</strong><br>
            Cliente: ${currentPackage.cliente}<br>
            Peso estimado: ${pesoInicial} kg
        </div>
    `;
    
    document.getElementById('pickupPhotosContainer').innerHTML = '';
    document.getElementById('pickupModal').classList.add('active');
    
    setupPickupModalListeners();
}

function closePickupModal() {
    document.getElementById('pickupModal').classList.remove('active');
    stopCamera('pickup');
    resetPickupForm();
}

function resetPickupForm() {
    pickupPhotos = [];
    document.getElementById('pickupPhotosContainer').innerHTML = '';
}

// ===== CAPTURA DE FOTOS CON PESO =====
async function startCamera(type) {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' },
            audio: false 
        });
        
        const videoElement = document.getElementById(`${type}CameraPreview`);
        videoElement.srcObject = cameraStream;
        document.getElementById(`${type}CameraContainer`).style.display = 'block';
        
    } catch (error) {
        alert('No se pudo acceder a la cámara: ' + error.message);
    }
}

function capturePhoto(type) {
    const video = document.getElementById(`${type}CameraPreview`);
    const canvas = document.getElementById(`${type}Canvas`);
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Solicitar el peso para esta foto
    const weight = prompt('Ingresa el peso mostrado en la báscula para esta foto (kg):');
    
    if (weight === null) {
        // Usuario canceló
        return;
    }
    
    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 0) {
        alert('Por favor ingresa un peso válido');
        return;
    }
    
    // Agregar foto al array correspondiente
    const photoObj = {
        photoData: photoData,
        weight: weightNum,
        timestamp: new Date().toISOString()
    };
    
    if (type === 'pickup') {
        pickupPhotos.push(photoObj);
        displayPickupPhotos();
    } else {
        deliveryPhotos.push(photoObj);
        displayDeliveryPhotos();
    }
    
    stopCamera(type);
}

function displayPickupPhotos() {
    const container = document.getElementById('pickupPhotosContainer');
    
    if (pickupPhotos.length === 0) {
        container.innerHTML = '<p style="color: #718096; text-align: center;">No hay fotos capturadas</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">';
    
    pickupPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-card">
                <img src="${photo.photoData}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                <div style="padding: 0.5rem; background: #f7fafc; margin-top: 0.5rem; border-radius: 4px;">
                    <strong>Peso: ${photo.weight} kg</strong>
                    <button class="btn-delete-photo" data-type="pickup" data-index="${index}" 
                            style="float: right; background: #ef4444; color: white; border: none; 
                            padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Event listeners para eliminar fotos
    document.querySelectorAll('.btn-delete-photo[data-type="pickup"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deletePhoto('pickup', index);
        });
    });
}

function displayDeliveryPhotos() {
    const container = document.getElementById('deliveryPhotosContainer');
    
    if (deliveryPhotos.length === 0) {
        container.innerHTML = '<p style="color: #718096; text-align: center;">No hay fotos capturadas</p>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">';
    
    deliveryPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-card">
                <img src="${photo.photoData}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                <div style="padding: 0.5rem; background: #f7fafc; margin-top: 0.5rem; border-radius: 4px;">
                    <strong>Peso: ${photo.weight} kg</strong>
                    <button class="btn-delete-photo" data-type="delivery" data-index="${index}" 
                            style="float: right; background: #ef4444; color: white; border: none; 
                            padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    // Event listeners para eliminar fotos
    document.querySelectorAll('.btn-delete-photo[data-type="delivery"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deletePhoto('delivery', index);
        });
    });
}

function deletePhoto(type, index) {
    if (!confirm('¿Estás seguro de eliminar esta foto?')) {
        return;
    }
    
    if (type === 'pickup') {
        pickupPhotos.splice(index, 1);
        displayPickupPhotos();
    } else {
        deliveryPhotos.splice(index, 1);
        displayDeliveryPhotos();
    }
}

function stopCamera(type) {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    document.getElementById(`${type}CameraContainer`).style.display = 'none';
}

async function confirmPickup() {
    if (pickupPhotos.length === 0) {
        if (!confirm('¿Deseas continuar sin fotos del paquete en la báscula?')) {
            return;
        }
    }
    
    // Calcular peso promedio de todas las fotos
    const pesoPromedio = pickupPhotos.length > 0 
        ? pickupPhotos.reduce((sum, p) => sum + p.weight, 0) / pickupPhotos.length 
        : parseFloat(currentPackage.pesoEstimado || 0);
    
    const token = localStorage.getItem('token');
    const updateData = {
        status: 'in_transit',
        tiempoSalidaReparto: new Date().toISOString(),
        pesoSalida: pesoPromedio,
        fotosBascula: pickupPhotos, // Array de fotos con pesos
        evidenciasPeso: {
            fotos: pickupPhotos.map(p => ({
                url: p.photoData,
                peso: p.weight,
                timestamp: p.timestamp
            }))
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            showSuccess(`Paquete recogido exitosamente. Peso promedio: ${pesoPromedio.toFixed(2)} kg`);
            closePickupModal();
            await loadPackages();
        } else {
            throw new Error('Error al actualizar paquete');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ===== MODAL: ENTREGAR PAQUETE =====
function openDeliveryModal(packageId) {
    currentPackage = packages.find(p => p.id === packageId);
    if (!currentPackage) return;
    
    // Reset photos array
    deliveryPhotos = [];
    
    document.getElementById('deliveryInfo').innerHTML = `
        <div style="background: #f7fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <strong>${currentPackage.trackingNumber}</strong><br>
            Cliente: ${currentPackage.cliente}<br>
            Dirección: ${currentPackage.direccion}<br>
            Peso salida: ${currentPackage.pesoSalida} kg
        </div>
    `;
    
    document.getElementById('deliveryPhotosContainer').innerHTML = '';
    document.getElementById('deliveryModal').classList.add('active');
    
    setupDeliveryModalListeners();
}

function closeDeliveryModal() {
    document.getElementById('deliveryModal').classList.remove('active');
    stopCamera('delivery');
    clearSignature();
    resetDeliveryForm();
}

function resetDeliveryForm() {
    document.getElementById('receiverName').value = '';
    document.getElementById('receiverPosition').value = '';
    deliveryPhotos = [];
    document.getElementById('deliveryPhotosContainer').innerHTML = '';
}

async function confirmDelivery() {
    const receiverName = document.getElementById('receiverName').value;
    const receiverPosition = document.getElementById('receiverPosition').value;
    
    if (!receiverName) {
        alert('Por favor ingresa el nombre de quien recibe');
        return;
    }
    
    if (deliveryPhotos.length === 0) {
        if (!confirm('¿Deseas continuar sin fotos de entrega?')) {
            return;
        }
    }
    
    const signatureData = signaturePad.toDataURL();
    if (isCanvasBlank(signaturePad.canvas)) {
        alert('Por favor captura la firma del receptor');
        return;
    }
    
    // Calcular peso promedio de todas las fotos de entrega
    const pesoPromedio = deliveryPhotos.length > 0 
        ? deliveryPhotos.reduce((sum, p) => sum + p.weight, 0) / deliveryPhotos.length 
        : parseFloat(currentPackage.pesoSalida || 0);
    
    const token = localStorage.getItem('token');
    const updateData = {
        status: 'delivered',
        tiempoEntrega: new Date().toISOString(),
        pesoEntrega: pesoPromedio,
        nombreQuienRecibio: receiverName,
        cargoQuienRecibio: receiverPosition,
        firmaDigital: signatureData,
        horaFirma: new Date().toISOString(),
        fotosEntrega: deliveryPhotos, // Array de fotos con pesos
        evidenciasEntrega: {
            fotos: deliveryPhotos.map(p => ({
                url: p.photoData,
                peso: p.weight,
                timestamp: p.timestamp
            }))
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}/packages/${currentPackage.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            showSuccess(`Paquete entregado exitosamente. Peso promedio: ${pesoPromedio.toFixed(2)} kg`);
            closeDeliveryModal();
            await loadPackages();
        } else {
            throw new Error('Error al actualizar paquete');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ===== FIRMA DIGITAL =====
function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    const ctx = canvas.getContext('2d');
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    signaturePad = {
        canvas: canvas,
        ctx: ctx,
        toDataURL: () => canvas.toDataURL('image/png')
    };
    
    function startDrawing(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        [lastX, lastY] = getCoordinates(e, rect);
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const [x, y] = getCoordinates(e, rect);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        [lastX, lastY] = [x, y];
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    function getCoordinates(e, rect) {
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        return [x, y];
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e);
    });
    canvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
    if (signaturePad) {
        signaturePad.ctx.clearRect(0, 0, signaturePad.canvas.width, signaturePad.canvas.height);
    }
}

function isCanvasBlank(canvas) {
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    for (let i = 0; i < pixelData.length; i += 4) {
        if (pixelData[i + 3] !== 0) {
            return false;
        }
    }
    return true;
}

// ===== UI HELPERS =====
function showLoading() {
    document.getElementById('packagesContainer').innerHTML = '<div style="text-align: center; padding: 2rem;">Cargando paquetes...</div>';
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `<div class="alert alert-error">${message}</div>`;
    setTimeout(() => container.innerHTML = '', 5000);
}

function showSuccess(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `<div class="alert alert-success">${message}</div>`;
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
