function safeFormatDate(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            ...options
        });
    } catch (e) {
        return '-';
    }
}

function safeFormatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('es-MX');
    } catch (e) {
        return '-';
    }
}

function safeParseDate(dateString) {
    if (!dateString || dateString === '-') return null;
    try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (e) {
        return null;
    }
}

function mapPackageFromAPI(pkg) {
    return {
        id: pkg.id,
        trackingNumber: pkg.tracking_number,
        cliente: pkg.cliente,
        telefono: pkg.telefono,
        direccion: pkg.direccion,
        sucursalDestino: pkg.sucursal_destino,
        ruta: pkg.ruta,
        prioridad: pkg.prioridad,
        pesoEstimado: pkg.peso_estimado,
        pesoSalida: pkg.peso_salida,
        pesoEntrega: pkg.peso_entrega,
        descripcion: pkg.descripcion,
        status: pkg.status,
        fechaCreacion: pkg.fecha_creacion,
        tiempoSalidaReparto: pkg.tiempo_salida_reparto,
        tiempoEntrega: pkg.tiempo_entrega,
        incidencia: pkg.incidencia,
        nombreQuienRecibio: pkg.nombre_quien_recibio,
        cargoQuienRecibio: pkg.cargo_quien_recibio,
        fotoSalida: pkg.foto_salida,
        fotoEntrega: pkg.foto_entrega,
        firmaDigital: pkg.firma_digital,
        validacionReceptor: pkg.validacion_receptor
    };
}
