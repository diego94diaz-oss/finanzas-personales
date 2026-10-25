/* aventura.js — La app como un RPG: héroe con nivel y XP, misiones del mes,
   desafíos de la semana, jefes (tus deudas), logros y diario de aventura.

   Todo se DERIVA de los datos reales (movimientos, deudas, presupuestos): no hay
   que marcar nada a mano y no se guarda nada nuevo en la nube. Lo único que se
   guarda (localStorage, por dispositivo) es qué niveles y logros ya se celebraron,
   para no repetir el aviso.

   Depende de globales de index.html: data, todayStr, monthKey, monthLabel, clp,
   escHtml, debtSaldo, esGastoReal, mediana, saludIndicadores, financialSnapshot,
   saldoTrasSueldoYDeudas. Metas calibradas con el historial real (2026-10-24):
   mediana de ~13 gastos chicos por semana, ahorro mensual entre −38% y 56%. */

const RPG = {
  AHORRO_META: 15,          // % del ingreso del mes
  OTROS_MAX: 5,             // % del gasto del mes en «Otros»
  HORMIGA_MONTO: 10000,     // mismo umbral que el análisis de gastos hormiga
  HORMIGAS_SEMANA: 10,
  ATRASO_MAX: 7,            // días sin cargar movimientos
  MIN_MOVS_MES: 30,         // un mes con menos movimientos se considera incompleto
  XP_CUOTA: 40, XP_JEFE: 500,
  XP_RAREZA: {comun: 100, raro: 250, epico: 500, legendario: 1000},
  VISTO_KEY: "finanzas_rpg_visto",
};

const RPG_RANGOS = [
  [1,  "🪙", "Aprendiz de las monedas"],
  [3,  "🛡️", "Escudero del presupuesto"],
  [5,  "🏰", "Guardián del cofre"],
  [8,  "⚔️", "Caballero del ahorro"],
  [12, "✨", "Paladín sin cadenas"],
  [16, "🧙", "Mago de las finanzas"],
  [20, "👑", "Señor del tesoro"],
  [30, "🐲", "Leyenda dorada"],
];

