cat > backend/public/js/utils.js << 'EOF'
// Utilidades compartidas
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
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (e) {
        return null;
    }
}
