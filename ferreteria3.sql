/* =========================================================================
   PROYECTO: SISTEMA DE GESTIÓN PARA FERRETERÍA CABRERA (SYSFERRETERÍA)
   MOTOR:    Microsoft SQL Server (T-SQL)
   MÓDULOS:  1. Inventario | 2. Nómina | 3. Punto de Venta (POS) y Caja
   ========================================================================= */

USE master;
GO

IF DB_ID('FerreteriaCabreraDB') IS NOT NULL
BEGIN
    ALTER DATABASE FerreteriaCabreraDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE FerreteriaCabreraDB;
END
GO

CREATE DATABASE FerreteriaCabreraDB;
GO

USE FerreteriaCabreraDB;
GO

/* =========================================================================
   SEGURIDAD Y AUDITORÍA BASE
   ========================================================================= */

CREATE TABLE Usuario (
    id_usuario INT IDENTITY(1,1) PRIMARY KEY,
    nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
    nombre_completo VARCHAR(100) NOT NULL DEFAULT 'Encargado General',
    correo VARCHAR(100) NULL DEFAULT 'admin@ferreteriacabrera.com',
    telefono VARCHAR(20) NULL DEFAULT '+52 846 100 0000',
    rol VARCHAR(20) NOT NULL DEFAULT 'Encargado',
    clave_hash VARCHAR(255) NOT NULL,
    activo BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE BitacoraMovimientos (
    id_bitacora INT IDENTITY(1,1) PRIMARY KEY,
    fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
    modulo VARCHAR(30) NOT NULL,
    accion VARCHAR(100) NOT NULL,
    detalle VARCHAR(255) NULL
);
GO

/* =========================================================================
   MÓDULO 1: INVENTARIO Y CATÁLOGO
   ========================================================================= */

CREATE TABLE Categoria (
    id_categoria INT IDENTITY(1,1) PRIMARY KEY,
    nombre_categoria VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(150) NULL
);
GO

CREATE TABLE UnidadMedida (
    id_unidad VARCHAR(5) PRIMARY KEY,
    nombre_unidad VARCHAR(30) NOT NULL
);
GO

CREATE TABLE Producto (
    codigo_barras VARCHAR(20) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    id_categoria INT NOT NULL,
    subcategoria VARCHAR(60) NOT NULL DEFAULT 'General',
    marca VARCHAR(50) NOT NULL DEFAULT 'Cabrera',
    tamano VARCHAR(40) NOT NULL DEFAULT 'Estándar',
    id_unidad VARCHAR(5) NOT NULL DEFAULT 'PZA',
    precio_compra DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(10,2) NOT NULL,
    stock_actual DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock_minimo DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    fecha_reabastecimiento DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    activo BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Producto_Categoria FOREIGN KEY (id_categoria) REFERENCES Categoria(id_categoria),
    CONSTRAINT FK_Producto_Unidad FOREIGN KEY (id_unidad) REFERENCES UnidadMedida(id_unidad),
    CONSTRAINT CHK_Precios_Positivos CHECK (precio_venta >= 0 AND precio_compra >= 0),
    CONSTRAINT CHK_Stock_NoNegativo CHECK (stock_actual >= 0)
);
GO

CREATE NONCLUSTERED INDEX IX_Producto_Nombre ON Producto(nombre);
GO

/* =========================================================================
   MÓDULO 2: NÓMINA (Niveles, Departamentos y Empleados)
   ========================================================================= */

CREATE TABLE Niveles (
    nivel VARCHAR(3) PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL,
    saldo_semanal DECIMAL(10,2) NOT NULL,
    CONSTRAINT CHK_Saldo_Positivo CHECK (saldo_semanal > 0)
);
GO

CREATE TABLE Departamento (
    depto VARCHAR(3) PRIMARY KEY,
    nombre_dpto VARCHAR(30) NOT NULL,
    ubicacion VARCHAR(10) NOT NULL
);
GO

CREATE TABLE Empleados (
    clave_empleado INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nivel VARCHAR(3) NOT NULL,
    depto VARCHAR(3) NOT NULL,
    curp VARCHAR(18) NOT NULL UNIQUE,
    nombre_esposa VARCHAR(100) NULL,
    telefono_esposa VARCHAR(15) NULL,
    telefono_emergencia VARCHAR(15) NOT NULL,
    direccion_empleado VARCHAR(150) NOT NULL,
    fecha_ingreso DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    activo BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Empleados_Niveles FOREIGN KEY (nivel) REFERENCES Niveles(nivel),
    CONSTRAINT FK_Empleados_Departamento FOREIGN KEY (depto) REFERENCES Departamento(depto)
);
GO

/* =========================================================================
   MÓDULO 3: PUNTO DE VENTA (POS), CORTE DE CAJA Y CONEXIÓN CON NÓMINA
   ========================================================================= */

CREATE TABLE CorteCaja (
    id_corte INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    fecha_apertura DATETIME NOT NULL DEFAULT GETDATE(),
    fecha_cierre DATETIME NULL,
    fondo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_ingresos_ventas DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_egresos_nomina DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    saldo_final_esperado AS (fondo_inicial + total_ingresos_ventas - total_egresos_nomina),
    estado VARCHAR(15) NOT NULL DEFAULT 'ABIERTO',
    CONSTRAINT FK_CorteCaja_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario)
);
GO

