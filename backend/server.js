const express = require('express');
process.env.TZ = 'America/Monterrey';
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const logisticsRoutes = require('./routes/logistics');
const routeRoutes = require('./routes/route');
const localRoutes = require('./routes/local');
const reportsRoutes = require('./routes/reports');
const packagesRoutes = require('./routes/packages');
const routesManagementRoutes = require('./routes/routes-management');
const reportsLogitackRouter = require('./routes/reports-logitrack');
const branchesRoutes = require('./routes/branches');
const publicRoutes = require('./routes/public');
const labelsRoutes = require('./routes/labels');
const incidentsRoutes = require('./routes/incidents');

// Importar middleware de autenticación
const { authenticateToken } = require('./middleware/auth');

const app = express();
// Trust Railway proxy
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Crear directorios necesarios
const requiredDirs = ['data', 'uploads', 'logs', 'public', 'public/js'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Inicializar archivos JSON si no existen
const dataFiles = {
    users: 'data/users.json',
    packages: 'data/packages.json',
    routes: 'data/routes.json',
    incidents: 'data/incidents.json',
    metrics: 'data/metrics.json'
};

Object.entries(dataFiles).forEach(([key, filePath]) => {
    if (!fs.existsSync(filePath)) {
        const initialData = key === 'users' ? 
            [{
                id: 'admin-001',
                username: 'admin',
                email: 'admin@logistics.com',
                password: '$2a$10$8K1p/a1a1A1oO1c1n1t1.uOyG6Nm.QzO5U5Q5m5J5k5D5f5G5h5I5j',
                role: 'admin',
                fullName: 'Administrador del Sistema',
                active: true,
                createdAt: new Date().toISOString(),
                lastLogin: null
            }] : [];
        
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
        console.log(`Archivo ${filePath} creado con datos iniciales`);
    }
});

// Configuración de seguridad mejorada para CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "http://localhost:9100", "http://localhost:3350"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://localhost:9100", "http://localhost:3350"],
        },
    },
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 
        ['https://logitrack-sistema-production.up.railway.app'] : 
        ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
});
app.use('/api/', limiter);

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Rutas API
app.use('/api/incidents', incidentsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/logistics', authenticateToken, logisticsRoutes);
app.use('/api/route', authenticateToken, routeRoutes);
app.use('/api/local', authenticateToken, localRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/packages', packagesRoutes);
app.use('/api/routes-management', routesManagementRoutes);
app.use('/api/reports-logitrack', reportsLogitackRouter);
app.use('/api/admin', authenticateToken, branchesRoutes);
app.use('/api/labels', labelsRoutes);

// Ruta de salud del sistema
app.get('/api/health', (req, res) => {
    const healthCheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    };
    
    const fileStatus = {};
    Object.entries(dataFiles).forEach(([key, filePath]) => {
        fileStatus[key] = fs.existsSync(filePath) ? 'OK' : 'MISSING';
    });
    
    healthCheck.dataFiles = fileStatus;
    res.json(healthCheck);
});

// Ruta raíz muestra el login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Manejo de errores 404 para rutas API
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada',
        path: req.originalUrl
    });
});

// Manejo global de errores
app.use((error, req, res, next) => {
    console.error('Error del servidor:', error);
    
    const errorLog = {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    };
    
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
    }
    
    fs.appendFileSync('logs/errors.log', JSON.stringify(errorLog) + '\n');
    
    res.status(error.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 
            'Error interno del servidor' : 
            error.message
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de logística iniciado en puerto ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Dashboard disponible en: http://localhost:${PORT}`);
    console.log(`API Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;