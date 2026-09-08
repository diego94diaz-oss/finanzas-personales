/* ============================================================================
   Importador de cartolas — pipeline completo en el navegador.

   Porta a JS lo que antes corría en Python (`Cuentas y Tarjetas de credito/
   _pipeline/`): identificar cada archivo por su CONTENIDO, extraer, excluir lo
   que no corresponde, deduplicar, comparar contra lo ya registrado, categorizar
   y recién ahí escribir — siempre con una vista previa que el usuario aprueba.

   Reglas aprendidas a la mala que NO hay que romper (ver _LEEME.md):
   - Identificar por contenido, nunca por nombre de archivo.
   - "Pago de créditos"/"Pago Credito" NO es pago de tarjeta: es la cuota real
     del crédito de consumo BCI.
   - "Impuesto Línea de Sobregiro" y "Comisión Única por Plan" son gasto real,
     no movimiento interno.
   - Repetición dentro de un MISMO archivo = operaciones reales distintas.
     Solo entre archivos distintos, con 1 día de diferencia, es la misma.
   - El resumen de cuotas (UDEC) se repite en cada cartola: no es cargo nuevo.
   ========================================================================== */

const CARTOLAS = (() => {

/* ---------------------------------------------------------- categorización
   Espejo de `_pipeline/categorizar.py`. Mantener ambos sincronizados. */
const CATEG = [
 ["Inversiones", ["z app","vector cl","fondo mutuo","fondos mutuos","fintual","racional"]],
 ["Cuidado personal", ["carlina alejandra perez","peluqueria","peluquería","barberia","barbería","corte de pelo"]],
 ["Vivienda", ["berta matamal","arriendo","dividendo","gasto comun","gastos comunes","gasto común"]],
 ["Deudas y cuotas", ["scotiabank cae","fondo credito udec","pago de créditos","pago de creditos",
    "amortización","amortizacion","pago automatico linea","pago automático linea"]],
 ["Salud", ["farmacia","farma salud","salcobrand","recetario","clinica","clínica","innovafarma",
    "practicatest","optica","óptica","mewlen","jarpa garcia","farmaceutica","farmacéutica","peumayen"]],
 ["Transporte", ["copec","parquime","aramco","redbanc","giro cajero","peaje","taller chery",
    "chery paicav","marsh risk","bci seguros"]],
 ["Servicios básicos", ["municipalidad","servipag","comision","comisión","impuesto","servicio administracion",
    "servicio administración","cobro adm","intereses rotativos","sii","enel","essbio","aguas","movistar","entel"]],
 ["Suscripciones", ["claude.ai","anthropic","crunchyroll","spotify","netflix","openrouter","canva","obsidian",
    "prime video","flow *licencias","flow *c","google one","google ai","youtube","google play",
    "openai","chatgpt","elevenlabs"]],
 ["Entretenimiento", ["dlocal","airbnb","chiletur","cuevas volcanic","volcanica","las cumbres","natalia marti",
    "kushki","pago online","segfala","timbres","of cl usd","trawen","circo","loteria","viajes falabella",
    "steam"]],
 ["Compras", ["sodimac","ferreteria","ferretería","bazar","saxoline","paris","retail","ropa","joyas",
    "underarmour","aliexpress","pandora","mercadolibre","mercadol","sba lebu","ad 784","20456 lebu",
    "cv 1169","haulmer","falabella.com","tuu*","servitec","creaciones","planeta","artesanias","artesanías",
    "angelo cuevas","catherine cecilia pena varela"]],
 ["Alimentación", ["sofia del pilar lobos","maria alicia del carmen gajar","patricio orlando reyes",
    "patricio reye","jaime javier baeza","para jaime","acevedo gonza","fina estampa","comercial san pedro",
    "san pedro spa","javier herrer","angelina del rosario herrera","cattedrales","rigo floridor orellana",
    "ana soledad saez huenul","constanza lisbeth bernal","evelyn andrea garrido","sabor del bueno","unimarc",
    "tottus","supermercado","murallas china","frutimarket","patagonia aliment","sergio manuel latorr","pizza",
    "restaurant","restorant","hangaroa","monaco cafe","sumup","bajon homero","donde la tere","salon de te",
    "kebba","nahuel","pehuen","sushi","marisush","mariush","cafe","café","nana","punto criollo","viento verde",
    "jardin marino","kaze","grupo dominga","iltorino","caviahue","koru","pizzaala","gastrono","fundosan",
    "martita","el alcance","lemon tree","club social","grivento","cafelafk","happy","restaura","yoshi",
    "cerveza","chiflon","c. verde","c verde","pronto","valdivia centro","entrelagos","mariquin","lago lanalhu",
    "clinicaleufu","cafenativo","edgardojonathan","elvis jose go"]],
];
// El keyword genérico "tuu*" cae en Compras y gana por orden: estos comercios de
// comida se chequean ANTES. Al aparecer uno nuevo con prefijo TUU*, sumarlo aquí.
const TUU_COMIDA = ["bazar y provision","bazaryprovision","benz hau","hangaroa","edgardojonathan"];
const GP_SUBS = {1000:["Canal YouTube Brattia","Suscripciones"],1790:["Google AI Pro (5TB)","Suscripciones"],
                 400:["Google One","Suscripciones"],5500:["YouTube Premium","Suscripciones"]};
const OVERRIDES = [["oneclick recurrente",12990,"Línea Entel","Servicios básicos"]];
const DESC_OVERRIDES = [["marsh risk","Seguro de auto Marsh"],
                        ["anthropic","Suscripción Claude (Anthropic)"],
                        ["claude.ai","Suscripción Claude (Anthropic)"]];

function clasif(desc, amount){
  const d = (desc||"").toLowerCase();
  if(d.includes("copec")) return (amount||0) >= 20000 ? "Transporte" : "Alimentación";
  if(TUU_COMIDA.some(k => d.includes(k))) return "Alimentación";
  for(const [cat, kws] of CATEG) for(const k of kws) if(d.includes(k)) return cat;
  return "Otros";
}
function descBonita(desc, amount){
  const d = (desc||"").toLowerCase();
  if(d.includes("google play") && GP_SUBS[amount]) return GP_SUBS[amount];
  for(const [kw, amt, nice, cat] of OVERRIDES) if(d.includes(kw) && amount === amt) return [nice, cat];
  let out = desc;
  for(const [kw, nice] of DESC_OVERRIDES) if(d.includes(kw)) out = nice;
  return [out, null];
}

/* ------------------------------------------------------------------ reglas */
function esPagoTarjeta(desc){
  const d = (desc||"").toLowerCase();
  // OJO: "pago de creditos"/"pago credito" NO va aquí (es la cuota del crédito BCI)
  return ["pago tarjeta cmr","pac cmr","transf para pago tarjeta","pago deuda tarjeta",
          "pago tarjeta de cr","monto cancelado","pago tarjeta visa",
          "pago tarjeta de credito visa"].some(p => d.includes(p));
}
function esTransfInterna(desc){
  const d = (desc||"").toLowerCase();
  return d.includes("diego") || d.includes("diaz matama");
}
const BCI_SOBREGIRO_INTERNO = new Set([
  "TRANSFER DE D.DIAZ MATAMA","TRANSFER A D.DIAZ MATAMAL","AMORTIZACION LINEA DE SOBREGIRO",
  "TRASPASO DESDE LINEA SOBREGIRO A CTA CTE","PAGO AUTO SOBREGIRO 20302460",
  "ABONO POR TRF DESDE OTRO BANCO EN LINEA","TRASPASO FONDOS OTRO BANCO EN LINEA",
  "Transferencia desde Linea Sobregiro a Cta. Corrien",
  "Transferencia desde Línea Sobregiro a Cta. Corrien","Amortizacion Linea De Sobregiro",
  "Transferencia recibida de DIEGO ALEXIS DIAZ MATAMALA","Transferencia enviada a Diego Díaz",
]);

/* --------------------------------------------------------------- utilidades */
function num(v){
  if(typeof v === "number") return Math.round(v);
  const s = String(v==null?"":v).trim().replace(/\./g,"").replace(/\$/g,"").replace(/\s/g,"").replace(/,/g,"");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}
function serialToISO(n){
  const base = Date.UTC(1899,11,30);
  const d = new Date(base + Math.round(Number(n))*86400000);
  return d.toISOString().slice(0,10);
}
function fecha(v, sep){
  // "07-09-2026" / "07/09/2026" -> 2026-09-07 ; o serial de Excel
  if(typeof v === "number" && v > 20000) return serialToISO(v);
  const s = String(v==null?"":v).trim();
  if(/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) return serialToISO(s);
  const p = s.split(sep);
  if(p.length !== 3) return null;
  const [dd,mm,yy] = p;
  if(yy.length !== 4) return null;
  return yy + "-" + String(mm).padStart(2,"0") + "-" + String(dd).padStart(2,"0");
}
function dias(a,b){ return Math.abs((new Date(a) - new Date(b)) / 86400000); }
function normDesc(s){
  let x = (s||"").toLowerCase().trim();
  for(const j of ["compra ","transf. para ","transf para ","transf. de ","tef a ","tef de ",
                  "transferencia de ","transferencia a ","transferencia recibida de ",
                  "transferencia enviada a "]) if(x.startsWith(j)) { x = x.slice(j.length); break; }
  return x.split(/\s+/).join(" ");
}
function simil(a,b){
  a = normDesc(a); b = normDesc(b);
  if(!a || !b) return 0;
  if(a === b) return 1;
  const corta = a.length < b.length ? a : b, larga = a.length < b.length ? b : a;
  if(larga.includes(corta)) return corta.length / larga.length;
  let comunes = 0;
  const usados = new Array(larga.length).fill(false);
  for(const ch of corta){
    const i = larga.split("").findIndex((c,k) => !usados[k] && c === ch);
    if(i >= 0){ usados[i] = true; comunes++; }
  }
  return (2*comunes) / (a.length + b.length);
}

/* ------------------------------------------- identificación por CONTENIDO */
function identificar(rows){
  const plano = rows.slice(0,18).map(r => (r||[]).slice(0,8).join(" ")).join(" | ").toLowerCase();
  if(plano.includes("cuentarut")) return "bancoestado";
  if(plano.includes("fecha transacci") && plano.includes("fecha contable")) return "bci_cc";
  if(plano.includes("tarjeta de cr") && plano.includes("8116"))
    return plano.includes("no facturados") ? "bci_visa_nofact" : "bci_visa_fact";
  const h = (rows[0]||[]).map(c => String(c==null?"":c).trim().toLowerCase());
  if(h[0] === "fecha" && (h[1]||"").includes("descripcion") && (h[2]||"").includes("titular")) return "cmr";
  if(h[0] === "fecha" && h.includes("saldo")) return "falabella_cc";
  return null;
}

/* ------------------------------------------------------------------ parsers
   Cada uno devuelve {movs, excl, meta}. `meta` trae los saldos/cupos que el
   propio archivo reporta, para poder cuadrar la app con el banco después. */
function parseFalabellaCC(rows, fname){
  const movs = [], excl = [], meta = {};
  rows.slice(1).forEach((r,i) => {
    if(!r || !String(r[0]||"").trim()) return;
    const date = fecha(r[0], "-"); if(!date) return;
    const desc = String(r[1]||"").trim();
    const cargo = String(r[2]||"").trim() ? num(r[2]) : 0;
    const abono = String(r[3]||"").trim() ? num(r[3]) : 0;
    if(meta.saldo === undefined && String(r[4]||"").trim()) meta.saldo = num(r[4]); // 1ra fila = más reciente
    const base = {producto:"Falabella Cuenta Corriente", cuenta:"Banco Falabella", date,
                  desc, origen:fname, fila:i+1};
    if(cargo){
      if(esPagoTarjeta(desc)) excl.push({...base, motivo:"pago_tarjeta_credito", amount:cargo});
      else movs.push({...base, direction:"cargo", amount:cargo});
    }
    if(abono) movs.push({...base, direction:"abono", amount:abono});
  });
  return {movs, excl, meta};
}

function parseBciVisa(rows, fname){
  const movs = [], excl = [], meta = {};
  rows.forEach((r,i) => {
    if(!r) return;
    const c0 = String(r[0]||"").trim();
    if(c0.toLowerCase().startsWith("cupo utilizado")) meta.utilizado = num(r[1]);
    if(c0.toLowerCase().startsWith("cupo nacional")) meta.cupo = num(r[1]);
    if((c0.match(/-/g)||[]).length !== 2) return;
    const date = fecha(c0, "-"); if(!date) return;
    const desc = String(r[3]||"").trim();
    const monto = num(r[5]);
    if(!monto) return;
    const base = {producto:"Tarjeta BCI Visa", cuenta:"Tarjeta BCI Visa", date, desc,
                  origen:fname, fila:i};
    if(monto < 0){ excl.push({...base, motivo:"pago_o_devolucion(monto_negativo)", amount:-monto}); return; }
    if(desc.toLowerCase().includes("fondo credito udec")){
      excl.push({...base, motivo:"resumen_cuotas_no_es_cargo_nuevo", amount:monto}); return; }
    movs.push({...base, direction:"cargo", amount:monto});
  });
  return {movs, excl, meta};
}

function parseCmr(archivos){
  // archivos: [{fname, rows}] ordenados del ciclo más antiguo al más nuevo
  const movs = [], excl = [], vistos = new Map();
  const cuotasCount = new Map();
  const parsed = archivos.map(({fname, rows}) => {
    const recs = [];
    rows.slice(1).forEach((r,i) => {
      if(!r || !String(r[0]||"").trim()) return;
      const date = fecha(r[0], "-"); if(!date) return;
      recs.push({fila:i+1, date, desc:String(r[1]||"").trim(), monto:num(r[3])});
    });
    recs.forEach(r => { if(r.desc.toLowerCase().includes("cuotas")){
      const k = r.date + "|" + Math.abs(r.monto);
      cuotasCount.set(k, (cuotasCount.get(k)||0) + 1); } });
    return {fname, recs};
  });

  parsed.forEach(({fname, recs}) => recs.forEach(r => {
    const {date, desc, monto, fila} = r;
    const base = {producto:"Tarjeta CMR Falabella", cuenta:"Tarjeta CMR", date, desc,
                  origen:fname, fila, amount:Math.abs(monto)};
    if(monto <= 0){ excl.push({...base, motivo:"monto_no_positivo"}); return; }
    if(esPagoTarjeta(desc)){ excl.push({...base, motivo:"pago_tarjeta_credito"}); return; }
    // el resumen del crédito UDEC se repite idéntico en cada cartola: no es cargo nuevo
    if(desc.toLowerCase().includes("fondo credito udec") && date < "2026-01-01"){
      excl.push({...base, motivo:"resumen_cuotas_ya_conocido(udec)"}); return; }
    if(desc.toLowerCase().includes("cuotas") && (cuotasCount.get(date+"|"+Math.abs(monto))||0) >= 2
       && date < "2026-01-01"){
      excl.push({...base, motivo:"resumen_cuotas_repetido_en_varios_archivos"}); return; }
    const k = date + "|" + Math.abs(monto) + "|" + normDesc(desc);
    if(vistos.has(k)){ excl.push({...base, motivo:"traslape_entre_archivos(ya_en_"+vistos.get(k)+")"}); return; }
    vistos.set(k, fname);
    movs.push({...base, direction:"cargo", amount:monto});
  }));
  return {movs, excl, meta:{}};
}

function parseBciCC(rows, fname){
  const movs = [], excl = [], meta = {};
  let start = -1;
  rows.forEach((r,i) => {
    const c3 = String((r||[])[3]||"").trim().toLowerCase();
    if(c3.startsWith("saldo disponible")) meta.saldo = num(r[4]);
    if(start < 0 && String((r||[])[0]||"").trim().startsWith("Fecha Transacci")) start = i+1;
  });
  if(start < 0) return {movs, excl, meta, error:"formato inesperado"};
  rows.slice(start).forEach((r,k) => {
    if(!r || !String(r[0]||"").trim()) return;
    const date = fecha(r[1], "/"); if(!date) return;   // Fecha Contable = la oficial
    const desc = String(r[2]||"").trim();
    const cargo = String(r[6]||"").trim() ? num(r[6]) : 0;
    const abono = String(r[7]||"").trim() ? num(r[7]) : 0;
    const base = {producto:"BCI Cuenta Corriente", cuenta:"Banco BCI", date, desc,
                  origen:fname, fila:start+k};
    if(cargo){
      if(esPagoTarjeta(desc)) excl.push({...base, motivo:"pago_tarjeta_credito", amount:cargo});
      else movs.push({...base, direction:"cargo", amount:cargo});
    }
    if(abono) movs.push({...base, direction:"abono", amount:abono});
  });
  return {movs, excl, meta};
}

function parseBancoEstado(rows, fname){
  const movs = [], excl = [], meta = {};
  let start = -1;
  rows.forEach((r,i) => {
    const c0 = String((r||[])[0]||"").trim();
    if(c0.startsWith("Saldo Disponible Cuenta") || String((r||[])[4]||"").startsWith("Saldo Disponible Cuenta"))
      meta.saldo = num((r||[])[6] != null && String(r[6]).trim() ? r[6] : r[3]);
    if(start < 0 && c0 === "Fecha" && String((r||[])[2]||"").includes("Descrip")) start = i+1;
  });
  if(start < 0) return {movs, excl, meta, error:"formato inesperado"};
  rows.slice(start).forEach((r,k) => {
    if(!r || !String(r[0]||"").trim()) return;
    const f = String(r[0]).trim();
    if(f.includes("Subtotal") || !f.includes("/")) return;
    const date = fecha(f, "/"); if(!date) return;
    const op = String(r[1]||"").trim();
    const desc = String(r[2]||"").trim();
    const cargo = Math.abs(num(r[3])), abono = num(r[4]);
    const base = {producto:"BancoEstado CuentaRUT", cuenta:"BancoEstado", date, desc, op,
                  origen:fname, fila:start+k};
    if(cargo) movs.push({...base, direction:"cargo", amount:cargo});
    if(abono) movs.push({...base, direction:"abono", amount:abono});
  });
  return {movs, excl, meta};
}

/* --------------------------------------------------- dedup entre archivos */
function dedup(movs, excl){
  // 1) misma llave exacta en archivos distintos
  const vistos = new Map(), out = [];
  for(const m of movs){
    const k = [m.producto,m.cuenta,m.date,m.direction,m.amount,normDesc(m.desc)].join("|");
    if(vistos.has(k) && vistos.get(k) !== m.origen){
      excl.push({...m, motivo:"traslape_entre_archivos(ya_en_"+vistos.get(k)+")"}); continue; }
    vistos.set(k, m.origen); out.push(m);
  }
  // 2) desfase de 1 día entre archivos DISTINTOS (patrón recurrente: la fecha de
  //    operación vs la contable). Salvaguarda: si alguno de los dos archivos ya
  //    contiene ambas fechas, son operaciones reales y no se tocan.
  const porArchivo = new Map();
  out.forEach(m => {
    const k = [m.origen,m.producto,m.cuenta,m.direction,m.amount,normDesc(m.desc)].join("|");
    if(!porArchivo.has(k)) porArchivo.set(k, []);
    porArchivo.get(k).push(m.date);
  });
  const quitar = new Set();
  for(let i=0;i<out.length;i++){
    const a = out[i]; if(quitar.has(a)) continue;
    for(let j=i+1;j<out.length;j++){
      const b = out[j]; if(quitar.has(b)) continue;
      if(a.origen === b.origen) continue;
      if(a.producto!==b.producto||a.cuenta!==b.cuenta||a.direction!==b.direction||a.amount!==b.amount) continue;
      if(normDesc(a.desc) !== normDesc(b.desc)) continue;
      if(dias(a.date,b.date) !== 1) continue;
      const kd = [a.producto,a.cuenta,a.direction,a.amount,normDesc(a.desc)].join("|");
      if((porArchivo.get(a.origen+"|"+kd)||[]).includes(b.date)) continue;
      if((porArchivo.get(b.origen+"|"+kd)||[]).includes(a.date)) continue;
      quitar.add(b);
      excl.push({...b, motivo:"traslape_desfase_1dia(ya_en_"+a.origen+" con "+a.date+")"});
    }
  }
  return out.filter(m => !quitar.has(m));
}

/* ------------------------------- comparación contra lo ya registrado en la app */
function comparar(movs){
  const idName = {}; data.accounts.forEach(a => idName[a.id] = a.name);
  const efectos = [];
  data.transactions.forEach(t => {
    if(t.type === "gasto") efectos.push({acc:idName[t.account], date:t.date, dir:"cargo", amount:t.amount, desc:t.desc, id:t.id});
    else if(t.type === "ingreso") efectos.push({acc:idName[t.account], date:t.date, dir:"abono", amount:t.amount, desc:t.desc, id:t.id});
    else if(t.type === "transferencia"){
      efectos.push({acc:idName[t.account], date:t.date, dir:"cargo", amount:t.amount, desc:t.desc, id:t.id});
      efectos.push({acc:idName[t.to], date:t.date, dir:"abono", amount:t.amount, desc:t.desc, id:t.id});
    }
  });
  const usados = new Set();
  const key = e => [e.acc,e.date,e.dir,e.amount].join("|");
  const porExacta = new Map(), porSuelta = new Map();
  efectos.forEach((e,i) => {
    if(!porExacta.has(key(e))) porExacta.set(key(e), []);
    porExacta.get(key(e)).push(i);
    const k2 = [e.acc,e.dir,e.amount].join("|");
    if(!porSuelta.has(k2)) porSuelta.set(k2, []);
    porSuelta.get(k2).push(i);
  });

  const res = {yaRegistrado:[], faltante:[], correccion:[], dudoso:[]};
  const pendientes = [];
  // agrupar candidatos por llave exacta para emparejar 1:1
  const grupos = new Map();
  movs.forEach(m => {
    const k = [m.cuenta,m.date,m.direction,m.amount].join("|");
    if(!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  });
  for(const [k, cands] of grupos){
    const pool = (porExacta.get(k)||[]).filter(i => !usados.has(i));
    cands.forEach((c, idx) => {
      if(idx < pool.length){ usados.add(pool[idx]); res.yaRegistrado.push(c); }
      else pendientes.push(c);
    });
  }
  // tolerante: ±2 días (misma operación re-fechada por el banco)
  pendientes.forEach(c => {
    const k2 = [c.cuenta,c.direction,c.amount].join("|");
    const cerca = (porSuelta.get(k2)||[]).filter(i => !usados.has(i) && dias(efectos[i].date, c.date) <= 2);
    if(!cerca.length){ res.faltante.push(c); return; }
    let mejor = cerca[0], best = -1;
    cerca.forEach(i => { const s = simil(c.desc, efectos[i].desc); if(s > best){ best = s; mejor = i; } });
    if(best < 0.25){ res.dudoso.push({cand:c, match:efectos[mejor], simil:best}); return; }
    usados.add(mejor);
    if(efectos[mejor].date !== c.date) res.correccion.push({cand:c, match:efectos[mejor]});
    else res.yaRegistrado.push(c);
  });
  // aviso: traslapes ±1 día entre los propios faltantes (revisar a mano)
  res.revisar = [];
  for(let i=0;i<res.faltante.length;i++) for(let j=i+1;j<res.faltante.length;j++){
    const a = res.faltante[i], b = res.faltante[j];
    if(a.cuenta===b.cuenta && a.direction===b.direction && a.amount===b.amount
       && dias(a.date,b.date)===1 && normDesc(a.desc).slice(0,12)===normDesc(b.desc).slice(0,12))
      res.revisar.push([a,b]);
  }
  return res;
}

/* --------------------------------------------- construir la transacción final */
function construir(c){
  const acc = n => (data.accounts.find(a => a.name === n)||{}).id;
  const internos = acc("Movimientos internos");
  const cta = acc(c.cuenta);
  const interno = esTransfInterna(c.desc) || BCI_SOBREGIRO_INTERNO.has(c.desc);
  if(interno){
    return c.direction === "cargo"
      ? {type:"transferencia", amount:c.amount, date:c.date, account:cta, to:internos, desc:c.desc}
      : {type:"transferencia", amount:c.amount, date:c.date, account:internos, to:cta, desc:c.desc};
  }
  if(c.direction === "cargo"){
    // "Pago Credito" = cuota real del crédito de consumo, no un pago de tarjeta
    if(c.desc.toLowerCase().includes("pago credito"))
      return {type:"gasto", amount:c.amount, date:c.date, account:cta, desc:c.desc, category:"Deudas y cuotas"};
    const [nice, catOver] = descBonita(c.desc, c.amount);
    return {type:"gasto", amount:c.amount, date:c.date, account:cta, desc:nice,
            category: catOver || clasif(nice !== c.desc ? nice : c.desc, c.amount)};
  }
  const d = c.desc.toLowerCase();
  let cat;
  if(d.includes("proveedor") && c.cuenta === "Banco Falabella")
    cat = c.amount >= 2000000 ? "Sueldo" : "Horas Extraordinarias/Bonos";
  else if(d.startsWith("tef de") || d.startsWith("transferencia de") || d.startsWith("transf. de"))
    cat = "Reembolsos / Terceros";
  else cat = "Otros ingresos";
  return {type:"ingreso", amount:c.amount, date:c.date, account:cta, desc:c.desc, category:cat};
}

/* ------------------------------------------------------- leer los archivos */
async function leerArchivo(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:"array"});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:""});
}

