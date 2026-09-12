/* ============================================================================
   Interfaz de la pestaña "Cartolas".

   Usa las funciones globales de index.html (data, save, renderAll, clp, uid,
   escHtml, catsFor, accountBalance) y el pipeline de cartolas.js.
   El flujo siempre es: leer → mostrar vista previa → el usuario aprueba →
   recién ahí se escribe. Nunca se guarda nada sin que él lo vea antes.
   ========================================================================== */

let CART_PENDIENTE = null;
const CART_CAT_MANUAL = {};

/* catOpts() de index.html es local a otra función, no global: se arma aquí. */
function cartCatOpts(sel, type){
  return catsFor(type).map(c =>
    '<option value="' + c + '"' + (c === sel ? " selected" : "") + '>' + c + '</option>').join("");
}

const CART_NOMBRE = {
  falabella_cc: "Falabella · Cuenta Corriente",
  bci_cc: "BCI · Cuenta Corriente",
  bancoestado: "BancoEstado · CuentaRUT",
  cmr: "Falabella · Tarjeta CMR",
  bci_visa_fact: "BCI · Visa (facturados)",
  bci_visa_nofact: "BCI · Visa (no facturados)",
};

function initCartolas(){
  const zona = document.getElementById("cart-drop");
  const input = document.getElementById("cart-files");
  if(!zona || !input || zona.dataset.listo) return;
  zona.dataset.listo = "1";
  zona.onclick = () => input.click();
  input.onchange = e => cartolasProcesar([...e.target.files]);
  ["dragenter","dragover"].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault();
    zona.style.borderColor = "var(--acc)";
  }));
  ["dragleave","drop"].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault();
    zona.style.borderColor = "";
  }));
  zona.addEventListener("drop", e => {
    const fs = [...(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : [])];
    if(fs.length) cartolasProcesar(fs);
  });
}

async function cartolasProcesar(files){
  const est = document.getElementById("cart-estado");
  const cont = document.getElementById("cart-resultado");
  cont.innerHTML = "";
  if(typeof XLSX === "undefined"){
    est.innerHTML = '<span class="neg">No se pudo cargar el lector de Excel. Revisa tu conexión y reintenta.</span>';
    return;
  }
  est.innerHTML = '<span class="muted">Leyendo ' + files.length + ' archivo(s)…</span>';
  let r;
  try {
    r = await CARTOLAS.procesar(files);
  } catch(e){
    est.innerHTML = '<span class="neg">Error leyendo los archivos: ' + escHtml(e.message || String(e)) + '</span>';
    return;
  }
  CART_PENDIENTE = r;
  Object.keys(CART_CAT_MANUAL).forEach(k => delete CART_CAT_MANUAL[k]);
  est.innerHTML = "";
  cartolasRenderPreview(r);
}

/* Los 5 productos que deberían venir en una carga completa. El checklist le dice
   al usuario si bajó todo o le faltó alguno. */
const CART_ESPERADOS = [
  {clave:"falabella_cc", nombre:"Banco Falabella · Cuenta Corriente", archivo:"reportCollection.xls"},
  {clave:"cmr",          nombre:"Tarjeta CMR · Falabella",            archivo:"un nombre largo .xlsx"},
  {clave:"bancoestado",  nombre:"BancoEstado · CuentaRUT",            archivo:"Últimos_Movimientos_CuentaRUT_….xlsx"},
  {clave:"bci_cc",       nombre:"Banco BCI · Cuenta Corriente",       archivo:"movimientos.xlsx"},
  {clave:"bci_visa",     nombre:"Tarjeta BCI Visa",                   archivo:"MovimientosNoFacturadosNacionales_….xls"},
];

