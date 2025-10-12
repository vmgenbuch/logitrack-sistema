const API_BASE = window.API_BASE_URL || '/api';
let currentIncident = null;
let allIncidents = [];

// Zona horaria MX
const MX_TZ = 'America/Monterrey';

function formatYMDInTZ(date = new Date(), tz = MX_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function daysAgoInTZ(days, tz = MX_TZ) {
  const now = new Date();
  return formatYMDInTZ(new Date(now.getTime() - days*24*60*60*1000), tz);
}

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
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target.id === 'detailModal') {
            closeModal();
        }
    });
}

function setDefaultDates() {
    const start = formatYMDInTZ(new Date(), MX_TZ);
    const end   = formatYMDInTZ(new Date(), MX_TZ);

    document.getElementById('filterStartDate').value = start;
    document.getElementById('filterEndDate').value   = end;
    
    console.log('Filtros de fecha configurados:', { start, end });
}

function resetFilters() {
    setDefaultDates();
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSeverity').value = '';
    document.getElementById('filterType').value = '';
    loadIncidents();
}

// ✅ CARGAR INCIDENTES (UNA SOLA VEZ)
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
        
        console.log('🔍 Cargando incidentes con filtros:', filters);
        
        const params = new URLSearchParams();
        Object.keys(filters).forEach(key => {
            if (filters[key]) params.append(key, filters[key]);
        });
        
        const url = `${API_BASE}/incidents?${params}`;
        console.log('🌐 URL completa:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('📦 Data recibida:', data);
        
        if (data.success) {
            const incidents = Array.isArray(data.data) ? data.data : (data.data?.incidents || []);
            const metrics   = data.data?.metrics || {
                total: incidents.length,
                pending: incidents.filter(i => i.status === 'pending').length,
                inProgress: incidents.filter(i => i.status === 'in_progress').length,
                resolved: incidents.filter(i => i.status === 'resolved').length
            };

            console.log(`✅ Incidentes cargados: ${incidents.length}`);
            console.log('📊 Métricas:', metrics);

            allIncidents = incidents;
            updateMetrics(metrics);
            renderIncidents(allIncidents);
        } else {
            throw new Error(data.message || 'Error desconocido');
        }
        
    } catch (error) {
        console.error('💥 Error cargando incidentes:', error);
        console.error('Stack trace:', error.stack);
        showError('Error al cargar los incidentes: ' + error.message);
        
        updateMetrics({ total: 0, pending: 0, inProgress: 0, resolved: 0 });
        renderIncidents([]);
    }
}

function updateMetrics(metrics) {
    document.getElementById('totalIncidents').textContent = metrics.total || 0;
    document.getElementById('pendingIncidents').textContent = metrics.pending || 0;
    document.getElementById('inProgressIncidents').textContent = metrics.inProgress || 0;
    document.getElementById('resolvedIncidents').textContent = metrics.resolved || 0;
}

