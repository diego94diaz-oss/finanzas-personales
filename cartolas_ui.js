/* ============================================================================
   Interfaz de la pestaña "Cartolas".

   Usa las funciones globales de index.html (data, save, renderAll, clp, uid,
   escHtml, catOpts, accountBalance) y el pipeline de cartolas.js.
   El flujo siempre es: leer → mostrar vista previa → el usuario aprueba →
   recién ahí se escribe. Nunca se guarda nada sin que él lo vea antes.
   ========================================================================== */

let CART_PENDIENTE = null;
const CART_CAT_MANUAL = {};

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
        catOpts(tx.category, tx.type) + '</select>';
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

  let html = '<div class="panel"><h2>Archivos leídos</h2>' +
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
    aviso + '</div>' + cartolasSaldosHtml(guardado);
  const inp = document.getElementById("cart-files");
  if(inp) inp.value = "";
}

/* ---- cuadrar la app contra el saldo/cupo que reporta el propio banco ---- */
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

  let tarjeta = "";
  const visa = r.metas.bci_visa_nofact;
  if(visa && visa.utilizado !== undefined){
    const acc = data.accounts.find(a => a.name === "Tarjeta BCI Visa");
    if(acc && acc.utilizado !== visa.utilizado){
      tarjeta = '<div class="tip" style="margin-top:12px">💳 Tu Visa marca <b>' + clp(visa.utilizado) +
        '</b> de cupo usado y en la app tienes ' + clp(acc.utilizado || 0) + '. ' +
        '<button class="btn ghost" onclick="cartolasCupo(\'' + acc.id + '\',' + visa.utilizado +
        ',' + (visa.cupo || 0) + ')">Actualizar</button></div>';
    } else if(acc){
      tarjeta = '<div class="small muted" style="margin-top:12px">💳 Cupo usado de tu Visa: ' +
        clp(visa.utilizado) + ' — coincide con la app ✓</div>';
    }
  }

  if(!filas.length && !tarjeta) return "";
  return '<div class="panel"><h2>🔍 Cuadratura con el banco</h2>' +
    '<p class="small muted">Compara el saldo que calcula la app con el que viene en la cartola. ' +
    'Si no cuadra, casi siempre es por los pagos de tarjeta: salen de la cuenta pero no se registran ' +
    'como gasto, para no contar esa deuda dos veces.</p>' +
    (filas.length ? '<table><thead><tr><th>Cuenta</th><th style="text-align:right">En la app</th>' +
      '<th style="text-align:right">En el banco</th><th style="text-align:right">Diferencia</th><th></th>' +
      '</tr></thead><tbody>' + filas.join("") + '</tbody></table>' : "") +
    tarjeta + '</div>';
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
  save(); renderAll();
  if(CART_PENDIENTE) cartolasRenderPreview(CART_PENDIENTE);
}