async function procesar(files){
  const leidos = [];
  for(const f of files){
    try{
      const rows = await leerArchivo(f);
      leidos.push({fname:f.name, rows, tipo:identificar(rows)});
    }catch(e){ leidos.push({fname:f.name, rows:[], tipo:null, error:e.message}); }
  }
  let movs = [], excl = [];
  const metas = {};
  // CMR: procesar juntos y del ciclo más antiguo al más nuevo (el dedup conserva el 1º)
  const cmr = leidos.filter(x => x.tipo === "cmr").map(x => {
    const fechas = x.rows.slice(1).map(r => fecha(r && r[0], "-")).filter(Boolean);
    return {...x, max: fechas.length ? fechas.sort().slice(-1)[0] : ""};
  }).sort((a,b) => a.max.localeCompare(b.max));
  if(cmr.length){
    const r = parseCmr(cmr.map(x => ({fname:x.fname, rows:x.rows})));
    movs = movs.concat(r.movs); excl = excl.concat(r.excl);
  }
  for(const x of leidos){
    let r = null;
    if(x.tipo === "falabella_cc") r = parseFalabellaCC(x.rows, x.fname);
    else if(x.tipo === "bci_cc") r = parseBciCC(x.rows, x.fname);
    else if(x.tipo === "bancoestado") r = parseBancoEstado(x.rows, x.fname);
    else if(x.tipo === "bci_visa_fact" || x.tipo === "bci_visa_nofact") r = parseBciVisa(x.rows, x.fname);
    if(!r) continue;
    movs = movs.concat(r.movs); excl = excl.concat(r.excl);
    if(r.meta && Object.keys(r.meta).length) metas[x.tipo] = {...(metas[x.tipo]||{}), ...r.meta};
  }
  movs = dedup(movs, excl);
  const comp = comparar(movs);
  return {leidos, movs, excl, comp, metas};
}

return {procesar, construir, clasif, descBonita, identificar, comparar, dedup};
})();