/* ---------------------------------------------------------- utilidades */
// Fechas con aritmética local: new Date("2026-10-23") es medianoche UTC y en
// Chile cae el día anterior (mismo bug que tuvo el panel del día 25).
function rpgDate(s){ const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); }
function rpgYmd(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function rpgLunes(s){ const d = rpgDate(s); d.setDate(d.getDate() - ((d.getDay()+6) % 7)); return rpgYmd(d); }
function rpgSumaDias(s, n){ const d = rpgDate(s); d.setDate(d.getDate() + n); return rpgYmd(d); }
function rpgFinMes(mk){ const [y,m] = mk.split("-").map(Number); return rpgYmd(new Date(y, m, 0)); }
function rpgN(n){ return Math.round(n||0).toLocaleString("es-CL"); }
function rpgPct(x){ return Math.max(0, Math.min(100, Math.round((x||0)*100))); }
function rpgMes(mk){ return typeof mesNombreLargo === "function" ? mesNombreLargo(mk + "-01") : mk; }
function rpgIrA(tab){ const b = document.querySelector('#nav button[data-tab="' + tab + '"]'); if(b) b.click(); window.scrollTo(0,0); }
function irAAventura(){ rpgIrA("aventura"); }

/* ------------------------------------------- estadísticas por mes y semana */
function rpgContexto(){
  const hoy = todayStr(), mkHoy = monthKey(hoy), semHoy = rpgLunes(hoy);
  const meses = {}, semanas = {};
  const mes = k => meses[k] || (meses[k] = {ing:0, gas:0, vari:0, otros:0, inv:0, n:0, ultima:"", porCat:{}});
  const sem = k => semanas[k] || (semanas[k] = {vari:0, hormigas:0, n:0});
  for(const t of data.transactions){
    if(!t.date || t.date > hoy) continue;          // ignora programados a futuro
    const m = mes(monthKey(t.date)); m.n++; if(t.date > m.ultima) m.ultima = t.date;
    if(t.type === "ingreso") m.ing += t.amount || 0;
    if(t.type === "gasto" && t.category === "Inversiones") m.inv += t.amount || 0;
    if(esGastoReal(t)){
      const a = t.amount || 0;
      m.gas += a; m.porCat[t.category] = (m.porCat[t.category]||0) + a;
      if(t.category === "Otros") m.otros += a;
      const w = sem(rpgLunes(t.date)); w.n++;
      if(t.category !== "Deudas y cuotas"){ m.vari += a; w.vari += a; }
      if(a < RPG.HORMIGA_MONTO && t.category !== "Suscripciones") w.hormigas++;
    }
  }
  const listaMeses = Object.keys(meses).sort();
  const completos = listaMeses.filter(k => k < mkHoy && meses[k].n >= RPG.MIN_MOVS_MES);
  const listaSem = Object.keys(semanas).sort();
  return {hoy, mkHoy, semHoy, meses, semanas, listaMeses, completos, listaSem};
}

/* ------------------------------------------------------ misiones del mes
   cierre:true → se decide al terminar el mes (en el mes en curso solo muestra
   avance, salvo que ya esté perdida). limite:true → la barra es "cuánto has
   gastado del máximo" (llena = mal). */
function rpgMisionesMes(mk, ctx){
  const m = ctx.meses[mk] || {ing:0, gas:0, vari:0, otros:0, inv:0, n:0, ultima:"", porCat:{}};
  const enCurso = mk === ctx.mkHoy;
  const out = [];
  const add = q => {
    if(q.estado === "na") {}                                   // no aplica este mes
    else if(q.hecho) q.estado = "logrado";
    else if(q.perdida || !enCurso) q.estado = "fallido";
    else q.estado = "curso";
    out.push(q);
  };

  // 1. ahorro
  const tasa = m.ing > 0 ? (m.ing - m.gas) / m.ing * 100 : null;
  add({id:"ahorro", icono:"💰", nombre:"Botín asegurado", xp:150, cierre:true,
       desc:"Guarda al menos el " + RPG.AHORRO_META + "% de lo que entra en el mes.",
       prog: tasa === null ? 0 : Math.max(0, tasa) / RPG.AHORRO_META,
       hecho: !enCurso && tasa !== null && tasa >= RPG.AHORRO_META,
       estado: tasa === null ? "na" : "",
       detalle: tasa === null ? "Aún no entran ingresos este mes"
              : "Vas en " + Math.round(tasa) + "% (" + clp(m.ing - m.gas) + ")"});

  // 2. gasto variable bajo tu mediana reciente
  const previos = ctx.completos.filter(k => k < mk).slice(-3).map(k => ctx.meses[k].vari);
  const lim = previos.length ? Math.round(mediana(previos)) : 0;
  if(lim > 0) add({id:"muralla", icono:"🧱", nombre:"Muralla de contención", xp:150, cierre:true, limite:true,
       desc:"Que el gasto variable del mes no pase tu mediana reciente (" + clp(lim) + ").",
       prog: m.vari / lim, hecho: !enCurso && m.vari <= lim, perdida: m.vari > lim,
       detalle: m.vari > lim ? "Te pasaste por " + clp(m.vari - lim)
              : "Llevas " + clp(m.vari) + " · te quedan " + clp(lim - m.vari)});

  // 3. pagar todas las obligaciones del ciclo
  let pagadas = 0, total = 0;
  if(enCurso && typeof saldoTrasSueldoYDeudas === "function"){
    // mismo criterio que el panel «Saldo luego de sueldo y pago de deudas»
    const r = saldoTrasSueldoYDeudas();
    if(monthKey(r.corte) === mk){
      const obl = r.partes.filter(x => x.tipo === "menos");
      total = obl.length; pagadas = obl.filter(x => x.pagado).length;
    }
  } else {
    const ini = mk + "-01", fin = rpgFinMes(mk);
    data.debts.forEach(d => {
      const ps = d.payments || [];
      const activa = ps.some(p => p.date < ini) && (debtSaldo(d) > 0 || ps.some(p => p.date >= ini));
      if(!activa) return;
      total++; if(ps.some(p => p.date >= ini && p.date <= fin)) pagadas++;
    });
  }
  add({id:"pacto", icono:"🩸", nombre:"Pacto cumplido", xp:200,
       desc:"Paga todas las cuotas y compromisos del mes.",
       prog: total ? pagadas / total : 0, hecho: total > 0 && pagadas === total,
       estado: total ? "" : "na",
       detalle: total ? pagadas + " de " + total + " pagados" : "Sin cuotas este mes"});

  // 4. movimientos al día
  let atraso;
  if(enCurso){
    const ult = data.transactions.map(t => t.date).filter(f => f && f <= ctx.hoy).sort().pop();
    atraso = ult ? Math.round((rpgDate(ctx.hoy) - rpgDate(ult)) / 86400000) : 99;
  } else {
    atraso = m.ultima ? Math.round((rpgDate(rpgFinMes(mk)) - rpgDate(m.ultima)) / 86400000) : 99;
  }
  add({id:"cronista", icono:"📜", nombre:"Cronista al día", xp:100,
       desc:"Ten tus movimientos cargados con máximo " + RPG.ATRASO_MAX + " días de atraso.",
       prog: atraso <= RPG.ATRASO_MAX ? 1 : RPG.ATRASO_MAX / atraso, hecho: atraso <= RPG.ATRASO_MAX,
       detalle: atraso === 0 ? "Al día" : "Último movimiento hace " + atraso + " día" + (atraso === 1 ? "" : "s"),
       accion: atraso > RPG.ATRASO_MAX && enCurso ? {txt:"Subir cartolas", tab:"cartolas"} : null});

  // 5. «Otros» bajo control
  const pctOtros = m.gas > 0 ? m.otros / m.gas * 100 : 0;
  add({id:"inventario", icono:"🧹", nombre:"Inventario ordenado", xp:100, cierre:true, limite:true,
       desc:"Máximo " + RPG.OTROS_MAX + "% del gasto del mes en la categoría «Otros».",
       prog: pctOtros / RPG.OTROS_MAX, hecho: !enCurso && m.gas > 0 && pctOtros <= RPG.OTROS_MAX,
       estado: m.gas > 0 ? "" : "na",
       detalle: Math.round(pctOtros) + "% en «Otros» (" + clp(m.otros) + ")",
       accion: pctOtros > RPG.OTROS_MAX && enCurso ? {txt:"Clasificar", tab:"movimientos"} : null});

  // 6. invertir algo
  add({id:"tesoro", icono:"📈", nombre:"Alimenta el tesoro", xp:120,
       desc:"Envía algo a tus inversiones este mes.",
       prog: m.inv > 0 ? 1 : 0, hecho: m.inv > 0,
       detalle: m.inv > 0 ? clp(m.inv) + " invertidos" : "Todavía nada este mes"});

  // 7. presupuestos (si están definidos)
  const budgets = (data.meta && data.meta.budgets) || {};
  const cats = Object.keys(budgets).filter(c => budgets[c] > 0);
  if(cats.length){
    const pasadas = cats.filter(c => (m.porCat[c]||0) > budgets[c]);
    const peor = Math.max(...cats.map(c => (m.porCat[c]||0) / budgets[c]));
    add({id:"juramento", icono:"⚖️", nombre:"Juramento del presupuesto", xp:150, cierre:true, limite:true,
         desc:"Ninguna categoría con presupuesto se pasa de su tope.",
         prog: peor, hecho: !enCurso && !pasadas.length, perdida: pasadas.length > 0,
         detalle: pasadas.length ? "Pasadas: " + pasadas.join(", ") : cats.length + " categorías dentro del tope"});
  } else {
    out.push({id:"juramento", icono:"⚖️", nombre:"Juramento del presupuesto", xp:150, estado:"bloqueada",
              desc:"Define topes por categoría para desbloquear esta misión.", prog:0,
              detalle:"Bloqueada", accion:{txt:"Definir topes", tab:"analisis"}});
  }
  return out;
}

/* ------------------------------------------------- desafíos de la semana */
function rpgDesafiosSemana(lunes, ctx){
  const w = ctx.semanas[lunes] || {vari:0, hormigas:0, n:0};
  const enCurso = lunes === ctx.semHoy;
  const previas = ctx.listaSem.filter(k => k < lunes).slice(-12).map(k => ctx.semanas[k].vari);
  const lim = previas.length >= 4 ? Math.round(mediana(previas)) : 0;
  const out = [];
  if(lim > 0){
    const perdida = w.vari > lim;
    out.push({id:"austera", icono:"🏹", nombre:"Semana austera", xp:40, limite:true,
      desc:"Gasto variable de la semana bajo tu mediana de 12 semanas (" + clp(lim) + ").",
      prog: w.vari / lim, hecho: !enCurso && !perdida,
      estado: perdida ? "fallido" : enCurso ? "curso" : "logrado",
      detalle: perdida ? "Te pasaste por " + clp(w.vari - lim) : "Llevas " + clp(w.vari) + " · margen " + clp(lim - w.vari)});
  }
  const perdidaH = w.hormigas > RPG.HORMIGAS_SEMANA;
  out.push({id:"hormigas", icono:"🐜", nombre:"Cazador de hormigas", xp:40, limite:true,
    desc:"Máximo " + RPG.HORMIGAS_SEMANA + " gastos chicos (bajo " + clp(RPG.HORMIGA_MONTO) + ") en la semana.",
    prog: w.hormigas / RPG.HORMIGAS_SEMANA, hecho: !enCurso && !perdidaH,
    estado: perdidaH ? "fallido" : enCurso ? "curso" : "logrado",
    detalle: w.hormigas + " de " + RPG.HORMIGAS_SEMANA + " permitidos"});
  return out;
}

/* -------------------------------------------------------- jefes = deudas */
function rpgMonstruo(d){
  const rate = Number(d.rate) || 0;
  if(rate >= 2) return {e:"🐍", n:"Basilisco", veneno: "Veneno: " + String(rate).replace(".", ",") + "% mensual"};
  if(rate > 0)  return {e:"🐉", n:"Dragón",    veneno: "Fuego: " + String(rate).replace(".", ",") + "% mensual"};
  if(d.incluidoEn) return {e:"🗿", n:"Gólem", veneno: "Sin interés: lento pero pesado"};
  return {e:"👹", n:"Ogro", veneno: "Sin interés"};
}
function rpgJefes(){
  return data.debts.map(d => {
    const tot = d.cuotasTotal || 0, pag = Math.min(tot, d.cuotasPagadas || 0);
    const saldo = debtSaldo(d);
    const vivo = tot ? pag < tot && saldo > 0 : saldo > 0;
    const hp = tot ? (tot - pag) / tot : (d.original ? saldo / d.original : (vivo ? 1 : 0));
    const golpes = (d.payments || []).slice().sort((a,b) => (a.date||"").localeCompare(b.date||""));
    return {d, m: rpgMonstruo(d), tot, pag, saldo, vivo, hp, golpes, restan: Math.max(0, tot - pag),
            caida: vivo ? null : (golpes.length ? golpes[golpes.length-1].date : null)};
  }).sort((a,b) => (b.vivo - a.vivo) || (a.restan - b.restan));
}

/* --------------------------------------------------------------- logros */
function rpgRachaMax(lista, ok){
  let max = 0, cur = 0;
  for(const k of lista){ if(ok(k)){ cur++; max = Math.max(max, cur); } else cur = 0; }
  return max;
}
function rpgLogros(ctx, jefes, snap){
  const pagos = data.debts.reduce((s,d) => s + (d.payments||[]).length, 0);
  const tasa = k => { const m = ctx.meses[k]; return m.ing > 0 ? (m.ing - m.gas) / m.ing * 100 : -999; };
  const semPasadas = ctx.listaSem.filter(k => k < ctx.semHoy);
  const desafio = (k, id) => (rpgDesafiosSemana(k, ctx).find(x => x.id === id) || {}).hecho;
  const L = [
    {id:"primera", icono:"🗡️", nombre:"Primera sangre", rareza:"comun", desc:"Registra el pago de una cuota.", ok: pagos > 0},
    {id:"mitad", icono:"⚔️", nombre:"A mitad del camino", rareza:"comun", desc:"Lleva una deuda al 50% de sus cuotas.",
       ok: jefes.some(j => j.tot && j.pag / j.tot >= .5)},
    {id:"matadragon", icono:"💀", nombre:"Matajefes", rareza:"raro", desc:"Termina de pagar una deuda.", ok: jefes.some(j => !j.vivo)},
    {id:"libre", icono:"👑", nombre:"Libre de cadenas", rareza:"legendario", desc:"Todas tus deudas en cero.",
       ok: jefes.length > 0 && jefes.every(j => !j.vivo)},
    {id:"semilla", icono:"🌱", nombre:"Semilla del tesoro", rareza:"comun", desc:"Haz tu primer aporte a inversiones.",
       ok: ctx.listaMeses.some(k => ctx.meses[k].inv > 0)},
    {id:"verde", icono:"💚", nombre:"Mes en verde", rareza:"raro", desc:"Cierra un mes ahorrando 20% o más.",
       ok: ctx.completos.some(k => tasa(k) >= 20)},
    {id:"racha3", icono:"🔥", nombre:"Racha de fuego", rareza:"epico", desc:"3 meses seguidos con ahorro positivo.",
       ok: rpgRachaMax(ctx.completos, k => tasa(k) > 0) >= 3},
    {id:"impecable", icono:"🧹", nombre:"Inventario impecable", rareza:"epico", desc:"Cierra un mes con menos de 3% en «Otros».",
       ok: ctx.completos.some(k => ctx.meses[k].gas > 0 && ctx.meses[k].otros / ctx.meses[k].gas < .03)},
    {id:"cronista", icono:"📚", nombre:"Gran cronista", rareza:"raro", desc:"Acumula 1.000 movimientos registrados.",
       ok: data.transactions.length >= 1000},
    {id:"cazador", icono:"🐜", nombre:"Exterminador", rareza:"raro", desc:"Una semana con 5 gastos chicos o menos.",
       ok: semPasadas.some(k => ctx.semanas[k].hormigas <= 5)},
    {id:"constancia", icono:"🏹", nombre:"Arquero constante", rareza:"epico", desc:"4 semanas austeras seguidas.",
       ok: rpgRachaMax(semPasadas, k => desafio(k, "austera")) >= 4},
    {id:"colchon", icono:"🛏️", nombre:"Colchón de un mes", rareza:"comun", desc:"Ten líquido para cubrir 1 mes de gastos.",
       ok: snap.coberturaMeses !== null && snap.coberturaMeses >= 1},
    {id:"fortaleza", icono:"🏰", nombre:"Fortaleza", rareza:"epico", desc:"Ten líquido para 3 meses de gastos.",
       ok: snap.coberturaMeses !== null && snap.coberturaMeses >= 3},
  ];
  return L;
}

/* -------------------------------------------------------------- el héroe */
function rpgEstado(){
  const ctx = rpgContexto();
  const snap = financialSnapshot();
  const jefes = rpgJefes();
  const logros = rpgLogros(ctx, jefes, snap);

  // XP: misiones de meses cerrados + las ya logradas del mes en curso
  let xpMisiones = 0;
  ctx.completos.forEach(k => rpgMisionesMes(k, ctx).forEach(q => { if(q.hecho) xpMisiones += q.xp; }));
  const misionesHoy = rpgMisionesMes(ctx.mkHoy, ctx);
  misionesHoy.forEach(q => { if(q.hecho && !q.cierre) xpMisiones += q.xp; });
  let xpSemanas = 0;
  ctx.listaSem.filter(k => k < ctx.semHoy).forEach(k =>
    rpgDesafiosSemana(k, ctx).forEach(q => { if(q.hecho) xpSemanas += q.xp; }));
  const xpCuotas = data.debts.reduce((s,d) => s + (d.payments||[]).length, 0) * RPG.XP_CUOTA;
  const xpJefes = jefes.filter(j => !j.vivo).length * RPG.XP_JEFE;
  const xpLogros = logros.filter(l => l.ok).reduce((s,l) => s + RPG.XP_RAREZA[l.rareza], 0);
  const xp = xpMisiones + xpSemanas + xpCuotas + xpJefes + xpLogros;

  const nivel = Math.max(1, Math.floor(Math.sqrt(xp / 100)));
  const xpNivel = 100 * nivel * nivel, xpSig = 100 * (nivel + 1) * (nivel + 1);
  const rango = RPG_RANGOS.filter(r => r[0] <= nivel).pop();

  const tasa = k => { const m = ctx.meses[k]; return m.ing > 0 ? (m.ing - m.gas) / m.ing : -1; };
  let racha = 0;
  for(let i = ctx.completos.length - 1; i >= 0 && tasa(ctx.completos[i]) > 0; i--) racha++;

  return {ctx, snap, jefes, logros, misionesHoy, desafios: rpgDesafiosSemana(ctx.semHoy, ctx),
          xp, nivel, xpNivel, xpSig, rango, racha,
          desglose: {xpMisiones, xpSemanas, xpCuotas, xpJefes, xpLogros}};
}

/* Atributos del héroe = los indicadores de «Salud financiera», con nombre de RPG. */
const RPG_ATRIBUTOS = {
  "Fondo de emergencia":  ["❤️", "Vitalidad"],
  "Tasa de ahorro":       ["💪", "Fuerza"],
  "Carga de deuda":       ["🛡️", "Armadura"],
  "Uso de tus tarjetas":  ["🎯", "Destreza"],
  "Patrimonio neto":      ["💎", "Riqueza"],
  "Deuda vs. lo que ganas": ["🧠", "Sabiduría"],
};
function rpgAtributos(snap){
  const puntos = {bien: 18, regular: 11, mal: 5};
  const r = saludIndicadores(snap);          // devuelve {ind, nota}
  return ((r && r.ind) || []).map(i => {
    const [e, n] = RPG_ATRIBUTOS[i.nombre] || ["⭐", i.nombre];
    return {e, n, real: i.nombre, valor: i.valor, estado: i.estado, pts: puntos[i.estado] || 8, consejo: i.consejo};
  });
}

/* ------------------------------------------------------ diario de aventura */
function rpgDiario(st){
  const ev = [];
  st.jefes.forEach(j => {
    j.golpes.forEach(p => ev.push({f: p.date, t: "⚔️ Golpeaste al " + j.m.n + " «" + j.d.name + "» por " + clp(p.amount)}));
    if(!j.vivo && j.caida) ev.push({f: j.caida, t: "💀 ¡Derrotaste al " + j.m.n + " «" + j.d.name + "»!", top: true});
  });
  data.transactions.forEach(t => {
    if(!t.date || t.date > st.ctx.hoy) return;
    if(t.type === "ingreso" && t.category === "Sueldo") ev.push({f: t.date, t: "💰 Botín del reino: sueldo de " + clp(t.amount)});
    if(t.type === "gasto" && t.category === "Inversiones") ev.push({f: t.date, t: "📈 Guardaste " + clp(t.amount) + " en el tesoro"});
  });
  return ev.sort((a,b) => b.f.localeCompare(a.f) || (b.top?1:0) - (a.top?1:0)).slice(0, 12);
}

/* --------------------------------------------------------------- render */
function rpgBarra(prog, cls){
  return `<div class="rpg-bar ${cls||""}"><div style="width:${rpgPct(prog)}%"></div></div>`;
}
const RPG_ESTADO = {
  logrado: ["✔ Lograda", "ok"], curso: ["En curso", "curso"], fallido: ["Fallida", "mal"],
  na: ["No aplica", "na"], bloqueada: ["🔒 Bloqueada", "na"],
};
function rpgMisionHtml(q){
  const [txt, cls] = RPG_ESTADO[q.estado] || ["", ""];
  const barCls = q.limite ? (q.prog > 1 ? "mal" : q.prog > .8 ? "alerta" : "ok") : (q.hecho ? "ok" : "");
  return `<div class="rpg-quest ${cls}">
    <div class="rpg-quest-ico">${q.icono}</div>
    <div class="rpg-quest-body">
      <div class="rpg-quest-head"><b>${escHtml(q.nombre)}</b><span class="rpg-xp">+${q.xp} XP</span></div>
      <div class="small muted">${escHtml(q.desc)}</div>
      ${rpgBarra(q.prog, barCls)}
      <div class="rpg-quest-foot"><span class="small">${escHtml(q.detalle||"")}</span>
        <span class="rpg-tag ${cls}">${txt}${q.cierre && q.estado === "curso" ? " · se decide al cerrar el mes" : ""}</span></div>
      ${q.accion ? `<button class="btn ghost rpg-accion" onclick="rpgIrA('${q.accion.tab}')">${escHtml(q.accion.txt)} →</button>` : ""}
    </div></div>`;
}

function renderAventuraHud(st){
  const box = document.getElementById("dash-rpg");
  if(!box) return;
  const hechas = st.misionesHoy.filter(q => q.estado === "logrado").length;
  const contables = st.misionesHoy.filter(q => q.estado !== "na" && q.estado !== "bloqueada").length;
  const jefe = st.jefes.find(j => j.vivo);
  box.innerHTML = `
    <button class="rpg-hud" onclick="irAAventura()" title="Abrir tu aventura">
      <span class="rpg-avatar">${st.rango[1]}</span>
      <span class="rpg-hud-lv"><span class="rpg-px">Nv. ${st.nivel}</span><span class="small muted">${escHtml(st.rango[2])}</span></span>
      <span class="rpg-hud-xp">${rpgBarra((st.xp - st.xpNivel) / (st.xpSig - st.xpNivel), "xp")}
        <span class="small muted">${rpgN(st.xp)} / ${rpgN(st.xpSig)} XP</span></span>
      <span class="rpg-chip">📜 ${hechas}/${contables} misiones</span>
      ${st.racha ? `<span class="rpg-chip">🔥 ${st.racha} ${st.racha === 1 ? "mes" : "meses"} ahorrando</span>` : ""}
      ${jefe ? `<span class="rpg-chip">${jefe.m.e} ${escHtml(jefe.d.name)}: ${jefe.restan} ${jefe.restan === 1 ? "golpe" : "golpes"}</span>` : ""}
    </button>`;
}

function renderAventura(){
  if(!data || !Array.isArray(data.transactions)) return;
  let st;
  try{ st = rpgEstado(); }catch(e){ console.error("[Aventura]", e); return; }
  renderAventuraHud(st);
  rpgCelebrar(st);
  const box = document.getElementById("aventura-body");
  if(!box) return;

  const atr = rpgAtributos(st.snap);
  const jefesVivos = st.jefes.filter(j => j.vivo), caidos = st.jefes.filter(j => !j.vivo);
  const lun = st.ctx.semHoy, dom = rpgSumaDias(lun, 6);
  const dm = f => f.slice(8,10) + "-" + f.slice(5,7);
  const logOk = st.logros.filter(l => l.ok).length;
  const RAREZA = {comun:"Común", raro:"Raro", epico:"Épico", legendario:"Legendario"};

  box.innerHTML = `
  <div class="rpg-shell">
    <div class="panel rpg-hero">
      <div class="rpg-hero-main">
        <div class="rpg-avatar big">${st.rango[1]}</div>
        <div style="flex:1;min-width:220px">
          <div class="kicker">Tu héroe</div>
          <div class="rpg-px rpg-hero-lv">Nivel ${st.nivel}</div>
          <div class="rpg-hero-title">${escHtml(st.rango[2])}</div>
          ${rpgBarra((st.xp - st.xpNivel) / (st.xpSig - st.xpNivel), "xp big")}
          <div class="small muted">${rpgN(st.xp)} XP · faltan ${rpgN(st.xpSig - st.xp)} para el nivel ${st.nivel + 1}</div>
          <div class="rpg-chips">
            ${st.racha ? `<span class="rpg-chip">🔥 Racha: ${st.racha} ${st.racha === 1 ? "mes" : "meses"} ahorrando</span>` : `<span class="rpg-chip">🔥 Sin racha: cierra un mes ahorrando para empezarla</span>`}
            <span class="rpg-chip">🏆 ${logOk}/${st.logros.length} logros</span>
            <span class="rpg-chip">💀 ${caidos.length}/${st.jefes.length} jefes derrotados</span>
          </div>
        </div>
      </div>
      <div class="rpg-stats">
        ${atr.map(a => `<div class="rpg-stat" title="${escHtml(a.real + ": " + a.valor + ". " + (a.consejo||""))}">
          <div class="rpg-stat-head"><span>${a.e} ${escHtml(a.n)}</span><b class="rpg-px">${a.pts}</b></div>
          ${rpgBarra(a.pts / 20, a.estado === "bien" ? "ok" : a.estado === "regular" ? "alerta" : "mal")}
          <div class="tiny-note">${escHtml(a.real)}: ${escHtml(a.valor)}</div></div>`).join("")}
      </div>
    </div>

    <div class="rpg-cols">
      <div class="panel">
        <h2 class="rpg-h">📜 Misiones de ${rpgMes(st.ctx.mkHoy)}</h2>
        <div class="rpg-quests">${st.misionesHoy.map(rpgMisionHtml).join("")}</div>
      </div>
      <div>
        <div class="panel">
          <h2 class="rpg-h">🗓️ Desafíos de la semana <span class="small muted" style="text-transform:none;letter-spacing:0">${dm(lun)} al ${dm(dom)}</span></h2>
          <div class="rpg-quests">${st.desafios.map(rpgMisionHtml).join("")}</div>
        </div>
        <div class="panel">
          <h2 class="rpg-h">📖 Diario de aventura</h2>
          <div class="rpg-log">${rpgDiario(st).map(e => `<div><span class="rpg-log-f">${dm(e.f)}</span> ${escHtml(e.t)}</div>`).join("")
             || `<div class="empty">Tu aventura recién comienza.</div>`}</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2 class="rpg-h">🐉 Jefes por derrotar</h2>
      ${jefesVivos.length ? `<div class="rpg-bosses">${jefesVivos.map(j => `
        <div class="rpg-boss">
          <div class="rpg-boss-head"><span class="rpg-boss-ico">${j.m.e}</span>
            <div><b>${j.m.n} «${escHtml(j.d.name)}»</b><div class="small muted">${escHtml(j.m.veneno)}</div></div></div>
          <div class="rpg-hp-label"><span>HP</span><span class="num">${clp(j.saldo)}</span></div>
          ${rpgBarra(j.hp, "hp")}
          <div class="small muted">${j.tot ? `${j.pag}/${j.tot} golpes · ${j.restan === 1 ? "¡un golpe más y cae!" : "faltan " + j.restan}` : "sin plan de cuotas"}
            ${j.golpes.length ? ` · último golpe ${dm(j.golpes[j.golpes.length-1].date)}` : ""}</div>
        </div>`).join("")}</div>` : `<div class="empty">No quedan jefes en pie. 👑</div>`}
      ${caidos.length ? `<div class="mini-divider"></div><div class="small muted" style="margin-bottom:8px">Salón de trofeos</div>
        <div class="rpg-chips">${caidos.map(j => `<span class="rpg-chip trofeo">💀 ${escHtml(j.d.name)}${j.caida ? " · " + dm(j.caida) : ""}</span>`).join("")}</div>` : ""}
    </div>

    <div class="panel">
      <h2 class="rpg-h">🏆 Logros <span class="small muted" style="text-transform:none;letter-spacing:0">${logOk} de ${st.logros.length}</span></h2>
      <div class="rpg-logros">${st.logros.map(l => `
        <div class="rpg-logro ${l.ok ? "ok" : "lock"} ${l.rareza}">
          <div class="rpg-logro-ico">${l.ok ? l.icono : "🔒"}</div>
          <div><b>${escHtml(l.nombre)}</b><div class="small muted">${escHtml(l.desc)}</div>
          <div class="rpg-rareza">${RAREZA[l.rareza]} · +${RPG.XP_RAREZA[l.rareza]} XP</div></div>
        </div>`).join("")}</div>
    </div>

    <details class="panel rpg-help">
      <summary><b>¿Cómo se gana experiencia?</b></summary>
      <div class="small muted" style="margin-top:10px;line-height:1.55">
        Todo sale de tus datos reales: no hay nada que marcar a mano.<br>
        · Misiones del mes: cada una da su XP. Las de ahorro, gasto, «Otros» y presupuesto se deciden al cerrar el mes.<br>
        · Desafíos de la semana: 40 XP cada uno, al terminar la semana.<br>
        · Cada cuota pagada es un golpe a un jefe: ${RPG.XP_CUOTA} XP. Derrotar un jefe: ${RPG.XP_JEFE} XP.<br>
        · Logros: ${RPG.XP_RAREZA.comun} / ${RPG.XP_RAREZA.raro} / ${RPG.XP_RAREZA.epico} / ${RPG.XP_RAREZA.legendario} XP según rareza.<br>
        · Atributos: son tus indicadores de Salud financiera (pasa el mouse sobre cada uno).<br>
        Tu XP: misiones ${rpgN(st.desglose.xpMisiones)} · semanas ${rpgN(st.desglose.xpSemanas)} · cuotas ${rpgN(st.desglose.xpCuotas)}
        · jefes ${rpgN(st.desglose.xpJefes)} · logros ${rpgN(st.desglose.xpLogros)}.
      </div>
    </details>
  </div>`;
}

/* -------------------------------------------- avisos: nivel y logros nuevos */
function rpgToast(html){
  let cont = document.getElementById("rpg-toasts");
  if(!cont){ cont = document.createElement("div"); cont.id = "rpg-toasts"; document.body.appendChild(cont); }
  const t = document.createElement("div");
  t.className = "rpg-toast"; t.innerHTML = html;
  t.onclick = () => { t.remove(); irAAventura(); };
  cont.appendChild(t);
  setTimeout(() => t.classList.add("fuera"), 6000);
  setTimeout(() => t.remove(), 6600);
}
function rpgCelebrar(st){
  // solo con datos reales cargados (no con la app vacía antes del login)
  if(!data.transactions.length) return;
  const ahora = {nivel: st.nivel, logros: st.logros.filter(l => l.ok).map(l => l.id),
                 jefes: st.jefes.filter(j => !j.vivo).map(j => j.d.id)};
  let previo = null;
  try{ previo = JSON.parse(localStorage.getItem(RPG.VISTO_KEY) || "null"); }catch(e){}
  try{ localStorage.setItem(RPG.VISTO_KEY, JSON.stringify(ahora)); }catch(e){ return; }
  if(!previo){
    rpgToast(`⚔️ <b>Tu aventura comienza</b><br>Nivel ${st.nivel} · ${escHtml(st.rango[2])}`);
    return;
  }
  if(ahora.nivel > previo.nivel) rpgToast(`⬆️ <b>¡Subiste a nivel ${ahora.nivel}!</b><br>${escHtml(st.rango[2])}`);
  st.jefes.filter(j => !j.vivo && !(previo.jefes||[]).includes(j.d.id)).forEach(j =>
    rpgToast(`💀 <b>¡Derrotaste al ${j.m.n} «${escHtml(j.d.name)}»!</b><br>+${RPG.XP_JEFE} XP`));
  st.logros.filter(l => l.ok && !(previo.logros||[]).includes(l.id)).forEach(l =>
    rpgToast(`🏆 <b>Logro: ${escHtml(l.nombre)}</b><br>+${RPG.XP_RAREZA[l.rareza]} XP`));
}
