const API_URL = 'http://localhost:3000/api';

// =========================================================================
// 1. MÓDULO DE VENTAS (ventas.html)
// =========================================================================
async function inicializarModuloVentas() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    try {
        const res = await fetch(`${API_URL}/productos`);
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
            window.productos = data.map((p, idx) => ({
                id: idx + 1,
                codigo: p.codigo,
                nombre: p.nombre,
                precio: parseFloat(p.precio),
                stock: parseFloat(p.stock),
                stock_minimo: parseFloat(p.stock_minimo || 5),
                cat: p.categoria,
                marca: p.marca,
                tamano: p.tamano
            }));
            if (typeof window.renderProductos === 'function') window.renderProductos();
        }
    } catch (e) {
        console.warn('Catálogo local activo:', e.message);
    }
}

// =========================================================================
// 2. MÓDULO DE NÓMINA Y CORTE DE CAJA (nomina.html)
// =========================================================================
let padronGlobal = [];

async function inicializarModuloNomina() {
    const tablaEmp = document.getElementById('tabla-empleados');
    if (!tablaEmp) return;

    try {
        const resCaja = await fetch(`${API_URL}/caja/actual`);
        const caja = await resCaja.json();
        if (caja && caja.id_corte) {
            document.getElementById('caja-fondo').innerText = `$${parseFloat(caja.fondo_inicial).toFixed(2)}`;
            document.getElementById('caja-ingresos').innerText = `$${parseFloat(caja.total_ingresos_ventas).toFixed(2)}`;
            document.getElementById('caja-egresos').innerText = `$${parseFloat(caja.total_egresos_nomina).toFixed(2)}`;
            document.getElementById('caja-saldo').innerText = `$${parseFloat(caja.saldo_final_esperado).toFixed(2)}`;
        }

        const resNom = await fetch(`${API_URL}/nomina/padron`);
        const data = await resNom.json();
        padronGlobal = data.empleados || [];

        tablaEmp.innerHTML = '';
        const selectEmp = document.getElementById('select-empleado');
        selectEmp.innerHTML = '';

        padronGlobal.forEach(e => {
            tablaEmp.innerHTML += `
                <tr>
                    <td><strong>#${e.clave_empleado}</strong></td>
                    <td><strong>${e.nombre_empleado}</strong><br><span style="font-size:11px;color:#718096;">${e.curp}</span></td>
                    <td>${e.nombre_dpto} <span class="badge">${e.ubicacion}</span></td>
                    <td>${e.clave_nivel} - ${e.puesto}</td>
                    <td><strong style="color:#F25C05;">$${parseFloat(e.saldo_semanal).toFixed(2)}</strong></td>
                    <td>${e.nombre_esposa || 'Soltero'}<br><span style="font-size:11px;color:#718096;">Emerg: ${e.telefono_emergencia}</span></td>
                </tr>
            `;
            selectEmp.innerHTML += `<option value="${e.clave_empleado}">${e.nombre_empleado} (${e.puesto} - $${parseFloat(e.saldo_semanal).toFixed(2)})</option>`;
        });

        const tablaPagos = document.getElementById('tabla-pagos');
        tablaPagos.innerHTML = '';
        (data.historialPagos || []).forEach(p => {
            const fecha = new Date(p.fecha_pago).toLocaleDateString('es-MX');
            tablaPagos.innerHTML += `
                <tr>
                    <td><strong>#P-${p.id_pago}</strong><br><span style="font-size:11px;color:#718096;">${fecha}</span></td>
                    <td><strong>${p.nombre}</strong></td>
                    <td>${p.dias_trabajados} días</td>
                    <td style="color:#E53E3E;">-$${parseFloat(p.adelantos_descuentos).toFixed(2)}</td>
                    <td><strong style="color:#10B981;">$${parseFloat(p.total_pagado).toFixed(2)}</strong></td>
                    <td>${p.observaciones || ''}</td>
                </tr>
            `;
        });

        window.recalcularRaya();
    } catch (err) {
        console.warn('Error cargando datos de nómina:', err.message);
    }
}

