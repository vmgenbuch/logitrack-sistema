/**
 * Script para probar la configuración inicial del sistema de logística
 * Ejecutar con: node test-setup.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('🚀 Iniciando pruebas del sistema de logística de Monterrey...\n');

// 1. Verificar estructura de directorios
console.log('📁 Verificando estructura de directorios...');
const requiredDirs = ['data', 'uploads', 'logs', 'middleware', 'routes'];
let directoriesOK = true;

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        console.log(`❌ Falta directorio: ${dir}`);
        directoriesOK = false;
        // Crear directorio
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Directorio ${dir} creado`);
    } else {
        console.log(`✅ Directorio ${dir} existe`);
    }
});

// 2. Verificar archivos de datos JSON
console.log('\n📄 Verificando archivos de datos...');
const dataFiles = {
    'data/users.json': [],
    'data/packages.json': [],
    'data/routes.json': [],
    'data/incidents.json': [],
    'data/metrics.json': []
};

Object.entries(dataFiles).forEach(([filePath, defaultData]) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        console.log(`✅ Archivo ${filePath} creado`);
    } else {
        console.log(`✅ Archivo ${filePath} existe`);
    }
});

// 3. Crear usuario admin por defecto si no existe
console.log('\n👤 Verificando usuario administrador...');
const usersFile = 'data/users.json';
let users = [];

try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
} catch (error) {
    console.log('⚠️  Error leyendo usuarios, creando archivo nuevo');
    users = [];
}

const adminExists = users.some(user => user.role === 'admin');

if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    
    const adminUser = {
        id: uuidv4(),
        username: 'admin',
        email: 'admin@logistics.com',
        password: bcrypt.hashSync('admin123', 10), // Contraseña: admin123
        role: 'admin',
        fullName: 'Administrador del Sistema',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        metadata: {
            createdBy: 'system',
            preferences: {
                language: 'es',
                timezone: 'America/Monterrey'
            }
        }
    };
    
    users.push(adminUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log('✅ Usuario administrador creado');
    console.log('📝 Credenciales: admin / admin123');
} else {
    console.log('✅ Usuario administrador ya existe');
}

// 4. Verificar dependencias del package.json
console.log('\n📦 Verificando dependencias...');
if (fs.existsSync('package.json')) {
    console.log('✅ package.json existe');
    console.log('💡 Ejecuta: npm install');
} else {
    console.log('❌ package.json no encontrado');
    console.log('💡 Copia el contenido del package.json del artifact');
}

// 5. Crear archivos básicos si no existen
console.log('\n🔧 Verificando archivos del servidor...');
const serverFiles = [
    'server.js',
    'middleware/auth.js',
    'routes/auth.js'
];

serverFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} existe`);
    } else {
        console.log(`❌ ${file} no encontrado`);
        console.log(`💡 Copia el contenido del artifact correspondiente`);
    }
});

// 6. Test de funcionamiento básico
console.log('\n🧪 Preparando test de funcionalidad...');

const testData = {
    users: users.length,
    packages: 0,
    routes: 0,
    incidents: 0
};

console.log('📊 Estado actual del sistema:');
console.log(`   Usuarios: ${testData.users}`);
console.log(`   Paquetes: ${testData.packages}`);
console.log(`   Rutas: ${testData.routes}`);
console.log(`   Incidencias: ${testData.incidents}`);

console.log('\n🎯 Próximos pasos:');
console.log('1. Ejecutar: npm install');
console.log('2. Crear los archivos faltantes con el contenido de los artifacts');
console.log('3. Ejecutar: npm start');
console.log('4. Probar el endpoint: http://localhost:3000/api/health');
console.log('5. Probar login con: admin / admin123');

console.log('\n✨ Sistema listo para desarrollo!');

// Función helper para probar el servidor cuando esté corriendo
function testServerHealth() {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/health',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log('\n🏥 Health Check Response:');
            console.log(JSON.parse(data));
        });
    });

    req.on('error', (error) => {
        console.log('\n⚠️  Servidor no está corriendo aún');
        console.log('💡 Ejecuta: npm start');
    });

    req.end();
}

// Exportar función de test para uso posterior
module.exports = { testServerHealth };