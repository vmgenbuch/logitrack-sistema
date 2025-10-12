const API_BASE = window.API_BASE_URL || '/api';
let currentIncident = null;
let allIncidents = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
    setDefaultDates();
    loadIncidents();
});

function checkAuthentication() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    
    if (!token || !user.role) {
        window.location.href = '/login.html';
        return;
    }
    
    // Solo admin y supervisor pueden acceder
    if (user.role !== 'admin' && user.role !== 'supervisor') {
        alert('No tienes permisos para acceder a esta sección.');
        window.location.href = '/';
        return;
    }
}

function setupEventListeners() {
    document.getElementById('applyFiltersBtn').addEventListener('click', loadIncidents);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    
    // Cerrar modal al hacer clic fuera
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target.id === 'detailModal') {
            closeModal();
        }
    });
}

function setDefaultDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('filterStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('filterEndDate').value = today.toISOString().split('T')[0];
}

function resetFilters() {
    setDefaultDates();
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSeverity').value = '';
    document.getElementById('filterType').value = '';
    loadIncidents();
}

// Cargar incidentes
async function loadIncidents() {
    try {
        showLoading();
        
        const token = localStorage.getItem('token');
        const filters = {
            startDate: document.getElementById('filterStartDate').value,
            endDate: document.getElementById('filterEndDate').value,
            status: document.getElementById('filterStatus').value,
            severity: document.getElementById('filterSeverity').value,
            type: document.getElementById('filterType').value
        };
        
        const params = new URLSearchParams();
        Object.keys(filters).forEach(key => {
            if (filters[key]) params.append(key, filters[key]);
        });
        
        const response = await fetch(`${API_BASE}/incidents?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            allIncidents = data.data.incidents || [];
            updateMetrics(data.data.metrics || {});
            renderIncidents(allIncidents);
        } else {
            throw new Error(data.message || 'Error desconocido');
        }
        
    } catch (error) {
        console.error('Error cargando incidentes:', error);
        showError('Error al cargar los incidentes: ' + error.message);
    }
}

function updateMetrics(metrics) {
    document.getElementById('totalIncidents').textContent = metrics.total || 0;
    document.getElementById('pendingIncidents').textContent = metrics.pending || 0;
    document.getElementById('inProgressIncidents').textContent = metrics.inProgress || 0;
    document.getElementById('resolvedIncidents').textContent = metrics.resolved || 0;
}

function renderIncidents(incidents) {
    const container = document.getElementById('incidentsContainer');
    
    if (incidents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>No hay incidentes</h3>
                <p>No se encontraron incidentes con los filtros seleccionados</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = incidents.map(incident => createIncidentCard(incident)).join('');
    
    // Agregar event listeners
    document.querySelectorAll('.incident-item').forEach(item => {
        item.addEventListener('click', function() {
            const incidentId = this.dataset.incidentId;
            openIncidentDetail(incidentId);
        });
    });
}

function createIncidentCard(incident) {
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
    
    const statusBadge = incident.status || 'pending';
    const severityBadge = (incident.severity || incident.severidad || 'baja').toLowerCase();
    const createdAt = new Date(incident.created_at || incident.createdAt).toLocaleString('es-MX');
    
    return `
        <div class="incident-item" data-incident-id="${incident.id}">
            <div class="incident-header">
                <div>
                    <div class="incident-title">
                        ${typeLabels[incident.type] || incident.type || 'Incidente'}
                    </div>
                    <div class="incident-meta">
                        <span>📦 ${incident.tracking_number || incident.trackingNumber || 'Sin tracking'}</span>
                        <span>🏢 ${incident.branch_name || incident.branchName || 'Sin sucursal'}</span>
                        <span>📅 ${createdAt}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-direction: column; align-items: flex-end;">
                    <span class="badge badge-${statusBadge.replace('_', '-')}">${statusLabels[statusBadge]}</span>
                    <span class="badge badge-${severityBadge}">Severidad: ${severityBadge.toUpperCase()}</span>
                </div>
            </div>
            
            <div class="incident-description">
                ${incident.description || 'Sin descripción'}
            </div>
            
            <div class="incident-footer">
                <div>
                    <span style="color: rgba(255,255,255,0.6);">Reportado por:</span>
                    <strong>${incident.reported_by || incident.reportedBy || 'Desconocido'}</strong>
                </div>
                <div>
                    ${incident.photo ? '📷 Con foto' : ''}
                    ${incident.comments && incident.comments.length > 0 ? `💬 ${incident.comments.length} comentarios` : ''}
                </div>
            </div>
        </div>
    `;
}

async function openIncidentDetail(incidentId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            currentIncident = data.data;
            renderIncidentDetail(currentIncident);
            document.getElementById('detailModal').classList.add('active');
        }
        
    } catch (error) {
        console.error('Error cargando detalle:', error);
        showError('Error al cargar el detalle del incidente');
    }
}

function renderIncidentDetail(incident) {
    const typeLabels = {
        'producto_dañado': 'Producto Dañado',
        'producto_incompleto': 'Producto Incompleto',
        'mal_estado': 'Mal Estado',
        'no_corresponde': 'No Corresponde',
        'no_recibido': 'No Recibido',
        'otro': 'Otro'
    };
    
    const statusLabels = {
        'pending': 'Pendiente',
        'in_progress': 'En Proceso',
        'resolved': 'Resuelto'
    };
    
    const modalBody = document.getElementById('modalBody');
    const createdAt = new Date(incident.created_at || incident.createdAt).toLocaleString('es-MX');
    const severidad = (incident.severity || incident.severidad || 'baja').toLowerCase();
    
    modalBody.innerHTML = `
        <!-- Información Básica -->
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">📦 TRACKING</div>
                <div class="detail-value">${incident.tracking_number || incident.trackingNumber || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">🏢 SUCURSAL</div>
                <div class="detail-value">${incident.branch_name || incident.branchName || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">⚠️ TIPO</div>
                <div class="detail-value">${typeLabels[incident.type] || incident.type}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">🎚️ SEVERIDAD</div>
                <div class="detail-value">
                    <span class="badge badge-${severidad}">${severidad.toUpperCase()}</span>
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">📊 ESTADO</div>
                <div class="detail-value">
                    <span class="badge badge-${(incident.status || 'pending').replace('_', '-')}">${statusLabels[incident.status] || 'Pendiente'}</span>
                </div>
            </div>
            <div class="detail-item">
                <div class="detail-label">👤 REPORTADO POR</div>
                <div class="detail-value">${incident.reported_by || incident.reportedBy || 'Desconocido'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">📅 FECHA</div>
                <div class="detail-value">${createdAt}</div>
            </div>
        </div>

        <!-- Descripción -->
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; margin: 20px 0;">
            <h3 style="margin-bottom: 10px;">📝 Descripción</h3>
            <p style="color: rgba(255,255,255,0.9); line-height: 1.6;">${incident.description || 'Sin descripción'}</p>
        </div>

        <!-- Foto del Incidente -->
        ${incident.photo ? `
            <div class="photo-section">
                <h3 style="margin-bottom: 15px;">📸 Evidencia Fotográfica</h3>
                <div class="photo-container">
                    <img src="${incident.photo}" alt="Foto del incidente" onclick="window.open('${incident.photo}', '_blank')">
                    <p style="margin-top: 10px; color: rgba(255,255,255,0.6); font-size: 13px;">
                        Haz clic en la imagen para verla en tamaño completo
                    </p>
                </div>
            </div>
        ` : ''}

        <!-- Sección de Comentarios -->
        <div class="comments-section">
            <h3 style="margin-bottom: 15px;">💬 Comentarios y Seguimiento</h3>
            
            <div id="commentsList">
                ${renderComments(incident.comments || [])}
            </div>
            
            <div class="add-comment">
                <h4 style="margin-bottom: 10px;">Agregar Comentario</h4>
                <textarea id="newCommentText" placeholder="Escribe tu comentario aquí..."></textarea>
                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="addComment()">💬 Agregar Comentario</button>
                </div>
            </div>
        </div>

        <!-- Acciones -->
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
            <h3 style="margin-bottom: 15px;">⚙️ Acciones</h3>
            <div class="action-buttons">
                ${incident.status !== 'resolved' ? `
                    <button class="btn btn-primary" onclick="updateStatus('in_progress')">🔄 Marcar En Proceso</button>
                    <button class="btn" style="background: var(--success); color: white;" onclick="updateStatus('resolved')">✅ Marcar Resuelto</button>
                ` : `
                    <button class="btn" style="background: var(--warning); color: white;" onclick="updateStatus('pending')">↩️ Reabrir Incidente</button>
                `}
            </div>
        </div>
    `;
}

function renderComments(comments) {
    if (!comments || comments.length === 0) {
        return '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">No hay comentarios aún</p>';
    }
    
    return comments.map(comment => `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-author">👤 ${comment.author || comment.user || 'Usuario'}</span>
                <span class="comment-date">${new Date(comment.created_at || comment.createdAt).toLocaleString('es-MX')}</span>
            </div>
            <div class="comment-text">${comment.text || comment.comment || ''}</div>
        </div>
    `).join('');
}

async function addComment() {
    const commentText = document.getElementById('newCommentText').value.trim();
    
    if (!commentText) {
        showError('Por favor escribe un comentario');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('userData') || '{}');
        
        const response = await fetch(`${API_BASE}/incidents/${currentIncident.id}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                comment: commentText,
                author: user.fullName || user.username
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Comentario agregado exitosamente');
            document.getElementById('newCommentText').value = '';
            openIncidentDetail(currentIncident.id); // Recargar
        }
        
    } catch (error) {
        console.error('Error agregando comentario:', error);
        showError('Error al agregar el comentario');
    }
}

async function updateStatus(newStatus) {
    if (!confirm('¿Estás seguro de cambiar el estado del incidente?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${API_BASE}/incidents/${currentIncident.id}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Estado actualizado exitosamente');
            closeModal();
            loadIncidents();
        }
        
    } catch (error) {
        console.error('Error actualizando estado:', error);
        showError('Error al actualizar el estado');
    }
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
    currentIncident = null;
}

// Helpers
function showLoading() {
    document.getElementById('incidentsContainer').innerHTML = '<div class="loading">Cargando incidentes...</div>';
}

function showError(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(239, 68, 68, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => alert.remove(), 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(16, 185, 129, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => alert.remove(), 3000);
}