CREATE TABLE PagosNomina (
    id_pago INT IDENTITY(1,1) PRIMARY KEY,
    clave_empleado INT NOT NULL,
    id_corte INT NOT NULL,
    fecha_pago DATETIME NOT NULL DEFAULT GETDATE(),
    dias_trabajados INT NOT NULL DEFAULT 6,
    sueldo_base_semanal DECIMAL(10,2) NOT NULL,
    adelantos_descuentos DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_pagado DECIMAL(10,2) NOT NULL,
    observaciones VARCHAR(100) NULL,
    CONSTRAINT FK_PagosNomina_Empleado FOREIGN KEY (clave_empleado) REFERENCES Empleados(clave_empleado),
    CONSTRAINT FK_PagosNomina_CorteCaja FOREIGN KEY (id_corte) REFERENCES CorteCaja(id_corte),
    CONSTRAINT CHK_TotalPagado CHECK (total_pagado >= 0)
);
GO

CREATE TABLE Venta (
    id_venta INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_corte INT NOT NULL,
    cliente VARCHAR(100) NOT NULL DEFAULT 'Público en General',
    metodo_pago VARCHAR(30) NOT NULL DEFAULT 'EFECTIVO',
    fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
    total_cobrado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    efectivo_pagado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cambio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT FK_Venta_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT FK_Venta_CorteCaja FOREIGN KEY (id_corte) REFERENCES CorteCaja(id_corte)
);
GO

CREATE TABLE DetalleVenta (
    id_detalle INT IDENTITY(1,1) PRIMARY KEY,
    id_venta INT NOT NULL,
    codigo_barras VARCHAR(20) NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_DetalleVenta_Venta FOREIGN KEY (id_venta) REFERENCES Venta(id_venta),
    CONSTRAINT FK_DetalleVenta_Producto FOREIGN KEY (codigo_barras) REFERENCES Producto(codigo_barras),
    CONSTRAINT CHK_Cantidad_Positiva CHECK (cantidad > 0)
);
GO

/* =========================================================================
   VISTAS DEL SISTEMA
   ========================================================================= */

CREATE VIEW vw_AlertaStockMinimo AS
SELECT 
    p.codigo_barras,
    p.nombre AS producto,
    c.nombre_categoria AS categoria,
    p.subcategoria,
    p.marca,
    p.tamano,
    p.stock_actual,
    p.stock_minimo,
    u.nombre_unidad AS unidad,
    p.precio_venta
FROM Producto p
INNER JOIN Categoria c ON p.id_categoria = c.id_categoria
INNER JOIN UnidadMedida u ON p.id_unidad = u.id_unidad
WHERE p.stock_actual <= p.stock_minimo AND p.activo = 1;
GO

CREATE VIEW vw_PadronEmpleados AS
SELECT 
    e.clave_empleado,
    e.nombre AS nombre_empleado,
    e.curp,
    d.depto AS clave_depto,
    d.nombre_dpto,
    d.ubicacion,
    n.nivel AS clave_nivel,
    n.descripcion AS puesto,
    n.saldo_semanal,
    e.nombre_esposa,
    e.telefono_esposa,
    e.telefono_emergencia,
    e.direccion_empleado,
    e.fecha_ingreso
FROM Empleados e
INNER JOIN Niveles n ON e.nivel = n.nivel
INNER JOIN Departamento d ON e.depto = d.depto
WHERE e.activo = 1;
GO