function cartolasChecklistHtml(r){
  const vistos = new Set(r.leidos.map(x => x.tipo).filter(Boolean)
    .map(t => t.indexOf("bci_visa") === 0 ? "bci_visa" : t));
  const filas = CART_ESPERADOS.map(p => {
    const ok = vistos.has(p.clave);
    return '<tr><td style="width:34px;font-size:17px">' + (ok ? "✅" : "⬜") + '</td>' +
      '<td><b>' + p.nombre + '</b></td>' +
      '<td class="small ' + (ok ? "muted" : "") + '">' +
      (ok ? "subido ✓" : 'falta — baja <code>' + p.archivo + '</code>') + '</td></tr>';
  }).join("");
  const faltan = CART_ESPERADOS.filter(p => !vistos.has(p.clave)).length;
  const noRec = r.leidos.filter(x => !x.tipo);
  return '<div class="panel"><h2>✔️ Qué bancos actualizaste</h2>' +
    '<table><tbody>' + filas + '</tbody></table>' +
    (faltan
      ? '<div class="tip" style="margin-top:12px">Te faltan <b>' + faltan + '</b> de 5. ' +
        'Puedes guardar igual lo que subiste y completar el resto después — no se duplica nada.</div>'
      : '<div class="small pos" style="margin-top:12px">Subiste los 5 · tus finanzas quedan completas al día ✓</div>') +
    (noRec.length
      ? '<div class="tip">❓ No reconocí: ' + noRec.map(x => escHtml(x.fname)).join(", ") +
        '. Revisa que sea uno de los 5 de la lista de arriba; si es un producto nuevo, avísale a tu asesor.</div>'
      : "") +
    '</div>';
}

function cartolasRenderPreview(r){
  const cont = document.getElementById("cart-resultado");
  const nuevos = r.comp.faltante.slice().sort((a,b) => a.date.localeCompare(b.date));

  const archivos = r.leidos.map(x =>
    '<tr><td>' + escHtml(x.fname) + '</td><td>' +
    (x.tipo ? (CART_NOMBRE[x.tipo] || x.tipo) : '<span class="neg">no reconocido</span>') +
    '</td><td style="text-align:right">' +
    (x.rows.length ? x.rows.length + " filas" : (x.error ? escHtml(x.error) : "—")) +
    '</td></tr>').join("");

  const filas = nuevos.map((c,i) => {
    const tx = CARTOLAS.construir(c);
    const acc = data.accounts.find(a => a.id === tx.account);
    const signo = tx.type === "gasto" ? "−" : (tx.type === "ingreso" ? "+" : "→");
    const cls = tx.type === "gasto" ? "neg" : (tx.type === "ingreso" ? "pos" : "");
    const catCell = tx.type === "transferencia"
      ? '<span class="pill">entre tus cuentas</span>'
      : '<select onchange="cartolasCambiarCat(' + i + ',this.value)">' +
        cartCatOpts(tx.category, tx.type) + '</select>';
    return '<tr><td>' + tx.date + '</td><td>' + escHtml(tx.desc) + '</td><td>' +
      escHtml(acc ? acc.name : "?") + '</td><td>' + catCell +
      '</td><td style="text-align:right" class="' + cls + '">' + signo + clp(tx.amount) + '</td></tr>';
  }).join("");

  const alertas = [];
  if(r.comp.revisar.length){
    const det = r.comp.revisar.map(par =>
      escHtml(par[0].desc) + " " + clp(par[0].amount) + " (" + par[0].date + " y " + par[1].date + ")").join(" · ");
    alertas.push('<div class="tip">⚠️ <b>Vale la pena mirar:</b> ' + r.comp.revisar.length +
      ' par(es) de movimientos casi iguales con 1 día de diferencia. Casi siempre son gastos ' +
      'reales distintos, pero conviene revisarlos: ' + det + '</div>');
  }
  if(r.comp.dudoso.length){
    alertas.push('<div class="tip">🤔 ' + r.comp.dudoso.length + ' movimiento(s) se parecen a otros ya ' +
      'registrados pero con descripción muy distinta. Los dejé fuera para no arriesgar un duplicado.</div>');
  }
  if(r.comp.correccion.length){
    alertas.push('<div class="tip">📅 ' + r.comp.correccion.length + ' movimiento(s) ya estaban registrados ' +
      'con la fecha corrida 1 o 2 días (el banco a veces la cambia entre una descarga y otra). ' +
      'No se agregan de nuevo.</div>');
  }
  if(r.leidos.some(x => !x.tipo)){
    alertas.push('<div class="tip">❓ Hay archivos que no reconocí. Si es una cartola de un producto ' +
      'nuevo, avísale a tu asesor para que la agregue.</div>');
  }

  let html = cartolasChecklistHtml(r) +
    '<div class="panel"><h2>Detalle de los archivos</h2>' +
    '<table><thead><tr><th>Archivo</th><th>Reconocido como</th>' +
    '<th style="text-align:right">Contenido</th></tr></thead><tbody>' + archivos + '</tbody></table>' +
    '<div class="grid cards" style="margin-top:14px">' +
      '<div class="card"><h3>Movimientos nuevos</h3><div class="big pos">' + nuevos.length + '</div></div>' +
      '<div class="card"><h3>Ya estaban</h3><div class="big">' + r.comp.yaRegistrado.length +
        '</div><div class="small muted">no se duplican</div></div>' +
      '<div class="card"><h3>Descartados</h3><div class="big">' + r.excl.length +
        '</div><div class="small muted">pagos de tarjeta, resúmenes de cuotas</div></div>' +
    '</div>' + alertas.join("") + '</div>';

  if(nuevos.length){
    html += '<div class="panel"><h2>Se agregarán estos ' + nuevos.length + ' movimientos</h2>' +
      '<p class="small muted">Puedes corregir la categoría antes de guardar.</p>' +
      '<table><thead><tr><th>Fecha</th><th>Descripción</th><th>Cuenta</th><th>Categoría</th>' +
      '<th style="text-align:right">Monto</th></tr></thead><tbody>' + filas + '</tbody></table>' +
      '<div class="flex" style="margin-top:14px">' +
      '<button class="btn" onclick="cartolasAplicar()">✓ Agregar ' + nuevos.length + ' movimientos</button>' +
      '<button class="btn ghost" onclick="cartolasCancelar()">Cancelar</button>' +
      '<span id="cart-aplicar-result" class="small"></span></div></div>';
  } else {
    html += '<div class="panel"><div class="empty">Todo lo que traen estos archivos ya estaba ' +
      'registrado. No hay nada nuevo que agregar. 👌</div>' +
      '<div class="flex" style="margin-top:12px">' +
      '<button class="btn ghost" onclick="cartolasCancelar()">Cerrar</button></div></div>';
  }
  html += cartolasSaldosHtml(r);
  cont.innerHTML = html;
}

