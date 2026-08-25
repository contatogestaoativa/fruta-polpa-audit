// ═══════════════════════════════════════════════════════════════════
// LINHA 138 — DESCONTOS CONCEDIDOS
// Fonte: Rotina 2107 (lançamento a lançamento) cruzada com Rotina 1008
// (data do título original), via Nº da Nota.
// Regra validada na auditoria manual (13-19/08/2026):
//   - "valor do mês"     = soma de VALOR por mês de DATA (lançamento)
//   - "exercício anterior" = linhas cujo título original (DATA 1008)
//                            é do ano de 2025 (não qualquer mês
//                            anterior — só contaminação entre anos)
//   - linhas #N/A na 1008 (título não encontrado) SOMAM no "exercício
//     anterior" também, pois foi o tratamento observado nos dados reais
//   - saldo do mês = valor do mês + reversão de exercício anterior
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {Array<{NOTA:number, DATA:Date, HISTORICO:string, VALOR:number, 'DATA 1008':Date|string|null, CLIENTE:string}>} rows
 * @returns {Array<{mes:string, valorTotal:number, reversaoExercicioAnterior:number, saldo:number, linhasNaoEncontradas:number}>}
 */
export function parseDescontosConcedidos(rows) {
  const porMes = {};

  for (const row of rows) {
    const data = toDate(row.DATA);
    if (!data) continue;
    const mesKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    const valor = Number(row.VALOR) || 0;
    const data1008 = toDate(row["DATA 1008"]);

    if (!porMes[mesKey]) {
      porMes[mesKey] = { mes: mesKey, valorTotal: 0, reversaoExercicioAnterior: 0, linhasNaoEncontradas: 0 };
    }
    const bucket = porMes[mesKey];
    bucket.valorTotal += valor;

    if (!data1008) {
      // #N/A no cruzamento — tratado como exercício anterior (regra observada)
      bucket.reversaoExercicioAnterior += valor;
      bucket.linhasNaoEncontradas += 1;
    } else if (data1008.getFullYear() < data.getFullYear()) {
      bucket.reversaoExercicioAnterior += valor;
    }
    // else: mesmo ano — fica como despesa real do mês, não reverte
  }

  return Object.values(porMes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((b) => ({
      ...b,
      valorTotal: round2(b.valorTotal),
      reversaoExercicioAnterior: round2(b.reversaoExercicioAnterior),
      // Convenção da DRE: despesa negativa + reversão positiva.
      saldoCompetencia: round2(b.reversaoExercicioAnterior - b.valorTotal),
      // Regime de caixa puro: sem a reversão de exercício anterior.
      saldoCaixa: round2(-b.valorTotal),
    }));
}

/** Detecta títulos duplicados (mesma NOTA, mesmo CLIENTE, mesmo VALOR, aparecendo em meses diferentes) — achado da auditoria (ex: nota 328538). */
export function detectarNotasDuplicadas(rows) {
  const porNota = {};
  for (const row of rows) {
    const key = `${row.NOTA}|${row.CLIENTE}|${row.VALOR}`;
    if (!porNota[key]) porNota[key] = [];
    porNota[key].push(row);
  }
  return Object.values(porNota).filter((group) => group.length > 1);
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" && v !== "#N/A") {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}
function round2(n) { return Math.round(n * 100) / 100; }