/* =========================================================================
   DISPARADORES (TRIGGERS) OPTIMIZADOS PARA INTERFACES WEB
   ========================================================================= */

-- Trigger 1: Descuenta stock al insertar DetalleVenta y genera alerta si llega al mínimo
CREATE TRIGGER trg_DescontarStockYActualizarVenta
ON DetalleVenta
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Validar que ningún artículo quede con stock negativo antes de aplicar
    IF EXISTS (
        SELECT 1
        FROM Producto p
        INNER JOIN (
            SELECT codigo_barras, SUM(cantidad) AS total_cant
            FROM inserted
            GROUP BY codigo_barras
        ) i ON p.codigo_barras = i.codigo_barras
        WHERE p.stock_actual < i.total_cant
    )
    BEGIN
        RAISERROR('Stock insuficiente en inventario para uno o más productos.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END

    -- 1. Descontar el stock de forma segura (soporta múltiples filas simultáneas)
    UPDATE p
    SET p.stock_actual = p.stock_actual - i.total_cant
    FROM Producto p
    INNER JOIN (
        SELECT codigo_barras, SUM(cantidad) AS total_cant
        FROM inserted
        GROUP BY codigo_barras
    ) i ON p.codigo_barras = i.codigo_barras;

    -- 2. Registrar en bitácora si el producto llegó o bajó de su stock mínimo
    INSERT INTO BitacoraMovimientos (modulo, accion, detalle)
    SELECT DISTINCT
        'INVENTARIO',
        'ALERTA STOCK MÍNIMO',
        'El código ' + p.codigo_barras + ' (' + p.nombre + ') quedó en ' + CAST(p.stock_actual AS VARCHAR(20)) + ' unidades.'
    FROM Producto p
    INNER JOIN inserted i ON p.codigo_barras = i.codigo_barras
    WHERE p.stock_actual <= p.stock_minimo;
END;
GO

-- Trigger 2: Descuenta automáticamente de CorteCaja cuando se paga nómina
CREATE TRIGGER trg_DescontarNominaDeCaja
ON PagosNomina
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE c
    SET c.total_egresos_nomina = c.total_egresos_nomina + i.suma_pagos
    FROM CorteCaja c
    INNER JOIN (
        SELECT id_corte, SUM(total_pagado) AS suma_pagos
        FROM inserted
        GROUP BY id_corte
    ) i ON c.id_corte = i.id_corte;

    INSERT INTO BitacoraMovimientos (modulo, accion, detalle)
    SELECT 
        'NÓMINA / CAJA',
        'PAGO DE RAYA SEMANAL',
        'Pago a empleado #' + CAST(i.clave_empleado AS VARCHAR(10)) + ' por $' + CAST(i.total_pagado AS VARCHAR(20)) + ' (' + ISNULL(i.observaciones, 'Sin obs.') + ')'
    FROM inserted i;
END;
GO

-- Trigger 3: Audita cambios manuales en Producto sin duplicarse cuando es por venta
CREATE TRIGGER trg_AuditarStockProducto
ON Producto
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    -- Si fue disparado por otro trigger (ej. una venta en DetalleVenta), no duplicar bitácora
    IF TRIGGER_NESTLEVEL() > 1 RETURN;

    INSERT INTO BitacoraMovimientos (modulo, accion, detalle)
    SELECT 
        'INVENTARIO',
        CASE WHEN i.stock_actual <= i.stock_minimo THEN 'ALERTA STOCK MÍNIMO' ELSE 'ACTUALIZACIÓN CATÁLOGO' END,
        'Código ' + i.codigo_barras + ' (' + i.nombre + ') -> Stock: ' + CAST(d.stock_actual AS VARCHAR(15)) + ' a ' + CAST(i.stock_actual AS VARCHAR(15)) + ', Precio: $' + CAST(i.precio_venta AS VARCHAR(15))
    FROM inserted i
    INNER JOIN deleted d ON i.codigo_barras = d.codigo_barras
    WHERE i.stock_actual <> d.stock_actual OR i.precio_venta <> d.precio_venta OR i.nombre <> d.nombre;
END;
GO

/* =========================================================================
   PROCEDIMIENTOS ALMACENADOS
   ========================================================================= */

-- 1. Pagar Raya Semanal a un Empleado
CREATE PROCEDURE sp_PagarRayaEmpleado
    @clave_empleado INT,
    @id_corte INT,
    @dias_trabajados INT = 6,
    @adelantos_descuentos DECIMAL(10,2) = 0.00,
    @observaciones VARCHAR(100) = 'Pago de raya semanal completa'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @saldo_semanal DECIMAL(10,2);
        DECLARE @pago_proporcional DECIMAL(10,2);
        DECLARE @total_pagar DECIMAL(10,2);

        SELECT @saldo_semanal = n.saldo_semanal
        FROM Empleados e
        INNER JOIN Niveles n ON e.nivel = n.nivel
        WHERE e.clave_empleado = @clave_empleado AND e.activo = 1;

        IF @saldo_semanal IS NULL
        BEGIN
            RAISERROR('El empleado no existe o está inactivo.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        SET @pago_proporcional = ROUND((@saldo_semanal / 6.0) * @dias_trabajados, 2);
        SET @total_pagar = @pago_proporcional - @adelantos_descuentos;

        IF @total_pagar < 0 SET @total_pagar = 0;

        INSERT INTO PagosNomina (clave_empleado, id_corte, dias_trabajados, sueldo_base_semanal, adelantos_descuentos, total_pagado, observaciones)
        VALUES (@clave_empleado, @id_corte, @dias_trabajados, @saldo_semanal, @adelantos_descuentos, @total_pagar, @observaciones);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @ErrorMsg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMsg, 16, 1);
    END CATCH
END;
GO

-- 2. Procedimiento Transaccional de Venta Unitaria (Con bloqueo pesimista UPDLOCK)
CREATE PROCEDURE sp_ProcesarVentaUnitaria
    @id_usuario INT,
    @id_corte INT,
    @codigo_barras VARCHAR(20),
    @cantidad DECIMAL(10,2),
    @efectivo_recibido DECIMAL(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @stock_disponible DECIMAL(10,2);
        DECLARE @precio DECIMAL(10,2);
        DECLARE @subtotal DECIMAL(10,2);
        DECLARE @cambio DECIMAL(10,2);
        DECLARE @nuevo_id_venta INT;

        SELECT 
            @stock_disponible = stock_actual,
            @precio = precio_venta
        FROM Producto WITH (UPDLOCK, HOLDLOCK)
        WHERE codigo_barras = @codigo_barras AND activo = 1;

        IF @stock_disponible IS NULL
        BEGIN
            RAISERROR('El código del producto no existe.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        IF @stock_disponible < @cantidad
        BEGIN
            RAISERROR('Stock insuficiente en bodega para cubrir la venta.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        SET @subtotal = ROUND(@cantidad * @precio, 2);

        IF @efectivo_recibido < @subtotal
        BEGIN
            RAISERROR('El efectivo recibido es menor al total a cobrar.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        SET @cambio = @efectivo_recibido - @subtotal;

        INSERT INTO Venta (id_usuario, id_corte, total_cobrado, efectivo_pagado, cambio)
        VALUES (@id_usuario, @id_corte, @subtotal, @efectivo_recibido, @cambio);

        SET @nuevo_id_venta = SCOPE_IDENTITY();

        INSERT INTO DetalleVenta (id_venta, codigo_barras, cantidad, precio_unitario, subtotal)
        VALUES (@nuevo_id_venta, @codigo_barras, @cantidad, @precio, @subtotal);

        UPDATE CorteCaja
        SET total_ingresos_ventas = total_ingresos_ventas + @subtotal
        WHERE id_corte = @id_corte;

        INSERT INTO BitacoraMovimientos (modulo, accion, detalle)
        VALUES ('VENTAS (POS)', 'VENTA REGISTRADA', 'Folio #V-' + CAST(@nuevo_id_venta AS VARCHAR(15)) + ' | Prod: ' + @codigo_barras + ' x' + CAST(@cantidad AS VARCHAR(15)) + ' ($' + CAST(@subtotal AS VARCHAR(15)) + ')');

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END;
GO

-- 3. Procedimiento para Actualizar Producto desde Modal Web
CREATE PROCEDURE sp_ActualizarProducto
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

        IF NOT EXISTS (SELECT 1 FROM Producto WHERE codigo_barras = @codigo_barras)
        BEGIN
            RAISERROR('El producto con ese código no existe en la base de datos.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        UPDATE Producto
        SET nombre = @nombre,
            precio_venta = @precio_venta,
            stock_actual = @stock_actual,
            marca = ISNULL(@marca, marca),
            tamano = ISNULL(@tamano, tamano),
            fecha_reabastecimiento = CAST(GETDATE() AS DATE)
        WHERE codigo_barras = @codigo_barras;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@Err, 16, 1);
    END CATCH
END;
GO

/* =========================================================================
   DATOS INICIALES COMPLETOS (Sincronizados con todas las vistas HTML)
   ========================================================================= */

-- Usuarios iniciales (Contraseña de ambos: admin o 1234)
INSERT INTO Usuario (nombre_usuario, nombre_completo, correo, telefono, rol, clave_hash) VALUES
('admin_cabrera', 'Jorge Armando Castañón', 'admin@ferreteriacabrera.com', '+52 846 123 4567', 'Encargado', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'),
('aperales', 'Ana Valeria Perales Hernández', 'valeria.perales@ferreteria.com', '+52 833 456 7890', 'Encargado', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918');

-- Categorías completas
INSERT INTO Categoria (nombre_categoria, descripcion) VALUES
('Construcción', 'Materiales de obra, cemento, bloques, varilla y techos'),
('Herramientas', 'Herramientas manuales, eléctricas y de medición'),
('Electricidad', 'Cableado, apagadores, iluminación y canalización'),
('Plomería y fontanería', 'Tubería PVC, cobre, conexiones y grifería'),
('Pinturas y Acabados', 'Pinturas vinílicas, esmaltes, impermeabilizantes y brochas'),
('Cerrajería y Herrajes', 'Candados, cerraduras, bisagras y pernos'),
('Carpintería', 'Adhesivos, lijas, barnices y tornillería para madera'),
('Jardinería', 'Mangueras, herramientas de corte, palas y fertilizantes'),
('Seguridad industrial', 'Cascos, lentes, guantes, botas y arneses');

-- Unidades de Medida
INSERT INTO UnidadMedida (id_unidad, nombre_unidad) VALUES
('PZA', 'Pieza'),
('KG', 'Kilogramo'),
('MT', 'Metro'),
('LT', 'Litro'),
('M3', 'Metro Cúbico'),
('CAJ', 'Caja');

-- Catálogo completo de Productos (Incluye códigos CON, HER, ELE, PLO, PIN, CER, CAR, JAR, SEG y FER)
INSERT INTO Producto (codigo_barras, nombre, id_categoria, subcategoria, marca, tamano, id_unidad, precio_compra, precio_venta, stock_actual, stock_minimo) VALUES
('CON-001', 'Áridos Fino / Grueso', 1, 'Estructura y Tabiquería', 'Cabrera', 'M3', 'M3', 300.00, 450.00, 150, 15),
('CON-002', 'Bloques de Concreto', 1, 'Estructura y Tabiquería', 'Fortaleza', '15x20x40 cm', 'PZA', 12.00, 18.50, 1200, 100),
('CON-003', 'Viguetas pretensadas', 1, 'Estructura y Tabiquería', 'Tensa', '3.0 m', 'PZA', 220.00, 320.00, 85, 10),
('CON-004', 'Bloques de vidrio', 1, 'Estructura y Tabiquería', 'Lux', '19x19x8 cm', 'PZA', 40.00, 65.00, 240, 20),
('CON-005', 'Estructura de Madera', 1, 'Estructura y Tabiquería', 'PinoPro', 'Pza 2x4"', 'PZA', 95.00, 140.00, 310, 30),
('CON-006', 'Hierros Corrugados', 1, 'Estructura y Tabiquería', 'DeAcero', '3/8" (12m)', 'PZA', 130.00, 185.00, 500, 40),
('CON-007', 'Cementos Gris', 1, 'Estructura y Tabiquería', 'Cruz Azul', '50 kg', 'PZA', 195.00, 260.00, 350, 35),
('TEC-001', 'Lámina Galvanizada', 1, 'Techos', 'Zintro', '3 x 1 m', 'PZA', 310.00, 420.00, 95, 10),
('TEC-002', 'Impermeabilizante Acrílico', 1, 'Techos', 'Fester', '19 L', 'LT', 980.00, 1350.00, 40, 5),
('HER-001', 'Martillo uña curva 16 oz', 2, 'Herramientas Manuales', 'Truper', '16 oz', 'PZA', 110.00, 185.00, 45, 5),
('HER-002', 'Juego de Destornilladores', 2, 'Herramientas Manuales', 'Truper', '6 pzas', 'PZA', 165.00, 240.00, 30, 5),
('HER-003', 'Taladro Rotomartillo 1/2"', 2, 'Herramientas Eléctricas', 'DeWalt', '650W', 'PZA', 1100.00, 1590.00, 12, 3),
('ELE-001', 'Cable THW Calibre 12', 3, 'Cableado', 'IUSA', 'Rollo 100m', 'MT', 1050.00, 1450.00, 25, 5),
('ELE-002', 'Cinta de Aislar Negra', 3, 'Cableado', '3M', '18 m', 'PZA', 20.00, 35.00, 120, 15),
('PLO-001', 'Tubo PVC Hidráulico', 4, 'Tubos PVC y Cobre', 'Plastigama', '3/4" x 3m', 'PZA', 60.00, 95.00, 200, 20),
('PLO-002', 'Llave Mezcladora para Fregadero', 4, 'Grifería y Llaves', 'Urrea', 'Estándar', 'PZA', 390.00, 580.00, 15, 4),
('PLO-003', 'Cinta Teflón 3/4"', 4, 'Conexiones y Codos', 'Truper', 'Rollo 10m', 'PZA', 8.00, 18.00, 4, 10),
('PIN-001', 'Pintura Vinílica Blanca', 5, 'Vinílicas', 'Comex', 'Cubeta 19L', 'LT', 920.00, 1250.00, 20, 4),
('CER-001', 'Candado de Latón', 6, 'Candados', 'Phillips', '50 mm', 'PZA', 130.00, 195.00, 50, 8),
('CAR-001', 'Pegamento Blanco para Madera', 7, 'Adhesivos', 'Resistol', '1 Kg', 'KG', 75.00, 110.00, 80, 10),
('JAR-001', 'Manguera Reforzada con Conexiones', 8, 'Mangueras', 'Truper', '15 m', 'MT', 310.00, 450.00, 25, 5),
('SEG-001', 'Casco de Seguridad Ala Ancha', 9, 'Cascos', '3M', 'Unitalla', 'PZA', 95.00, 150.00, 90, 10);

-- Niveles y Departamentos de Nómina
INSERT INTO Niveles (nivel, descripcion, saldo_semanal) VALUES
('N01', 'Encargado de Mostrador', 2400.00),
('N02', 'Bodeguero y Despachador', 1800.00),
('N03', 'Ayudante General / Patio', 1500.00);

INSERT INTO Departamento (depto, nombre_dpto, ubicacion) VALUES
('D01', 'Mostrador Ventas', 'LOC01'),
('D02', 'Almacén General', 'BOD01'),
('D03', 'Patio y Materiales', 'PAT01');

-- Padrón de Empleados inicial
INSERT INTO Empleados (nombre, nivel, depto, curp, nombre_esposa, telefono_esposa, telefono_emergencia, direccion_empleado, fecha_ingreso) VALUES
('Roberto Hernández Gómez', 'N01', 'D01', 'HEGR880512HVZRRN01', 'Laura Méndez Ruiz', '8461002233', '8461009988', 'Calle Hidalgo #204, Col. Centro, Pánuco', '2023-02-15'),
('Carlos Alberto Pérez Loredo', 'N02', 'D02', 'PELC950823HVZPLR02', 'Sofía Castillo Cruz', '8461123344', '8332154477', 'Av. Carranza #112, Col. Revolución, Pánuco', '2024-06-10'),
('Luis Fernando Torres Díaz', 'N03', 'D03', 'TODL011104HVZTRL05', NULL, NULL, '8461056677', 'C. Benito Juárez S/N, Moralillo', '2025-01-20');

-- Abrir Corte de Caja #1 con $1,500.00 de fondo inicial
INSERT INTO CorteCaja (id_usuario, fondo_inicial) VALUES (1, 1500.00);
GO

-- Simulación inicial de transacciones para poblar historial y bitácora
EXEC sp_ProcesarVentaUnitaria @id_usuario = 1, @id_corte = 1, @codigo_barras = 'HER-001', @cantidad = 2, @efectivo_recibido = 500.00;
EXEC sp_ProcesarVentaUnitaria @id_usuario = 1, @id_corte = 1, @codigo_barras = 'CON-007', @cantidad = 3, @efectivo_recibido = 1000.00;
EXEC sp_PagarRayaEmpleado @clave_empleado = 2, @id_corte = 1, @dias_trabajados = 6, @adelantos_descuentos = 100.00, @observaciones = 'Se descontaron $100 de adelanto del miércoles';
GO