function cartolasCambiarCat(i, v){ CART_CAT_MANUAL[i] = v; }

function cartolasCancelar(){
  CART_PENDIENTE = null;
  Object.keys(CART_CAT_MANUAL).forEach(k => delete CART_CAT_MANUAL[k]);
  document.getElementById("cart-resultado").innerHTML = "";
  const inp = document.getElementById("cart-files");
  if(inp) inp.value = "";
}

function cartolasAplicar(){
  if(!CART_PENDIENTE) return;
  const guardado = CART_PENDIENTE;
  const nuevos = guardado.comp.faltante.slice().sort((a,b) => a.date.localeCompare(b.date));
  let n = 0, sinCuenta = 0;
  nuevos.forEach((c,i) => {
    const tx = CARTOLAS.construir(c);
    if(!tx.account){ sinCuenta++; return; }          // cuenta desconocida: no inventar
    if(CART_CAT_MANUAL[i] && tx.type !== "transferencia") tx.category = CART_CAT_MANUAL[i];
    tx.id = uid();
    data.transactions.push(tx);
    n++;
  });
  if(n){ save(); renderAll(); }
  CART_PENDIENTE = null;
  Object.keys(CART_CAT_MANUAL).forEach(k => delete CART_CAT_MANUAL[k]);
  const aviso = sinCuenta
    ? '<div class="tip">⚠️ ' + sinCuenta + ' movimiento(s) no se agregaron porque su cuenta no existe en la app.</div>'
    : "";
  document.getElementById("cart-resultado").innerHTML =
    '<div class="panel"><div class="empty">✓ Listo: ' + n + ' movimiento(s) agregados y sincronizados.</div>' +
    aviso + '</div>' + cartolasChecklistHtml(guardado) + cartolasSaldosHtml(guardado);
  const inp = document.getElementById("cart-files");
  if(inp) inp.value = "";
}