// ✅ RENDERIZAR LISTA DE INCIDENTES (FALTABA ESTA FUNCIÓN)
function renderIncidents(incidents) {
    const container = document.getElementById('incidentsContainer');
    
    if (incidents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔭</div>
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
    pending: 'Pendiente',
    in_progress: 'En Proceso',
    resolved: 'Resuelto'
  };

  const typeLabels = {
    'producto_dañado': 'Producto Dañado',
    'producto_incompleto': 'Producto Incompleto',
    'mal_estado': 'Mal Estado',
    'no_corresponde': 'No Corresponde',
    'no_recibido': 'No Recibido',
    'otro': 'Otro'
  };

  const rawStatus = (incident.status || 'pending').toString().toLowerCase();
  const statusBadge = rawStatus.replace(/\s+/g, '_');
  const statusText  = statusLabels[statusBadge] || (incident.status || 'Pendiente');

  const rawSeverity = (incident.severity || incident.severidad || 'baja').toString().toLowerCase();
  const severityBadge = rawSeverity.replace(/\s+/g, '-');

  const rawType = (incident.type || 'otro').toString().toLowerCase();
  const typeText = typeLabels[rawType] || (incident.type || 'Incidente');

  const tracking = incident.tracking_number || incident.trackingNumber || 'Sin tracking';
  const branch = incident.branch_name || incident.branchName || 'Sin sucursal';
  const createdAt = new Date(incident.created_at || Date.now()).toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
  const hasPhoto = !!incident.photo;
  const commentsCount = (Array.isArray(incident.comments) && incident.comments.length) || 0;
  const reportedBy = incident.reported_by || incident.reportedBy || 'Desconocido';

  return `
    <div class="incident-item" data-incident-id="${incident.id}">
      <div class="incident-header">
        <div>
          <div class="incident-title">${typeText}</div>
          <div class="incident-meta">
            <span>📦 ${tracking}</span>
            <span>🏢 ${branch}</span>
            <span>📅 ${createdAt}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-direction:column;align-items:flex-end;">
          <span class="badge badge-${statusBadge.replace('_','-')}">${statusText}</span>
          <span class="badge badge-${severityBadge}">Severidad: ${rawSeverity.toUpperCase()}</span>
        </div>
      </div>
      <div class="incident-description">${incident.description || 'Sin descripción'}</div>
      <div class="incident-footer">
        <div>
          <span style="color:rgba(255,255,255,0.6);">Reportado por:</span>
          <strong>${reportedBy}</strong>
        </div>
        <div>
          ${hasPhoto ? '📷 Con foto' : ''}
          ${commentsCount ? `💬 ${commentsCount} comentario${commentsCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>
    </div>
  `;
}

async function openIncidentDetail(incidentId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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

// ✅ RENDERIZAR DETALLE (SIN ONCLICK INLINE)
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

  const createdAt = new Date(incident.created_at || Date.now()).toLocaleString('es-MX', { timeZone: MX_TZ });
  const rawSeverity = (incident.severity || 'baja').toString().toLowerCase();
  const sevBadge = rawSeverity.replace(/\s+/g, '-');
  const rawStatus = (incident.status || 'pending').toString().toLowerCase();
  const statusBadge = rawStatus.replace(/_/g, '-');
  const statusText = statusLabels[rawStatus] ?? 'Pendiente';
  const typeKey = (incident.type || 'otro').toString().toLowerCase();
  const typeText = typeLabels[typeKey] || 'Incidente';
  const tracking = incident.tracking_number || 'N/A';
  const branch = incident.branch_name || 'N/A';
  const reporter = incident.reported_by || 'Desconocido';
  const comments = Array.isArray(incident.comments) ? incident.comments : [];

  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">📦 TRACKING</div>
        <div class="detail-value">${tracking}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🏢 SUCURSAL</div>
        <div class="detail-value">${branch}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">⚠️ TIPO</div>
        <div class="detail-value">${typeText}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">🎚️ SEVERIDAD</div>
        <div class="detail-value">
          <span class="badge badge-${sevBadge}">${rawSeverity.toUpperCase()}</span>
        </div>
      </div>
      <div class="detail-item">
        <div class="detail-label">📊 ESTADO</div>
        <div class="detail-value">
          <span class="badge badge-${statusBadge}">${statusText}</span>
        </div>
      </div>
      <div class="detail-item">
        <div class="detail-label">👤 REPORTADO POR</div>
        <div class="detail-value">${reporter}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">📅 FECHA</div>
        <div class="detail-value">${createdAt}</div>
      </div>
    </div>

    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; margin: 20px 0;">
      <h3 style="margin-bottom: 10px;">📝 Descripción</h3>
      <p style="color: rgba(255,255,255,0.9); line-height: 1.6;">${incident.description || 'Sin descripción'}</p>
    </div>

    ${incident.photo ? `
      <div class="photo-section">
        <h3 style="margin-bottom: 15px;">📸 Evidencia Fotográfica</h3>
        <div class="photo-container">
          <img id="incidentPhotoImg" src="${incident.photo}" alt="Foto del incidente" style="cursor: pointer;">
          <p style="margin-top: 10px; color: rgba(255,255,255,0.6); font-size: 13px;">
            Haz clic en la imagen para verla en tamaño completo
          </p>
        </div>
      </div>
    ` : ''}

    <div class="comments-section">
      <h3 style="margin-bottom: 15px;">💬 Comentarios y Seguimiento</h3>
      <div id="commentsList">${renderComments(comments)}</div>
      <div class="add-comment">
        <h4 style="margin-bottom: 10px;">Agregar Comentario</h4>
        <textarea id="newCommentText" placeholder="Escribe tu comentario aquí..."></textarea>
        <div class="action-buttons">
          <button class="btn btn-primary" id="addCommentBtn">💬 Agregar Comentario</button>
        </div>
      </div>
    </div>

    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
      <h3 style="margin-bottom: 15px;">⚙️ Acciones</h3>
      <div class="action-buttons">
        ${rawStatus !== 'resolved' ? `
          <button class="btn btn-primary" id="markInProgressBtn">🔄 Marcar En Proceso</button>
          <button class="btn" style="background: var(--success); color: white;" id="markResolvedBtn">✅ Marcar Resuelto</button>
        ` : `
          <button class="btn" style="background: var(--warning); color: white;" id="reopenBtn">↩️ Reabrir Incidente</button>
        `}
      </div>
    </div>
  `;

  // Event listeners
  const photoImg = document.getElementById('incidentPhotoImg');
  if (photoImg) {
    photoImg.addEventListener('click', () => window.open(incident.photo, '_blank'));
  }

  const addCommentBtn = document.getElementById('addCommentBtn');
  if (addCommentBtn) {
    addCommentBtn.addEventListener('click', addComment);
  }

  const markInProgressBtn = document.getElementById('markInProgressBtn');
  if (markInProgressBtn) {
    markInProgressBtn.addEventListener('click', () => updateStatus('in_progress'));
  }

  const markResolvedBtn = document.getElementById('markResolvedBtn');
  if (markResolvedBtn) {
    markResolvedBtn.addEventListener('click', () => updateStatus('resolved'));
  }

  const reopenBtn = document.getElementById('reopenBtn');
  if (reopenBtn) {
    reopenBtn.addEventListener('click', () => updateStatus('pending'));
  }
}

function renderComments(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">No hay comentarios aún</p>';
  }

  const esc = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  return comments.map(c => {
    const author = c.author || c.user || 'Usuario';
    const when = new Date(c.created_at || Date.now()).toLocaleString('es-MX', { timeZone: MX_TZ });
    const text = c.text || c.comment || '';

    return `
      <div class="comment-item">
        <div class="comment-header">
          <span class="comment-author">👤 ${esc(author)}</span>
          <span class="comment-date">${esc(when)}</span>
        </div>
        <div class="comment-text">${esc(text)}</div>
      </div>
    `;
  }).join('');
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
            openIncidentDetail(currentIncident.id);
        }
    } catch (error) {
        console.error('Error agregando comentario:', error);
        showError('Error al agregar el comentario');
    }
}

async function updateStatus(newStatus) {
    if (!confirm('¿Estás seguro de cambiar el estado del incidente?')) return;
    
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

function showLoading() {
    document.getElementById('incidentsContainer').innerHTML = '<div class="loading">Cargando incidentes...</div>';
}

function showError(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: rgba(239, 68, 68, 0.9); color: white;
        padding: 15px 20px; border-radius: 10px;
        z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: rgba(16, 185, 129, 0.9); color: white;
        padding: 15px 20px; border-radius: 10px;
        z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

function logout() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        window.location.href = '/login.html';
    }
}