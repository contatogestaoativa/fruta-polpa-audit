// ═══════════════════════════════════════════════════════════════════
// FECHAMENTOS DO MÊS
// Regra definida com a diretoria (Gerson, 31/08/2026): o número de
// FECHAMENTOS de um mês é igual à quantidade de SEXTAS-FEIRAS daquele
// mês. É uma variável de volume: um mês com 5 sextas tem uma capacidade
// de faturamento estruturalmente maior que um mês com 4 — comparar os
// dois em valor absoluto, sem normalizar, distorce a leitura.
//
// Por isso o número aparece na DRE, no Comparativo de Períodos e como
// opção de normalização nas Anomalias.
// ═══════════════════════════════════════════════════════════════════

/** Quantidade de sextas-feiras (= fechamentos) de um mês "AAAA-MM". */
export function fechamentosNoMes(mesKey) {
  const [ano, mes] = String(mesKey || "").split("-").map(Number);
  if (!ano || !mes) return null;
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 5) n += 1;
  }
  return n;
}

/** Soma dos fechamentos de uma lista de meses. */
export function fechamentosNoPeriodo(meses) {
  return (meses || []).reduce((s, m) => s + (fechamentosNoMes(m) || 0), 0);
}

/** Mapa { "AAAA-MM": nº de fechamentos } para uma lista de meses. */
export function mapaFechamentos(meses) {
  return Object.fromEntries((meses || []).map((m) => [m, fechamentosNoMes(m)]));
}

/** Divide um valor pelo nº de fechamentos do mês (null se não der pra dividir). */
export function porFechamentoDoMes(valor, mesKey) {
  const f = fechamentosNoMes(mesKey);
  if (!f || valor === null || valor === undefined || typeof valor !== "number") return null;
  return valor / f;
}
