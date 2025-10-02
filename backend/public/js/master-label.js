function generateMasterLabel(packageData) {
    const route = routes.find(r => r.id === packageData.ruta);
    const routeName = route ? route.nombre : 'Ruta no encontrada';
    
    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    
    const labelHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Master Label - ${packageData.trackingNumber}</title>
            <style>
                @page {
                    size: 4in 6in;
                    margin: 0.2in;
                }
                
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    line-height: 1.2;
                    margin: 0;
                    padding: 10px;
                    background: white;
                }
                
                .label-container {
                    width: 100%;
                    height: 100%;
                    border: 2px solid #000;
                    padding: 10px;
                    box-sizing: border-box;
                }
                
                .header {
                    text-align: center;
                    border-bottom: 1px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 10px;
                }
                
                .company-name {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 2px;
                }
                
                .qr-section {
                    text-align: center;
                    margin: 10px 0;
                }
                
                .qr-placeholder {
                    width: 80px;
                    height: 80px;
                    border: 1px solid #000;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    background: #f0f0f0;
                }
                
                .tracking-section {
                    margin: 10px 0;
                    text-align: center;
                }
                
                .tracking-number {
                    font-size: 18px;
                    font-weight: bold;
                    letter-spacing: 2px;
                    border: 1px solid #000;
                    padding: 5px;
                    margin: 5px 0;
                }
                
                .info-section {
                    margin: 10px 0;
                }
                
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 3px 0;
                    padding: 2px 0;
                    border-bottom: 1px dotted #ccc;
                }
                
                .label {
                    font-weight: bold;
                    width: 40%;
                }
                
                .value {
                    width: 60%;
                    text-align: right;
                }
                
                .address-section {
                    margin: 15px 0;
                    border: 1px solid #000;
                    padding: 8px;
                    background: #f9f9f9;
                }
                
                .address-title {
                    font-weight: bold;
                    text-align: center;
                    margin-bottom: 5px;
                    text-decoration: underline;
                }
                
                .address-text {
                    font-size: 11px;
                    line-height: 1.3;
                }
                
                .priority-badge {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 3px 8px;
                    border: 2px solid;
                    font-weight: bold;
                    font-size: 10px;
                }
                
                .priority-normal {
                    border-color: #666;
                    color: #666;
                }
                
                .priority-alta {
                    border-color: #ff6600;
                    color: #ff6600;
                    background: #fff3e0;
                }
                
                .priority-urgente {
                    border-color: #ff0000;
                    color: #ff0000;
                    background: #ffebee;
                }
                
                .footer {
                    position: absolute;
                    bottom: 10px;
                    left: 10px;
                    right: 10px;
                    text-align: center;
                    font-size: 8px;
                    color: #666;
                }
                
                @media print {
                    .no-print {
                        display: none;
                    }
                }
                
                .button {
                    padding: 10px 20px;
                    font-size: 14px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    margin: 5px;
                }
                
                .print-btn {
                    background: #4299e1;
                    color: white;
                }
                
                .close-btn {
                    background: #666;
                    color: white;
                }
            </style>
        </head>
        <body>
            <div class="label-container">
                <div class="priority-badge priority-${packageData.prioridad}">
                    ${getPriorityText(packageData.prioridad).toUpperCase()}
                </div>
                
                <div class="header">
                    <div class="company-name">🚚 LOGÍSTICA MONTERREY</div>
                    <div>Sistema de Distribución</div>
                </div>
                
                <div class="qr-section">
                    <img src="https://chart.googleapis.com/chart?chs=80x80&cht=qr&chl=${packageData.trackingNumber}" 
                         alt="QR Code ${packageData.trackingNumber}" 
                         style="border: 1px solid #000; display: block; margin: 0 auto;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display: none; width: 80px; height: 80px; border: 1px solid #000; margin: 0 auto; align-items: center; justify-content: center; font-size: 8px; text-align: center; background: #f0f0f0;">
                        QR: ${packageData.trackingNumber}
                    </div>
                </div>
                
                <div class="tracking-section">
                    <div class="tracking-number">${packageData.trackingNumber}</div>
                </div>
                
                <div class="info-section">
                    <div class="info-row">
                        <span class="label">CLIENTE:</span>
                        <span class="value">${packageData.cliente}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">RUTA:</span>
                        <span class="value">${routeName}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">PESO:</span>
                        <span class="value">${packageData.pesoSalida} kg</span>
                    </div>
                    <div class="info-row">
                        <span class="label">FECHA:</span>
                        <span class="value">${new Date().toLocaleDateString('es-MX')}</span>
                    </div>
                    ${packageData.telefono ? `
                    <div class="info-row">
                        <span class="label">TEL:</span>
                        <span class="value">${packageData.telefono}</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="address-section">
                    <div class="address-title">DIRECCIÓN DE ENTREGA</div>
                    <div class="address-text">${packageData.direccion}</div>
                </div>
                
                <div class="footer">
                    ID: ${packageData.id.slice(0, 8)} | Creado: ${new Date(packageData.fechaCreacion).toLocaleString('es-MX')}
                </div>
            </div>
            
            <div class="no-print" style="margin-top: 20px; text-align: center;">
                <button id="printBtn" class="button print-btn">
                    🖨️ Imprimir Etiqueta
                </button>
                <button id="closeBtn" class="button close-btn">
                    Cerrar
                </button>
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(labelHTML);
    printWindow.document.close();
    
    // Configurar event listeners después de crear el documento
    printWindow.addEventListener('load', function() {
        // Precargar la imagen del QR
        const qrImg = printWindow.document.querySelector('img[alt*="QR Code"]');
        let imageLoaded = false;
        
        if (qrImg) {
            qrImg.onload = function() {
                imageLoaded = true;
                console.log('QR cargado exitosamente');
            };
            
            qrImg.onerror = function() {
                console.log('Error cargando QR, mostrando fallback');
                imageLoaded = true; // Considerar como "cargado" para continuar
            };
        }
        
        // Event listeners para botones
        const printBtn = printWindow.document.getElementById('printBtn');
        const closeBtn = printWindow.document.getElementById('closeBtn');
        
        if (printBtn) {
            printBtn.addEventListener('click', function() {
                printWindow.print();
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                printWindow.close();
            });
        }
        
        // Función para mostrar diálogo de impresión
        function showPrintDialog() {
            if (imageLoaded || !qrImg) {
                setTimeout(() => {
                    if (printWindow.confirm('¿Deseas imprimir la etiqueta ahora?')) {
                        printWindow.print();
                    }
                }, 500);
            } else {
                // Esperar un poco más y reintentar
                setTimeout(showPrintDialog, 500);
            }
        }
        
        // Iniciar el proceso de verificación de carga
        setTimeout(showPrintDialog, 1000);
    });
}

// Generar batch de etiquetas para múltiples paquetes
function generateBatchLabels(packageIds) {
    const selectedPackages = packages.filter(pkg => packageIds.includes(pkg.id));
    
    if (selectedPackages.length === 0) {
        alert('No hay paquetes seleccionados para imprimir');
        return;
    }
    
    // Crear ventana con múltiples etiquetas
    const printWindow = window.open('', '_blank');
    
    let batchHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Batch Master Labels</title>
            <style>
                @page {
                    size: A4;
                    margin: 0.5in;
                }
                
                .page-break {
                    page-break-after: always;
                }
                
                .label-wrapper {
                    width: 4in;
                    height: 6in;
                    margin: 0.2in;
                    display: inline-block;
                    vertical-align: top;
                }
                
                .button {
                    padding: 10px 20px;
                    font-size: 14px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    margin: 5px;
                }
                
                .print-btn {
                    background: #4299e1;
                    color: white;
                }
                
                .close-btn {
                    background: #666;
                    color: white;
                }
            </style>
        </head>
        <body>
    `;
    
    selectedPackages.forEach((pkg, index) => {
        const route = routes.find(r => r.id === pkg.ruta);
        const routeName = route ? route.nombre : 'Ruta no encontrada';
        
        batchHTML += `
            <div class="label-wrapper">
                <div style="border: 2px solid #000; padding: 10px; height: 100%; box-sizing: border-box; font-family: 'Courier New', monospace; font-size: 10px;">
                    <div style="text-align: center; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px;">
                        🚚 LOGÍSTICA MONTERREY
                    </div>
                    <div style="text-align: center; margin: 10px 0;">
                        <img src="https://chart.googleapis.com/chart?chs=60x60&cht=qr&chl=${pkg.trackingNumber}" 
                             alt="QR ${pkg.trackingNumber}" 
                             style="border: 1px solid #000;"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display: none; width: 60px; height: 60px; border: 1px solid #000; margin: 0 auto; align-items: center; justify-content: center; font-size: 7px; text-align: center; background: #f0f0f0;">
                            QR: ${pkg.trackingNumber}
                        </div>
                    </div>
                    <div style="text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 1px; margin: 10px 0; border: 1px solid #000; padding: 5px;">
                        ${pkg.trackingNumber}
                    </div>
                    <div style="margin: 10px 0; font-size: 9px;">
                        <div style="margin: 2px 0;"><strong>Cliente:</strong> ${pkg.cliente}</div>
                        <div style="margin: 2px 0;"><strong>Ruta:</strong> ${routeName}</div>
                        <div style="margin: 2px 0;"><strong>Peso:</strong> ${pkg.pesoSalida} kg</div>
                        <div style="margin: 2px 0;"><strong>Prioridad:</strong> ${getPriorityText(pkg.prioridad)}</div>
                    </div>
                    <div style="border: 1px solid #000; padding: 5px; margin: 10px 0; background: #f9f9f9; font-size: 9px;">
                        <div style="font-weight: bold; text-align: center; margin-bottom: 3px;">DIRECCIÓN DE ENTREGA</div>
                        <div>${pkg.direccion}</div>
                    </div>
                    <div style="text-align: center; font-size: 7px; color: #666; margin-top: 5px;">
                        ID: ${pkg.id.slice(0, 8)}
                    </div>
                </div>
            </div>
            ${(index + 1) % 2 === 0 ? '<div class="page-break"></div>' : ''}
        `;
    });
    
    batchHTML += `
            <div style="margin-top: 20px; text-align: center; page-break-inside: avoid;">
                <button id="batchPrintBtn" class="button print-btn">🖨️ Imprimir Todas</button>
                <button id="batchCloseBtn" class="button close-btn">Cerrar</button>
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(batchHTML);
    printWindow.document.close();
    
    // Agregar event listeners después de cargar
    printWindow.addEventListener('load', function() {
        const printBtn = printWindow.document.getElementById('batchPrintBtn');
        const closeBtn = printWindow.document.getElementById('batchCloseBtn');
        
        if (printBtn) {
            printBtn.addEventListener('click', function() {
                printWindow.print();
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                printWindow.close();
            });
        }
    });
}

// Funciones de utilidad
function getPriorityText(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'alta': 'Alta',
        'urgente': 'Urgente'
    };
    return priorityMap[priority] || priority;
}