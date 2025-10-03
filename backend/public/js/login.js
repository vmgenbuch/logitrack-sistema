const API_BASE = window.API_BASE_URL || '/api';

// Verificar estado del servidor
async function checkServerStatus() {
    const statusElement = document.getElementById('systemStatus');
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            const data = await response.json();
            statusElement.textContent = `Sistema: ${data.status} (${data.environment})`;
            statusElement.className = 'system-status status-online';
        } else {
            throw new Error('Server not responding properly');
        }
    } catch (error) {
        statusElement.textContent = 'Sistema: Desconectado';
        statusElement.className = 'system-status status-offline';
        console.error('Error verificando servidor:', error);
    }
}

// Mostrar alerta
function showAlert(message, type = 'error') {
    const container = document.getElementById('alertContainer');
    container.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

// Manejar formulario de login
document.addEventListener('DOMContentLoaded', () => {
    // Auto-llenar credenciales de demo
    document.getElementById('username').value = 'admin@logistics.com';
    document.getElementById('password').value = 'admin123';
    
    // Verificar servidor cada 30 segundos
    checkServerStatus();
    setInterval(checkServerStatus, 30000);
    
    // Verificar si ya está logueado
    const token = localStorage.getItem('token');
    if (token) {
        fetch(`${API_BASE}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                const user = JSON.parse(localStorage.getItem('userData'));
                switch(user.role) {
                        case 'admin':
                           window.location.href = 'dashboard-admin.html';
                           break;
                        case 'logistics':
                          window.location.href = 'packages.html';
                          break;
                        case 'chofer':
                          window.location.href = 'driver-dashboard-enhanced.html';
                          break;
                        case 'local':  
                            window.location.href = 'dashboard-local.html';
                        break;
                        default:
                          window.location.href = 'packages.html';
                }
            }
        })
        .catch(error => {
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
        });
    }
    
    // Manejar envío del formulario
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('loginBtn');
        const loading = document.getElementById('loading');
        
        // Mostrar loading
        loginBtn.disabled = true;
        loginBtn.textContent = 'Iniciando sesión...';
        loading.style.display = 'block';
        
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: username, password })  // ← CAMBIO AQUÍ
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Guardar token y datos del usuario
                localStorage.setItem('token', data.data.token);
                localStorage.setItem('userData', JSON.stringify(data.data.user));
                
                showAlert('¡Inicio de sesión exitoso! Redirigiendo...', 'success');
                
                // Redirigir según el rol
                setTimeout(() => {
                    const userRole = data.data.user.role;
                    switch(userRole) {
                        case 'admin':
                            window.location.href = 'dashboard-admin.html';
                            break;
                        case 'logistics':
                            window.location.href = 'packages.html';
                            break;
                        case 'chofer':
                            window.location.href = 'driver-dashboard-enhanced.html';
                            break;
                        case 'local':
                            window.location.href = 'dashboard-local.html';
                            break;                        
                        default:
                            window.location.href = 'packages.html';
                    }
                }, 1500);
                
            } else {
                showAlert(data.message || 'Error en el inicio de sesión');
            }
            
        } catch (error) {
            console.error('Error en login:', error);
            showAlert('Error de conexión. Verifica que el servidor esté funcionando.');
        } finally {
            // Ocultar loading
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
            loading.style.display = 'none';
        }
    });
});