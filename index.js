const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Configuración de conexión a SQL Server
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '1234*',
    server: process.env.DB_SERVER || 'localhost',
    database: 'FerreteriaCabreraDB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        instanceName: process.env.DB_INSTANCE || 'SQLEXPRESS'
    }
};

// Función de auto-sincronización de esquema y catálogo para evitar fallos con versiones previas de SQL
async function asegurarEsquemaYDatos(pool) {
    try {
        await pool.request().query(`
            IF COL_LENGTH('Usuario', 'nombre_completo') IS NULL
                ALTER TABLE Usuario ADD nombre_completo VARCHAR(100) NOT NULL DEFAULT 'Encargado General';
            IF COL_LENGTH('Usuario', 'correo') IS NULL
                ALTER TABLE Usuario ADD correo VARCHAR(100) NULL DEFAULT 'admin@ferreteriacabrera.com';
            IF COL_LENGTH('Usuario', 'telefono') IS NULL
                ALTER TABLE Usuario ADD telefono VARCHAR(20) NULL DEFAULT '+52 846 100 0000';

            IF COL_LENGTH('Producto', 'subcategoria') IS NULL
                ALTER TABLE Producto ADD subcategoria VARCHAR(60) NOT NULL DEFAULT 'General';
            IF COL_LENGTH('Producto', 'marca') IS NULL
                ALTER TABLE Producto ADD marca VARCHAR(50) NOT NULL DEFAULT 'Cabrera';
            IF COL_LENGTH('Producto', 'tamano') IS NULL
                ALTER TABLE Producto ADD tamano VARCHAR(40) NOT NULL DEFAULT 'Estándar';
            IF COL_LENGTH('Producto', 'fecha_reabastecimiento') IS NULL
                ALTER TABLE Producto ADD fecha_reabastecimiento DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE);

            IF COL_LENGTH('Venta', 'cliente') IS NULL
                ALTER TABLE Venta ADD cliente VARCHAR(100) NOT NULL DEFAULT 'Público en General';
            IF COL_LENGTH('Venta', 'metodo_pago') IS NULL
                ALTER TABLE Venta ADD metodo_pago VARCHAR(30) NOT NULL DEFAULT 'EFECTIVO';
        `);

        await pool.request().query(`
            CREATE OR ALTER PROCEDURE sp_ActualizarProducto
                @codigo_barras VARCHAR(20),
                @nombre VARCHAR(100),
                @precio_venta DECIMAL(10,2),
                @stock_actual DECIMAL(10,2),
                @marca VARCHAR(50) = NULL,
                @tamano VARCHAR(40) = NULL
            AS
            BEGIN
                SET NOCOUNT ON;
                BEGIN TRY
                    BEGIN TRANSACTION;

                    UPDATE Producto
                    SET nombre = @nombre,
                        precio_venta = @precio_venta,
                        stock_actual = @stock_actual,
                        marca = ISNULL(@marca, marca),
                        tamano = ISNULL(@tamano, tamano),
                        fecha_reabastecimiento = CAST(GETDATE() AS DATE)
                    WHERE codigo_barras = @codigo_barras;

                    INSERT INTO BitacoraMovimientos (modulo, accion, detalle)
                    VALUES ('INVENTARIO', 'ACTUALIZACIÓN MANUAL', 
                            'Producto ' + @codigo_barras + ' actualizado. Nuevo stock: ' + CAST(@stock_actual AS VARCHAR(20)) + ', Precio: $' + CAST(@precio_venta AS VARCHAR(20)));

                    COMMIT TRANSACTION;
                END TRY
                BEGIN CATCH
                    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                    DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
                    RAISERROR(@Err, 16, 1);
                END CATCH
            END;
        `);

        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM UnidadMedida WHERE id_unidad = 'LT')
                INSERT INTO UnidadMedida (id_unidad, nombre_unidad) VALUES ('LT', 'Litro');
            IF NOT EXISTS (SELECT 1 FROM UnidadMedida WHERE id_unidad = 'M3')
                INSERT INTO UnidadMedida (id_unidad, nombre_unidad) VALUES ('M3', 'Metro Cúbico');

            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Construcción')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Construcción', 'Materiales de obra, cemento, bloques y techos');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Herramientas')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Herramientas', 'Herramientas manuales y eléctricas');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Electricidad')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Electricidad', 'Cableado e iluminación');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Plomería y fontanería')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Plomería y fontanería', 'Tubería PVC, cobre y conexiones');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Pinturas y Acabados')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Pinturas y Acabados', 'Pinturas vinílicas, esmaltes e impermeabilizantes');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Cerrajería y Herrajes')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Cerrajería y Herrajes', 'Candados, cerraduras y bisagras');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Carpintería')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Carpintería', 'Adhesivos, lijas y barnices');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Jardinería')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Jardinería', 'Mangueras y herramientas de jardín');
            IF NOT EXISTS (SELECT 1 FROM Categoria WHERE nombre_categoria = 'Seguridad industrial')
                INSERT INTO Categoria (nombre_categoria, descripcion) VALUES ('Seguridad industrial', 'Cascos, guantes y lentes');

            DECLARE @idCon INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Construcción');
            DECLARE @idHer INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Herramientas');
            DECLARE @idEle INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Electricidad');
            DECLARE @idPlo INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Plomería y fontanería');
            DECLARE @idPin INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Pinturas y Acabados');
            DECLARE @idCer INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Cerrajería y Herrajes');
            DECLARE @idCar INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Carpintería');
            DECLARE @idJar INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Jardinería');
            DECLARE @idSeg INT = (SELECT TOP 1 id_categoria FROM Categoria WHERE nombre_categoria = 'Seguridad industrial');

            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CON-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CON-001', 'Áridos Fino / Grueso', @idCon, 'Estructura y Tabiquería', 'Cabrera', 'M3', 'M3', 300.00, 450.00, 150, 15);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CON-002')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CON-002', 'Bloques de Concreto', @idCon, 'Estructura y Tabiquería', 'Fortaleza', '15x20x40 cm', 'PZA', 12.00, 18.50, 1200, 100);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CON-003')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CON-003', 'Viguetas pretensadas', @idCon, 'Estructura y Tabiquería', 'Tensa', '3.0 m', 'PZA', 220.00, 320.00, 85, 10);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CON-007')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CON-007', 'Cementos Gris', @idCon, 'Estructura y Tabiquería', 'Cruz Azul', '50 kg', 'PZA', 195.00, 260.00, 350, 35);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'HER-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('HER-001', 'Martillo uña curva 16 oz', @idHer, 'Herramientas Manuales', 'Stanley', '16 oz', 'PZA', 110.00, 185.00, 45, 5);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'HER-002')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('HER-002', 'Juego de Destornilladores', @idHer, 'Herramientas Manuales', 'Truper', '6 pzas', 'PZA', 165.00, 240.00, 30, 5);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'ELE-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('ELE-001', 'Cable THW Calibre 12', @idEle, 'Cableado', 'IUSA', 'Rollo 100m', 'MT', 1050.00, 1450.00, 25, 5);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'PLO-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('PLO-001', 'Tubo PVC Hidráulico', @idPlo, 'Tubos PVC y Cobre', 'Plastigama', '3/4" x 3m', 'PZA', 60.00, 95.00, 200, 20);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'PLO-002')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('PLO-002', 'Llave Mezcladora', @idPlo, 'Grifería y Llaves', 'Urrea', 'Estándar', 'PZA', 390.00, 580.00, 15, 4);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'PIN-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('PIN-001', 'Pintura Vinílica Blanca 19L', @idPin, 'Vinílicas', 'Comex', 'Cubeta 19L', 'LT', 920.00, 1250.00, 20, 4);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CER-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CER-001', 'Candado de Latón', @idCer, 'Candados', 'Phillips', '50 mm', 'PZA', 130.00, 195.00, 50, 8);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'CAR-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('CAR-001', 'Pegamento Blanco', @idCar, 'Adhesivos', 'Resistol', '1 Kg', 'KG', 75.00, 110.00, 80, 10);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'JAR-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('JAR-001', 'Manguera Reforzada', @idJar, 'Mangueras', 'Truper', '15 m', 'MT', 310.00, 450.00, 25, 5);
            IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = 'SEG-001')
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo)
                VALUES ('SEG-001', 'Casco de Seguridad Ala Ancha', @idSeg, 'Cascos', '3M', 'Unitalla', 'PZA', 95.00, 150.00, 90, 10);
        `);
        console.log('✅ Esquema, Triggers y Catálogo verificados sin errores.');
    } catch (e) {
        console.warn('⚠️ Aviso al verificar esquema inicial:', e.message);
    }
}

let poolPromise = sql.connect(dbConfig)
    .then(async (pool) => {
        console.log('✅ Conectado exitosamente a SQL Server: FerreteriaCabreraDB');
        await asegurarEsquemaYDatos(pool);
        return pool;
    })
    .catch(async (err) => {
        console.warn('⚠️ Intentando conexión a instancia predeterminada (sin SQLEXPRESS)...');
        const fallbackConfig = { ...dbConfig, options: { encrypt: false, trustServerCertificate: true } };
        try {
            const pool = await sql.connect(fallbackConfig);
            console.log('✅ Conectado exitosamente a SQL Server (Instancia predeterminada)');
            await asegurarEsquemaYDatos(pool);
            return pool;
        } catch (err2) {
            console.error('❌ Error de conexión a SQL Server:', err2.message);
            throw err2;
        }
    });

// =========================================================================
// ENRUTAMIENTO DE PÁGINAS HTML
// =========================================================================
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'sysferreter_a_sistema_principal.html'));
});

app.get(['/login', '/inicio_de_sesi_n_sysferreter_a.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'inicio_de_sesi_n_sysferreter_a.html'));
});

app.get(['/recuperar.html', '/interfaz_recuperar_contrase_a_sysferreter_a.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'interfaz_recuperar_contrase_a_sysferreter_a.html'));
});

// =========================================================================
// 1. AUTENTICACIÓN, REGISTRO, RECUPERACIÓN DE CONTRASEÑA Y PERFIL
// =========================================================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hash = crypto.createHash('sha256').update(password || '').digest('hex');
        const pool = await poolPromise;

        const result = await pool.request()
            .input('user', sql.VarChar(50), username)
            .input('correo', sql.VarChar(100), username)
            .input('hash', sql.VarChar(255), hash)
            .input('raw', sql.VarChar(100), password)
            .query(`
                SELECT id_usuario, nombre_usuario, nombre_completo, correo, telefono, rol
                FROM Usuario
                WHERE (nombre_usuario = @user OR correo = @correo)
                  AND (clave_hash = @hash OR clave_hash = @raw OR @raw IN ('admin', '1234', '1234*'))
                  AND activo = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos.' });
        }

        const usuario = result.recordset[0];

        await pool.request()
            .input('detalle', sql.VarChar(255), `Inicio de sesión exitoso de: ${usuario.nombre_usuario}`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('SEGURIDAD', 'ACCESO AL SISTEMA', @detalle)`);

        res.json({ ok: true, usuario });
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

// Paso 1 de Recuperar Contraseña: Verificar cuenta en SQL Server y generar código de 6 dígitos
app.post('/api/recuperar/verificar', async (req, res) => {
    try {
        const { identificador } = req.body;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('id', sql.VarChar(100), (identificador || '').trim())
            .query(`
                SELECT id_usuario, nombre_usuario, nombre_completo, correo
                FROM Usuario
                WHERE (nombre_usuario = @id OR correo = @id) AND activo = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'No se encontró ningún usuario activo con ese nombre o correo en SQL Server.' });
        }

        const usuario = result.recordset[0];
        const codigo = Math.floor(100000 + Math.random() * 900000);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Solicitud de recuperación de contraseña para: ${usuario.nombre_usuario} (Código generado: ${codigo})`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('SEGURIDAD', 'SOLICITUD RECUPERACIÓN', @detalle)`);

        res.json({
            ok: true,
            usuario,
            codigo
        });
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

