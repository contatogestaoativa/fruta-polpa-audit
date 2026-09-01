// ═══════════════════════════════════════════════════════════════════
// REFERÊNCIA DA DRE — valores já validados na auditoria manual
// (13-20/08/2026), usados para as linhas que ainda não têm import
// automatizado. As linhas 138/209/211 são substituídas pelo valor
// AO VIVO assim que o usuário importa o arquivo correspondente.
//
// IMPORTANTE — fórmula real confirmada com a contabilidade em 20/08:
//   Lucro Operacional Gerencial = Lucro Operacional Contábil (ANTES
//     das subvenções) + ajustes gerenciais (206-211)
//   Lucro com Subvenções = Resultado Líquido do Exercício (DEPOIS das
//     subvenções, já embutidas via "receitas não operacionais") +
//     OS MESMOS ajustes gerenciais (206-211)
// As subvenções NÃO são somadas duas vezes — um bug real que
// encontramos e corrigimos ao validar contra os totais oficiais.
// ═══════════════════════════════════════════════════════════════════

import { fechamentosNoMes } from "./fechamentos.js";

export const MESES = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
export const MESES_LABEL = { "2026-01": "Jan", "2026-02": "Fev", "2026-03": "Mar", "2026-04": "Abr", "2026-05": "Mai", "2026-06": "Jun", "2026-07": "Jul" };

export const REF = {
  receitaBruta: { "2026-01": 7904400.74, "2026-02": 7297232.28, "2026-03": 7154918.26, "2026-04": 8633209.77, "2026-05": 7967609.43, "2026-06": 7707628.74, "2026-07": 9726621.31 },
  deducoes: { "2026-01": -1419532.23, "2026-02": -1402650.96, "2026-03": -1330155.35, "2026-04": -1410859.16, "2026-05": -1339725.66, "2026-06": -1223006.79, "2026-07": -1668688.3 },
  cpv: { "2026-01": -3583295.78, "2026-02": -3838861.73, "2026-03": -4523536.46, "2026-04": -4321713.22, "2026-05": -4501657.87, "2026-06": -4759382.33, "2026-07": -5425390.46 },
  // Despesas operacionais JÁ SEM o efeito da linha 138 (isolada p/ recompor ao vivo)
  despesasOperacionaisSemLinha138: {
    "2026-01": -1730609.31 + 10255.51, "2026-02": -1610192.03 + 84033.5, "2026-03": -1833250.69 + 199149.04,
    "2026-04": -1832517.17 + 202620.51, "2026-05": -1831154.09 + 174959.33, "2026-06": -2660671.07 + 657096.5, "2026-07": -3399801.52 + 385773.39,
  },
  receitasOperacionais: { "2026-01": 168375.42, "2026-02": 158892.62, "2026-03": 216505.43, "2026-04": 187517.58, "2026-05": 183154.04, "2026-06": 165766.94, "2026-07": 160387.71 },
  receitasNaoOperacionais: { "2026-01": 969668.91, "2026-02": 861257.9, "2026-03": 1069435.33, "2026-04": 1020285.44, "2026-05": 861219.93, "2026-06": 830522.47, "2026-07": 1111501.65 },
  provisaoCsllIrpj: { "2026-01": 0, "2026-02": 0, "2026-03": -385828.45, "2026-04": 0, "2026-05": 0, "2026-06": -5670.37, "2026-07": 0 },
  depreciacao: { "2026-01": 335595.53, "2026-02": 337373.07, "2026-03": 337560.35, "2026-04": 338692.11, "2026-05": 339250.17, "2026-06": 345606.39, "2026-07": 423172.9 },
  easy: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0 },
  nfBaixaBacuri: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0 },
  nfPosto: { "2026-01": 238300.64, "2026-02": 222731.45, "2026-03": 502353.24, "2026-04": 10441.52, "2026-05": 292894.06, "2026-06": 443041.87, "2026-07": 313540.55 },
  faturamentoGerencial: { "2026-01": 7608270.97, "2026-02": 6916992.49, "2026-03": 6844337.6, "2026-04": 8418031.28, "2026-05": 7743298.09, "2026-06": 7608805.05, "2026-07": 9460436.08 },
};