/* ---- cuadrar la app contra el saldo/cupo que reporta el propio banco ---- */

/* Compras cargadas en una tarjeta después de la fecha en que se fijó su cupo.
   Sirve para estimar el cupo usado de la CMR, cuyo archivo NO trae ese dato. */
function cartComprasDesde(accId, desde){
  if(!desde) return null;
  return data.transactions
    .filter(t => t.account === accId && t.type === "gasto" && t.date > desde)
    .reduce((s,t) => s + t.amount, 0);
}

function cartolasTarjetasHtml(r){
  // qué tarjeta viene con el cupo dentro del archivo (hoy solo la BCI Visa)
  const desdeArchivo = {};
  if(r.metas.bci_visa_nofact && r.metas.bci_visa_nofact.utilizado !== undefined)
    desdeArchivo["Tarjeta BCI Visa"] = r.metas.bci_visa_nofact;

  const bloques = data.accounts.filter(a => a.card).map(a => {
    const info = desdeArchivo[a.name];
    const usado = a.utilizado || 0;
    const cab = '<tr><td><b>' + escHtml(a.name) + '</b><div class="small muted">cupo total ' +
                clp(a.cupo || 0) + '</div></td>';
    // la fecha del dato actual da contexto: si el archivo que subió es más viejo,
    // actualizar haría RETROCEDER el cupo. Mostrarla siempre para que lo note.
    const desde = a.cupoAt ? '<div class="small muted">al ' + a.cupoAt + '</div>' : "";

    // 1) el banco lo informa en el archivo: comparar y ofrecer actualizar
    if(info){
      if(usado === info.utilizado)
        return cab + '<td style="text-align:right">' + clp(usado) + desde + '</td>' +
          '<td style="text-align:right" class="pos">al día ✓</td><td></td></tr>';
      return cab + '<td style="text-align:right">' + clp(usado) + desde + '</td>' +
        '<td style="text-align:right"><b>' + clp(info.utilizado) + '</b>' +
        '<div class="small muted">según tu banco</div></td>' +
        '<td style="text-align:right"><button class="btn" onclick="cartolasCupo(\'' + a.id +
        '\',' + info.utilizado + ',' + (info.cupo || 0) + ')">Actualizar</button></td></tr>';
    }

    // 2) el archivo no lo trae (CMR): estimar y pedir el valor real
    const nuevas = cartComprasDesde(a.id, a.cupoAt);
    const est = nuevas === null ? null : usado + nuevas;
    const estTxt = est === null
      ? '<div class="small muted">no se puede estimar</div>'
      : (nuevas > 0
          ? '<b>' + clp(est) + '</b><div class="small muted">+' + clp(nuevas) +
            ' en compras desde el ' + a.cupoAt + '</div>'
          : '<span class="muted">sin compras nuevas desde el ' + a.cupoAt + '</span>');
    return cab + '<td style="text-align:right">' + clp(usado) + desde + '</td>' +
      '<td style="text-align:right">' + estTxt + '</td>' +
      '<td style="text-align:right">' +
        (est !== null && nuevas > 0
          ? '<button class="btn ghost" onclick="cartolasCupo(\'' + a.id + '\',' + est + ',0)">Usar estimado</button> '
          : "") +
        '<input type="number" id="cart-cupo-' + a.id + '" placeholder="valor real" style="max-width:130px">' +
        '<button class="btn" onclick="cartolasCupoManual(\'' + a.id + '\')">Guardar</button>' +
      '</td></tr>';
  }).join("");

  if(!bloques) return "";
  return '<div class="panel"><h2>💳 Cupo de tus tarjetas</h2>' +
    '<p class="small muted">El archivo de la <b>BCI Visa</b> trae el cupo usado, así que se actualiza solo. ' +
    'El de la <b>Tarjeta CMR</b> no lo trae: la app te muestra cuánto estima sumando tus compras, ' +
    'pero para dejarlo exacto copia el "cupo utilizado" que aparece en tu banca en línea.</p>' +
    '<table><thead><tr><th>Tarjeta</th><th style="text-align:right">En la app</th>' +
    '<th style="text-align:right">Debería ser</th><th></th></tr></thead>' +
    '<tbody>' + bloques + '</tbody></table></div>';
}

