const express = require('express');
const QRCode = require('qrcode');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();
router.use(authenticateToken);

// Generar código ZPL para etiqueta Zebra
router.get('/generate-zpl/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        // Leer paquete de PostgreSQL
        const result = await pool.query(
            'SELECT * FROM packages WHERE tracking_number = $1',
            [trackingNumber]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }

        const pkg = result.rows[0];

        // Generar código QR en base64
        const qrDataURL = await QRCode.toDataURL(trackingNumber, {
            width: 200,
            margin: 1
        });
        
        const qrBase64 = qrDataURL.split(',')[1];

        // Construir código ZPL para Zebra ZD421 (4" x 6" / 10cm x 15cm)
        const zpl = `
^XA
^CI28
^PW812
^LL1218

~DGR:QR.GRF,${Math.ceil(qrBase64.length * 0.75)},${Math.ceil(Math.sqrt(qrBase64.length))},${qrBase64}

^FO50,50^A0N,40,40^FDLOGISTICA MONTERREY^FS
^FO50,100^A0N,30,30^FDSistema de Distribucion^FS

^FO50,180^GB712,3,3^FS

^FO50,220^BQN,2,8
^FDQA,${trackingNumber}^FS

^FO350,220^A0N,50,50^FD${trackingNumber}^FS

^FO50,480^GB712,3,3^FS

^FO50,520^A0N,35,35^FDCLIENTE:^FS
^FO50,570^A0N,40,40^FD${pkg.cliente}^FS

^FO50,650^A0N,35,35^FDRUTA:^FS
^FO50,700^A0N,40,40^FD${pkg.ruta || 'N/A'}^FS

^FO50,780^A0N,35,35^FDPESO:^FS
^FO50,830^A0N,40,40^FD${pkg.peso_estimado || 0} kg^FS

^FO50,920^GB712,3,3^FS

^FO50,960^A0N,30,30^FDDIRECCION DE ENTREGA:^FS
^FO50,1010^A0N,28,28^FB712,3,0,L^FD${pkg.direccion}^FS

^FO50,1150^A0N,25,25^FDFECHA: ${new Date(pkg.fecha_creacion).toLocaleDateString('es-MX')}^FS

^XZ
`;

        res.set('Content-Type', 'text/plain');
        res.send(zpl);

    } catch (error) {
        console.error('Error generando ZPL:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando etiqueta'
        });
    }
});

// Endpoint alternativo que devuelve el ZPL en JSON
router.get('/zpl/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM packages WHERE tracking_number = $1',
            [trackingNumber]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paquete no encontrado'
            });
        }

        const pkg = result.rows[0];

        const qrDataURL = await QRCode.toDataURL(trackingNumber, {
            width: 200,
            margin: 1
        });
        
        const qrBase64 = qrDataURL.split(',')[1];

        const zpl = `^XA
^CI28
^PW812
^LL1218
^FO50,50^A0N,40,40^FDLOGISTICA MONTERREY^FS
^FO50,100^A0N,30,30^FDSistema de Distribucion^FS
^FO50,180^GB712,3,3^FS
^FO50,220^BQN,2,8^FDQA,${trackingNumber}^FS
^FO350,220^A0N,50,50^FD${trackingNumber}^FS
^FO50,480^GB712,3,3^FS
^FO50,520^A0N,35,35^FDCLIENTE:^FS
^FO50,570^A0N,40,40^FD${pkg.cliente}^FS
^FO50,650^A0N,35,35^FDRUTA:^FS
^FO50,700^A0N,40,40^FD${pkg.ruta || 'N/A'}^FS
^FO50,780^A0N,35,35^FDPESO:^FS
^FO50,830^A0N,40,40^FD${pkg.peso_estimado || 0} kg^FS
^FO50,920^GB712,3,3^FS
^FO50,960^A0N,30,30^FDDIRECCION DE ENTREGA:^FS
^FO50,1010^A0N,28,28^FB712,3,0,L^FD${pkg.direccion}^FS
^FO50,1150^A0N,25,25^FDFECHA: ${new Date(pkg.fecha_creacion).toLocaleDateString('es-MX')}^FS
^XZ`;

        res.json({
            success: true,
            data: {
                trackingNumber,
                zpl,
                package: pkg
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando etiqueta'
        });
    }
});

module.exports = router;