export const OFICIAL = {
  "138": { "2026-01": -10255.51, "2026-02": -84033.5, "2026-03": -199149.04, "2026-04": -202620.51, "2026-05": -174959.33, "2026-06": -657096.5, "2026-07": -385773.39 },
  "209": { "2026-01": 45245.33, "2026-02": 189013.75, "2026-03": 60284.59, "2026-04": 177610.65, "2026-05": 69295.56, "2026-06": 74273.3, "2026-07": 1141852.26 },
  "211": { "2026-01": 256600.1, "2026-02": 261185.82, "2026-03": 279984.39, "2026-04": 314185.9, "2026-05": 313406.26, "2026-06": 354644.82, "2026-07": 415595.63 },
};

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Monta a DRE completa de um mês, usando os valores AO VIVO das linhas
 * 138/209/211 quando fornecidos (senão cai para a referência oficial).
 * Validado célula a célula contra os totais oficiais (213/218) em
 * 20/08/2026 — os 7 meses batem exato.
 */
export function montarDreDoMes(mes, { linha138, linha209, linha211 } = {}) {
  const l138 = linha138 ?? OFICIAL["138"][mes];
  const l209 = linha209 ?? OFICIAL["209"][mes];
  const l211 = linha211 ?? OFICIAL["211"][mes];

  const receitaBruta = REF.receitaBruta[mes];
  const deducoes = REF.deducoes[mes];
  const receitaLiquida = round2(receitaBruta + deducoes);
  const cpv = REF.cpv[mes];
  const lucroBruto = round2(receitaLiquida + cpv);
  const despesasOperacionais = round2(REF.despesasOperacionaisSemLinha138[mes] + l138);
  const receitasOperacionais = REF.receitasOperacionais[mes];
  const lucroOperacionalContabil = round2(lucroBruto + despesasOperacionais + receitasOperacionais);
  const receitasNaoOperacionais = REF.receitasNaoOperacionais[mes];
  const resultadoAntesCsll = round2(lucroOperacionalContabil + receitasNaoOperacionais);
  const provisaoCsll = REF.provisaoCsllIrpj[mes];
  const resultadoLiquido = round2(resultadoAntesCsll + provisaoCsll);

  const depreciacao = REF.depreciacao[mes], easy = REF.easy[mes], nfBaixaBacuri = REF.nfBaixaBacuri[mes], nfPosto = REF.nfPosto[mes];
  const ajustesGerenciais = round2(depreciacao + easy + nfBaixaBacuri + l209 + nfPosto - l211);
  const lucroOperacionalGerencial = round2(lucroOperacionalContabil + ajustesGerenciais);
  const lucroComSubvencoes = round2(resultadoLiquido + ajustesGerenciais);

  const faturamentoGerencial = REF.faturamentoGerencial[mes];
  const lucratividadeContabil = faturamentoGerencial ? round2((lucroOperacionalContabil / faturamentoGerencial) * 10000) / 100 : null;
  const lucratividadeGerencial = faturamentoGerencial ? round2((lucroOperacionalGerencial / faturamentoGerencial) * 10000) / 100 : null;
  const lucratividadeComSubvencoes = faturamentoGerencial ? round2((lucroComSubvencoes / faturamentoGerencial) * 10000) / 100 : null;

  return {
    mes, receitaBruta, deducoes, receitaLiquida, cpv, lucroBruto, despesasOperacionais, receitasOperacionais,
    lucroOperacionalContabil, receitasNaoOperacionais, resultadoAntesCsll, provisaoCsll, resultadoLiquido,
    depreciacao, easy, nfBaixaBacuri, linha209: l209, nfPosto, linha211: l211,
    lucroOperacionalGerencial, lucroComSubvencoes, linha138: l138,
    faturamentoGerencial, lucratividadeContabil, lucratividadeGerencial, lucratividadeComSubvencoes,
  };
}