function cartolasSaldosHtml(r){
  const filas = [];
  [["falabella_cc","Banco Falabella"], ["bci_cc","Banco BCI"], ["bancoestado","BancoEstado"]]
    .forEach(par => {
      const m = r.metas[par[0]];
      if(!m || m.saldo === undefined) return;
      const acc = data.accounts.find(a => a.name === par[1]);
      if(!acc) return;
      const calc = accountBalance(acc.id), real = m.saldo, dif = real - calc;
      filas.push('<tr><td><b>' + escHtml(par[1]) + '</b></td>' +
        '<td style="text-align:right">' + clp(calc) + '</td>' +
        '<td style="text-align:right">' + clp(real) + '</td>' +
        '<td style="text-align:right" class="' + (dif === 0 ? "pos" : "neg") + '">' +
          (dif === 0 ? "cuadra ✓" : clp(dif)) + '</td>' +
        '<td style="text-align:right">' + (dif === 0 ? "" :
          '<button class="btn ghost" onclick="cartolasCuadrar(\'' + acc.id + '\',' + real + ')">Cuadrar</button>') +
        '</td></tr>');
    });

  const cuentas = filas.length
    ? '<div class="panel"><h2>🔍 Cuadratura con el banco</h2>' +
      '<p class="small muted">Compara el saldo que calcula la app con el que viene en la cartola. ' +
      'Si no cuadra, casi siempre es por los pagos de tarjeta: salen de la cuenta pero no se registran ' +
      'como gasto, para no contar esa deuda dos veces.</p>' +
      '<table><thead><tr><th>Cuenta</th><th style="text-align:right">En la app</th>' +
      '<th style="text-align:right">En el banco</th><th style="text-align:right">Diferencia</th><th></th>' +
      '</tr></thead><tbody>' + filas.join("") + '</tbody></table></div>'
    : "";

  return cuentas + cartolasTarjetasHtml(r);
}

function cartolasCupoManual(accId){
  const inp = document.getElementById("cart-cupo-" + accId);
  const v = Number(inp && inp.value);
  if(!v || v < 0){ alert("Escribe el cupo utilizado que muestra tu banco."); return; }
  cartolasCupo(accId, Math.round(v), 0);
}

function cartolasCuadrar(accId, real){
  const acc = data.accounts.find(a => a.id === accId);
  if(!acc) return;
  const dif = real - accountBalance(accId);
  acc.initial = (acc.initial || 0) + dif;    // el saldo inicial absorbe la diferencia
  save(); renderAll();
  if(CART_PENDIENTE) cartolasRenderPreview(CART_PENDIENTE);
  else {
    const cont = document.getElementById("cart-resultado");
    if(cont) cont.innerHTML = '<div class="panel"><div class="empty">✓ ' + escHtml(acc.name) +
      ' quedó cuadrada en ' + clp(real) + '.</div></div>';
  }
}

function cartolasCupo(accId, utilizado, cupo){
  const acc = data.accounts.find(a => a.id === accId);
  if(!acc) return;
  acc.utilizado = utilizado;
  if(cupo) acc.cupo = cupo;
  // desde qué fecha vale este número: sin esto no se puede estimar después
  acc.cupoAt = todayStr();
  save(); renderAll();
  if(CART_PENDIENTE) cartolasRenderPreview(CART_PENDIENTE);
}
