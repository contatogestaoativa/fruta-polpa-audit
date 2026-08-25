// ═══════════════════════════════════════════════════════════════════
// DETECÇÃO DE "FORA DA CURVA"
// Regra definida em 19/08/2026: variação percentual configurável (X%)
// em relação à MÉDIA DOS ÚLTIMOS 3 MESES (não o mês anterior isolado,
// não a média do ano — reduz falso-positivo por sazonalidade de 1 mês).
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {number} valorAtual
 * @param {number[]} ultimosTresMeses  valores dos 3 meses anteriores (mais recente primeiro ou em qualquer ordem)
 * @param {number} limiarPct  ex: 20 = alerta se variar mais que 20%
 * @returns {{ anomalo: boolean, mediaHistorica: number, variacaoPct: number|null, nivel: 'ok'|'atencao'|'critico' }}
 */
export function detectarAnomalia(valorAtual, ultimosTresMeses, limiarPct = 20) {
  const validos = ultimosTresMeses.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (validos.length === 0) {
    return { anomalo: false, mediaHistorica: null, variacaoPct: null, nivel: "ok" };
  }
  const media = validos.reduce((s, v) => s + v, 0) / validos.length;
  if (media === 0) {
    return { anomalo: valorAtual !== 0, mediaHistorica: 0, variacaoPct: null, nivel: valorAtual !== 0 ? "atencao" : "ok" };
  }
  const variacaoPct = ((valorAtual - media) / Math.abs(media)) * 100;
  const absVar = Math.abs(variacaoPct);
  const anomalo = absVar > limiarPct;
  const nivel = absVar > limiarPct * 2 ? "critico" : absVar > limiarPct ? "atencao" : "ok";
  return { anomalo, mediaHistorica: round2(media), variacaoPct: round2(variacaoPct), nivel };
}

/**
 * Aplica a detecção a uma série mensal completa { '2026-01': valor, ... }
 * usando sempre os 3 meses cronologicamente anteriores ao mês avaliado.
 */
export function detectarAnomaliasSerie(serieMensal, limiarPct = 20) {
  const meses = Object.keys(serieMensal).sort();
  const resultado = {};
  meses.forEach((mes, i) => {
    const anteriores = meses.slice(Math.max(0, i - 3), i).map((m) => serieMensal[m]);
    resultado[mes] = {
      valor: serieMensal[mes],
      ...detectarAnomalia(serieMensal[mes], anteriores, limiarPct),
    };
  });
  return resultado;
}

function round2(n) { return Math.round(n * 100) / 100; }