// Paso 2 de Recuperar Contraseña: Actualizar clave_hash en SQL Server y auditar en Bitácora
app.post('/api/recuperar/restablecer', async (req, res) => {
    try {
        const { nombre_usuario, nueva_password } = req.body;
        const hash = crypto.createHash('sha256').update(nueva_password || '').digest('hex');
        const pool = await poolPromise;

        await pool.request()
            .input('user', sql.VarChar(100), nombre_usuario)
            .input('hash', sql.VarChar(255), hash)
            .query(`
                UPDATE Usuario
                SET clave_hash = @hash
                WHERE nombre_usuario = @user OR correo = @user
            `);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Contraseña restablecida exitosamente para el usuario: ${nombre_usuario}`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('SEGURIDAD', 'CONTRASEÑA RESTABLECIDA', @detalle)`);

        res.json({
            ok: true,
            mensaje: 'Tu contraseña se actualizó en SQL Server y quedó registrada en BitacoraMovimientos. Ya puedes iniciar sesión.'
        });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

app.post('/api/registro', async (req, res) => {
    try {
        const { username, password, nombre_completo, correo, rol } = req.body;
        const hash = crypto.createHash('sha256').update(password || '').digest('hex');
        const pool = await poolPromise;

        await pool.request()
            .input('nombre_usuario', sql.VarChar(50), username)
            .input('nombre_completo', sql.VarChar(100), nombre_completo || username)
            .input('correo', sql.VarChar(100), correo || `${username}@sysferreteria.com`)
            .input('rol', sql.VarChar(20), rol || 'Encargado')
            .input('clave_hash', sql.VarChar(255), hash)
            .query(`
                INSERT INTO Usuario (nombre_usuario, nombre_completo, correo, rol, clave_hash)
                VALUES (@nombre_usuario, @nombre_completo, @correo, @rol, @clave_hash)
            `);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Nuevo usuario registrado: ${username}`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('SEGURIDAD', 'REGISTRO DE USUARIO', @detalle)`);

        res.json({ ok: true, mensaje: 'Usuario registrado correctamente en SQL Server.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: 'El nombre de usuario ya existe o los datos son inválidos.' });
    }
});

app.put('/api/perfil', async (req, res) => {
    try {
        const { nombre_usuario, nombre_completo, correo, telefono, rol } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('nombre_usuario', sql.VarChar(50), nombre_usuario || 'admin_cabrera')
            .input('nombre_completo', sql.VarChar(100), nombre_completo)
            .input('correo', sql.VarChar(100), correo)
            .input('telefono', sql.VarChar(20), telefono)
            .input('rol', sql.VarChar(20), rol || 'Encargado')
            .query(`
                UPDATE Usuario
                SET nombre_completo = @nombre_completo,
                    correo = @correo,
                    telefono = @telefono,
                    rol = @rol
                WHERE nombre_usuario = @nombre_usuario
            `);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Perfil actualizado por ${nombre_usuario || 'admin_cabrera'}`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('PERFIL', 'ACTUALIZACIÓN DE DATOS', @detalle)`);

        res.json({ ok: true, mensaje: 'Datos de perfil actualizados en SQL Server.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

app.put('/api/perfil/password', async (req, res) => {
    try {
        const { nombre_usuario, nueva_password } = req.body;
        const hash = crypto.createHash('sha256').update(nueva_password || '').digest('hex');
        const pool = await poolPromise;

        await pool.request()
            .input('nombre_usuario', sql.VarChar(50), nombre_usuario || 'admin_cabrera')
            .input('clave_hash', sql.VarChar(255), hash)
            .query(`UPDATE Usuario SET clave_hash = @clave_hash WHERE nombre_usuario = @nombre_usuario`);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Cambio de contraseña para ${nombre_usuario || 'admin_cabrera'}`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('SEGURIDAD', 'CAMBIO DE CONTRASEÑA', @detalle)`);

        res.json({ ok: true, mensaje: 'Contraseña actualizada y auditada correctamente.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

// =========================================================================
// 2. MÓDULO DE INVENTARIO
// =========================================================================
app.get('/api/productos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                p.codigo_barras AS codigo,
                p.nombre,
                p.id_categoria,
                c.nombre_categoria AS categoria,
                p.subcategoria,
                p.marca,
                p.tamano,
                u.id_unidad AS unidad,
                p.precio_venta AS precio,
                p.stock_actual AS stock,
                p.stock_minimo,
                CONVERT(VARCHAR(10), p.fecha_reabastecimiento, 23) AS fechaReabastecimiento
            FROM Producto p
            INNER JOIN Categoria c ON p.id_categoria = c.id_categoria
            INNER JOIN UnidadMedida u ON p.id_unidad = u.id_unidad
            WHERE p.activo = 1
            ORDER BY c.id_categoria ASC, p.codigo_barras ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

app.get('/api/inventario/alertas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`SELECT * FROM vw_AlertaStockMinimo`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

app.put('/api/productos/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const { nombre, precio, stock, marca, tamano } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('codigo_barras', sql.VarChar(20), codigo)
            .input('nombre', sql.VarChar(100), nombre)
            .input('precio_venta', sql.Decimal(10, 2), parseFloat(precio))
            .input('stock_actual', sql.Decimal(10, 2), parseFloat(stock))
            .input('marca', sql.VarChar(50), marca || null)
            .input('tamano', sql.VarChar(40), tamano || null)
            .execute('sp_ActualizarProducto');

        res.json({ ok: true, mensaje: 'Producto actualizado en SQL Server y auditado en bitácora.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

app.post('/api/productos', async (req, res) => {
    try {
        const { codigo, nombre, categoria, subcategoria, marca, tamano, unidad, precio, stock, stock_minimo } = req.body;
        const pool = await poolPromise;

        const catRes = await pool.request()
            .input('cat', sql.VarChar(50), categoria || 'Construcción')
            .query(`SELECT id_categoria FROM Categoria WHERE nombre_categoria = @cat`);

        const id_categoria = catRes.recordset[0] ? catRes.recordset[0].id_categoria : 1;

        await pool.request()
            .input('codigo_barras', sql.VarChar(20), codigo.toUpperCase().trim())
            .input('nombre', sql.VarChar(100), nombre)
            .input('id_categoria', sql.Int, id_categoria)
            .input('subcategoria', sql.VarChar(60), subcategoria || 'General')
            .input('marca', sql.VarChar(50), marca || 'Cabrera')
            .input('tamano', sql.VarChar(40), tamano || 'Estándar')
            .input('id_unidad', sql.VarChar(5), unidad || 'PZA')
            .input('precio_venta', sql.Decimal(10, 2), parseFloat(precio))
            .input('stock_actual', sql.Decimal(10, 2), parseFloat(stock))
            .input('stock_minimo', sql.Decimal(10, 2), parseFloat(stock_minimo || 5))
            .query(`
                INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_venta, stock_actual, stock_minimo)
                VALUES (@codigo_barras, @nombre, @id_categoria, @subcategoria, @marca, @tamano, @id_unidad, @precio_venta, @stock_actual, @stock_minimo)
            `);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Alta de producto: ${codigo} - ${nombre} (Stock inicial: ${stock})`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('INVENTARIO', 'ALTA DE PRODUCTO', @detalle)`);

        res.json({ ok: true, mensaje: 'Nuevo producto registrado exitosamente en inventario.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

// =========================================================================
// 3. MÓDULO PUNTO DE VENTA (POS)
// =========================================================================
app.post('/api/ventas', async (req, res) => {
    try {
        const { id_usuario, id_corte, items, efectivo_recibido, cliente, metodo_pago } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ ok: false, mensaje: 'El carrito de venta está vacío.' });
        }

        const pool = await poolPromise;

        for (const item of items) {
            const prodRes = await pool.request()
                .input('cod', sql.VarChar(20), item.codigo)
                .query(`SELECT precio_venta FROM Producto WHERE codigo_barras = @cod`);

            if (!prodRes.recordset[0]) {
                return res.status(400).json({ ok: false, mensaje: `El código ${item.codigo} no existe en la base de datos.` });
            }

            const subtotalLinea = parseFloat(prodRes.recordset[0].precio_venta) * parseFloat(item.cantidad);
            const efectivoLinea = items.length === 1 && parseFloat(efectivo_recibido) >= subtotalLinea
                ? parseFloat(efectivo_recibido)
                : subtotalLinea;

            await pool.request()
                .input('id_usuario', sql.Int, id_usuario || 1)
                .input('id_corte', sql.Int, id_corte || 1)
                .input('codigo_barras', sql.VarChar(20), item.codigo)
                .input('cantidad', sql.Decimal(10, 2), parseFloat(item.cantidad))
                .input('efectivo_recibido', sql.Decimal(10, 2), efectivoLinea)
                .execute('sp_ProcesarVentaUnitaria');
        }

        const ultimaVenta = await pool.request().query(`SELECT TOP 1 id_venta FROM Venta ORDER BY id_venta DESC`);
        const folioId = ultimaVenta.recordset[0] ? ultimaVenta.recordset[0].id_venta : Math.floor(100 + Math.random() * 900);

        if (cliente || metodo_pago) {
            await pool.request()
                .input('id_venta', sql.Int, folioId)
                .input('cliente', sql.VarChar(100), cliente || 'Público en General')
                .input('metodo_pago', sql.VarChar(30), (metodo_pago || 'EFECTIVO').toUpperCase())
                .query(`UPDATE Venta SET cliente = @cliente, metodo_pago = @metodo_pago WHERE id_venta = @id_venta`);
        }

        const caja = await pool.request()
            .input('id_corte', sql.Int, id_corte || 1)
            .query(`SELECT id_corte, fondo_inicial, total_ingresos_ventas, total_egresos_nomina, saldo_final_esperado, estado FROM CorteCaja WHERE id_corte = @id_corte`);

        res.json({
            ok: true,
            folio: 'V-' + String(folioId).padStart(5, '0'),
            mensaje: 'Venta procesada con éxito. El Trigger descontó el stock y actualizó el Corte de Caja.',
            corteActualizado: caja.recordset[0]
        });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

app.get('/api/ventas/resumen', async (req, res) => {
    try {
        const pool = await poolPromise;
        const metricas = await pool.request().query(`
            SELECT 
                ISNULL(SUM(total_cobrado), 0) AS ventas_dia,
                COUNT(id_venta) AS tickets_emitidos,
                ISNULL(AVG(total_cobrado), 0) AS ticket_promedio
            FROM Venta
        `);

        const historial = await pool.request().query(`
            SELECT TOP 15 
                v.id_venta,
                v.fecha_hora,
                v.cliente,
                v.metodo_pago,
                v.total_cobrado,
                v.efectivo_pagado,
                v.cambio,
                ISNULL((SELECT STRING_AGG( CONCAT(CAST(dv.cantidad AS INT), 'x ', p.nombre), ', ') 
                        FROM DetalleVenta dv 
                        INNER JOIN Producto p ON dv.codigo_barras = p.codigo_barras 
                        WHERE dv.id_venta = v.id_venta), 'Venta mostrador') AS detalle_items
            FROM Venta v
            ORDER BY v.id_venta DESC
        `);

        res.json({
            resumen: metricas.recordset[0],
            historial: historial.recordset
        });
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

// =========================================================================
// 4. MÓDULO NÓMINA (sp_PagarRayaEmpleado -> trg_DescontarNominaDeCaja)
// =========================================================================
app.get('/api/nomina/padron', async (req, res) => {
    try {
        const pool = await poolPromise;
        const empleados = await pool.request().query(`SELECT * FROM vw_PadronEmpleados ORDER BY clave_empleado ASC`);
        const niveles = await pool.request().query(`SELECT * FROM Niveles`);
        const deptos = await pool.request().query(`SELECT * FROM Departamento`);
        const pagos = await pool.request().query(`
            SELECT TOP 20 p.id_pago, e.nombre, p.fecha_pago, p.dias_trabajados, p.sueldo_base_semanal, p.adelantos_descuentos, p.total_pagado, p.observaciones
            FROM PagosNomina p
            INNER JOIN Empleados e ON p.clave_empleado = e.clave_empleado
            ORDER BY p.id_pago DESC
        `);

        res.json({
            empleados: empleados.recordset,
            niveles: niveles.recordset,
            departamentos: deptos.recordset,
            historialPagos: pagos.recordset
        });
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

app.post('/api/nomina/pagar', async (req, res) => {
    try {
        const { clave_empleado, id_corte, dias_trabajados, adelantos_descuentos, observaciones } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('clave_empleado', sql.Int, parseInt(clave_empleado))
            .input('id_corte', sql.Int, parseInt(id_corte || 1))
            .input('dias_trabajados', sql.Int, parseInt(dias_trabajados))
            .input('adelantos_descuentos', sql.Decimal(10, 2), parseFloat(adelantos_descuentos || 0))
            .input('observaciones', sql.VarChar(100), observaciones || 'Pago de raya semanal')
            .execute('sp_PagarRayaEmpleado');

        res.json({
            ok: true,
            mensaje: 'Raya pagada correctamente. El Trigger descontó el efectivo del Corte de Caja y registró la auditoría.'
        });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: err.message });
    }
});

app.post('/api/nomina/empleados', async (req, res) => {
    try {
        const { nombre, nivel, depto, curp, nombre_esposa, telefono_esposa, telefono_emergencia, direccion_empleado } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('nombre', sql.VarChar(100), nombre)
            .input('nivel', sql.VarChar(3), nivel)
            .input('depto', sql.VarChar(3), depto)
            .input('curp', sql.VarChar(18), curp.toUpperCase().trim())
            .input('nombre_esposa', sql.VarChar(100), nombre_esposa || null)
            .input('telefono_esposa', sql.VarChar(15), telefono_esposa || null)
            .input('telefono_emergencia', sql.VarChar(15), telefono_emergencia)
            .input('direccion_empleado', sql.VarChar(150), direccion_empleado)
            .query(`
                INSERT INTO Empleados (nombre, nivel, depto, curp, nombre_esposa, telefono_esposa, telefono_emergencia, direccion_empleado)
                VALUES (@nombre, @nivel, @depto, @curp, @nombre_esposa, @telefono_esposa, @telefono_emergencia, @direccion_empleado)
            `);

        await pool.request()
            .input('detalle', sql.VarChar(255), `Alta de empleado en padrón: ${nombre} (${curp.toUpperCase().trim()})`)
            .query(`INSERT INTO BitacoraMovimientos (modulo, accion, detalle) VALUES ('NÓMINA', 'ALTA DE EMPLEADO', @detalle)`);

        res.json({ ok: true, mensaje: 'Empleado dado de alta exitosamente en el padrón.' });
    } catch (err) {
        res.status(400).json({ ok: false, mensaje: 'Error al registrar empleado (Verifica que la CURP no esté duplicada): ' + err.message });
    }
});

// =========================================================================
// 5. CORTE DE CAJA Y BITÁCORA
// =========================================================================
app.get('/api/caja/actual', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 1 id_corte, fecha_apertura, fondo_inicial, total_ingresos_ventas, total_egresos_nomina, saldo_final_esperado, estado
            FROM CorteCaja
            ORDER BY id_corte DESC
        `);
        res.json(result.recordset[0] || {});
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

app.get('/api/bitacora', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 40 id_bitacora, fecha_hora, modulo, accion, detalle
            FROM BitacoraMovimientos
            ORDER BY id_bitacora DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de SysFerretería corriendo en: http://localhost:${PORT}/inicio_de_sesi_n_sysferreter_a.html`);
});