window.recalcularRaya = function () {
    const select = document.getElementById('select-empleado');
    if (!select || !padronGlobal.length) return;
    const emp = padronGlobal.find(e => e.clave_empleado == select.value);
    if (!emp) return;

    const dias = parseFloat(document.getElementById('input-dias').value) || 0;
    const desc = parseFloat(document.getElementById('input-descuento').value) || 0;
    const base = parseFloat(emp.saldo_semanal);
    const prop = (base / 6.0) * dias;
    const neto = Math.max(0, prop - desc);

    document.getElementById('prev-base').innerText = `$${base.toFixed(2)}`;
    document.getElementById('prev-prop').innerText = `$${prop.toFixed(2)}`;
    document.getElementById('prev-neto').innerText = `$${neto.toFixed(2)}`;
};

window.procesarPagoRaya = async function (e) {
    e.preventDefault();
    const payload = {
        clave_empleado: document.getElementById('select-empleado').value,
        id_corte: 1,
        dias_trabajados: document.getElementById('input-dias').value,
        adelantos_descuentos: document.getElementById('input-descuento').value || 0,
        observaciones: document.getElementById('input-obs').value || 'Pago de raya semanal completa'
    };

    try {
        const res = await fetch(`${API_URL}/nomina/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        alert(data.mensaje);
        if (data.ok) {
            document.getElementById('input-descuento').value = '0';
            document.getElementById('input-obs').value = '';
            await inicializarModuloNomina();
        }
    } catch (err) {
        alert('Error de conexión al procesar nómina: ' + err.message);
    }
};

window.abrirModalEmpleado = () => document.getElementById('modal-empleado').classList.add('active');
window.cerrarModalEmpleado = () => document.getElementById('modal-empleado').classList.remove('active');

window.guardarNuevoEmpleado = async function (e) {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('emp-nombre').value,
        nivel: document.getElementById('emp-nivel').value,
        depto: document.getElementById('emp-depto').value,
        curp: document.getElementById('emp-curp').value,
        nombre_esposa: document.getElementById('emp-esposa').value,
        telefono_esposa: document.getElementById('emp-tel-esposa').value,
        telefono_emergencia: document.getElementById('emp-tel-emergencia').value,
        direccion_empleado: document.getElementById('emp-direccion').value
    };

    try {
        const res = await fetch(`${API_URL}/nomina/empleados`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        alert(data.mensaje);
        if (data.ok) {
            e.target.reset();
            window.cerrarModalEmpleado();
            await inicializarModuloNomina();
        }
    } catch (err) {
        alert('Error al guardar empleado: ' + err.message);
    }
};

// =========================================================================
// 3. BITÁCORA Y PERFIL (perfil de usuario.html)
// =========================================================================
async function inicializarBitacoraPerfil() {
    const tbody = document.querySelector('#actividad .activity-table tbody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_URL}/bitacora`);
        const logs = await res.json();
        if (Array.isArray(logs) && logs.length > 0) {
            tbody.innerHTML = '';
            logs.forEach(log => {
                const fecha = new Date(log.fecha_hora).toLocaleString('es-MX');
                let badgeClass = 'tag-update';
                if (log.modulo.includes('CAJA') || log.modulo.includes('VENTA')) badgeClass = 'tag-sale';
                if (log.modulo.includes('SEGURIDAD')) badgeClass = 'tag-security';

                tbody.innerHTML += `
                    <tr>
                        <td>${fecha}</td>
                        <td><strong>${log.accion}:</strong> ${log.detalle || ''}</td>
                        <td>${log.modulo}</td>
                        <td><span class="tag-action ${badgeClass}">${log.modulo}</span></td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        console.warn('Bitácora local activa.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarModuloVentas();
    inicializarModuloNomina();
    inicializarBitacoraPerfil();
});