// ═══════════════════════════════════════════════════════════════════
// VALOR DE UMA LINHA (considera override ao vivo, senão usa DRE_NODES) —
// função central usada pela árvore, pelo módulo de impostos e pelas
// anomalias, para não haver duas versões divergentes da mesma conta.
// ═══════════════════════════════════════════════════════════════════
export function getValorNode(node, mes, overrides) {
  const ov = overrides?.[mes]?.[node.row];
  return ov !== undefined ? ov : node.values[mes];
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO — RECEITA x LUCRO x CARGA TRIBUTÁRIA
// Total de impostos = ICMS s/venda (8) + PIS (9) + COFINS (10) sobre a
// receita, + Despesas Tributárias (144, já subtotal) + Provisão
// CSLL/IRPJ (194, já subtotal). Somamos os subtotais, não os detalhes,
// para não contar duas vezes.
// ═══════════════════════════════════════════════════════════════════
const LINHAS_IMPOSTO = [8, 9, 10, 144, 194];

export function calcularCargaTributaria(mes, dreNodes, overrides) {
  const porRow = {};
  for (const n of dreNodes) porRow[n.row] = n;

  const receita = getValorNode(porRow[4], mes, overrides);
  const impostos = LINHAS_IMPOSTO.reduce((s, row) => s + Math.abs(getValorNode(porRow[row], mes, overrides) || 0), 0);
  const dre = montarDreDoMes(mes, {
    linha138: overrides?.[mes]?.[138], linha209: overrides?.[mes]?.[209], linha211: overrides?.[mes]?.[211],
  });
  const lucro = dre.lucroComSubvencoes;

  return {
    mes, receita: round2(receita), impostos: round2(impostos), lucro: round2(lucro),
    pctImpostoReceita: receita ? round2((impostos / receita) * 10000) / 100 : null,
    pctLucroReceita: receita ? round2((lucro / receita) * 10000) / 100 : null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ANOMALIAS EM TODAS AS LINHAS DA DRE (totais e contas sintéticas,
// mesmo as que ficam ocultas por padrão na árvore) — compara cada
// linha, em cada mês, com a média dos 3 meses anteriores.
//
// Cada achado carrega o DELTA em R$ (valor do mês − média dos 3 meses
// anteriores) além da variação %. É o delta que diz se a anomalia
// importa: uma conta de média R$ 93 que foi para R$ 500 varia +438%,
// mas move R$ 407 — ruído. O filtro "impacto mínimo" da tela usa
// exatamente este campo.
//
// opcoes.porFechamento = compara valor POR FECHAMENTO (valor do mês ÷
// nº de sextas-feiras do mês), para não acusar anomalia num mês de 5
// fechamentos comparado a meses de 4.
// ═══════════════════════════════════════════════════════════════════
export function detectarAnomaliasTodasLinhas(dreNodes, overrides, limiarPct, opcoes = {}) {
  const { porFechamento = false } = opcoes;
  const achados = [];

  const normalizar = (valor, mes) => {
    if (typeof valor !== "number" || Number.isNaN(valor)) return null;
    if (!porFechamento) return valor;
    const f = fechamentosNoMes(mes);
    return f ? valor / f : null;
  };

  for (const node of dreNodes) {
    for (let i = 0; i < MESES.length; i++) {
      if (i < 3) continue; // precisa de 3 meses anteriores pra comparar
      const mes = MESES[i];
      const anteriores = MESES.slice(i - 3, i).map((m) => normalizar(getValorNode(node, m, overrides), m));
      const valido = anteriores.every((v) => typeof v === "number" && !Number.isNaN(v));
      if (!valido) continue;
      const valorAtual = normalizar(getValorNode(node, mes, overrides), mes);
      if (typeof valorAtual !== "number") continue;
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      if (media === 0) continue;
      const delta = valorAtual - media;
      const variacaoPct = round2((delta / Math.abs(media)) * 100);
      const absVar = Math.abs(variacaoPct);
      if (absVar <= limiarPct) continue;
      achados.push({
        mes, row: node.row, label: node.label, isTotal: node.level === 0,
        valor: round2(valorAtual), media: round2(media), delta: round2(delta), variacaoPct,
        porFechamento,
        nivel: absVar > limiarPct * 2 ? "critico" : "atencao",
      });
    }
  }
  return achados.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
