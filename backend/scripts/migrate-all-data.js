const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🔗 Conectando a:', process.env.DATABASE_URL?.substring(0, 50) + '...');

async function migrateAllData() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. BRANCHES
        console.log('📦 Migrando branches...');
        const branches = JSON.parse(fs.readFileSync('./data/branches.json', 'utf8'));
        for (const branch of branches) {
            await client.query(
                `INSERT INTO branches (id, nombre, codigo, direccion, contacto, horarios, estado, capacidad, zona, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (id) DO NOTHING`,
                [
                    branch.id, 
                    branch.nombre, 
                    branch.codigo, 
                    JSON.stringify(branch.direccion),
                    JSON.stringify(branch.contacto), 
                    JSON.stringify(branch.horarios),
                    branch.estado, 
                    branch.capacidad, 
                    branch.zona, 
                    JSON.stringify(branch.metadata), 
                    branch.fechaCreacion
                ]
            );
        }
        console.log(`✅ ${branches.length} sucursales migradas`);

        // 2. USERS
console.log('👥 Migrando users...');
const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
for (const user of users) {
    await client.query(
        `INSERT INTO users (id, username, email, password, full_name, role, branch_id, sucursal, active, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (username) DO NOTHING`,
        [
            user.id, 
            user.username || user.email.split('@')[0],
            user.email, 
            user.password, 
            user.fullName || user.nombre || user.username,
            user.role || user.rol,  // ← Cambio aquí
            user.branchId || null, 
            user.sucursal || null, 
            user.active !== false,  // ← Por si viene undefined
            user.createdAt, 
            user.lastLogin || null
        ]
    );
}
console.log(`✅ ${users.length} usuarios migrados`);
        

        // 3. ROUTES
        console.log('🚚 Migrando routes...');
        const routes = JSON.parse(fs.readFileSync('./data/routes.json', 'utf8'));
        for (const route of routes) {
            await client.query(
                `INSERT INTO routes (id, nombre, zona_cobertura, capacidad_maxima, status, vehiculo_asignado, chofer_asignado, descripcion, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (id) DO NOTHING`,
                [
                    route.id,
                    route.nombre,
                    route.zonaCobertura,
                    route.capacidadMaxima,
                    route.status,
                    route.vehiculoAsignado || null,
                    route.choferAsignado || null,
                    route.descripcion || null,
                    route.createdAt || new Date().toISOString()
                ]
            );
        }
        console.log(`✅ ${routes.length} rutas migradas`);

        // 4. PACKAGES
        console.log('📦 Migrando packages...');
        const packages = JSON.parse(fs.readFileSync('./data/packages.json', 'utf8'));
        for (const pkg of packages) {
            await client.query(
                `INSERT INTO packages (
                    id, tracking_number, cliente, telefono, direccion, sucursal_destino, 
                    ruta, prioridad, status, peso_estimado, peso_salida, peso_entrega,
                    descripcion, fecha_creacion, tiempo_salida_reparto, tiempo_entrega,
                    diferencia_minutos, efectividad, incidencia, validacion_receptor,
                    nombre_quien_recibio, cargo_quien_recibio, foto_salida, foto_entrega, firma_digital
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
                 ON CONFLICT (tracking_number) DO NOTHING`,
                [
                    pkg.id,
                    pkg.trackingNumber,
                    pkg.cliente,
                    pkg.telefono || null,
                    pkg.direccion,
                    pkg.sucursalDestino || null,
                    pkg.ruta || null,
                    pkg.prioridad,
                    pkg.status,
                    pkg.pesoEstimado || null,
                    pkg.pesoSalida || null,
                    pkg.pesoEntrega || null,
                    pkg.descripcion || null,
                    pkg.fechaCreacion,
                    pkg.tiempoSalidaReparto || null,
                    pkg.tiempoEntrega || null,
                    pkg.diferenciaMinutos || null,
                    pkg.efectividad || null,
                    pkg.incidencia || 'ninguna',
                    pkg.validacionReceptor ? JSON.stringify(pkg.validacionReceptor) : null,
                    pkg.nombreQuienRecibio || null,
                    pkg.cargoQuienRecibio || null,
                    pkg.fotoSalida || null,
                    pkg.fotoEntrega || null,
                    pkg.firmaDigital || null
                ]
            );
        }
        console.log(`✅ ${packages.length} paquetes migrados`);

        // 5. INCIDENTS
        console.log('⚠️ Migrando incidents...');
        const incidents = JSON.parse(fs.readFileSync('./data/incidents.json', 'utf8'));
        for (const incident of incidents) {
            await client.query(
                `INSERT INTO incidents (
                    id, tracking_number, package_id, type, severity, description,
                    photo, reported_by, branch_id, branch_name, status, created_at, resolved_at, resolution
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                 ON CONFLICT (id) DO NOTHING`,
                [
                    incident.id,
                    incident.trackingNumber || null,
                    incident.packageId || null,
                    incident.type,
                    incident.severity || null,
                    incident.description,
                    incident.photo || null,
                    incident.reportedBy,
                    incident.branchId || null,
                    incident.branchName || null,
                    incident.status,
                    incident.createdAt,
                    incident.resolvedAt || null,
                    incident.resolution || null
                ]
            );
        }
        console.log(`✅ ${incidents.length} incidentes migrados`);

        await client.query('COMMIT');
        console.log('\n🎉 Migración completada exitosamente');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateAllData()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
