// ═══════════════════════════════════════════════════════════════════
// REFERÊNCIA DA DRE — valores já validados na auditoria manual
// (13-20/08/2026), usados para as linhas que ainda não têm import
// automatizado. As linhas 138/209/211 (identificadores internos
// estáveis — ver LINHA_POR_ROTINA em App.jsx) são substituídas pelo
// valor AO VIVO assim que o usuário importa o arquivo correspondente.
//
// IMPORTANTE — fórmula real confirmada com a contabilidade em 20/08:
//   Lucro Operacional Gerencial = Lucro Operacional Contábil (ANTES
//     das subvenções) + ajustes gerenciais (206-211)
//   Lucro com Subvenções = Resultado Líquido do Exercício (DEPOIS das
//     subvenções, já embutidas via "receitas não operacionais") +
//     OS MESMOS ajustes gerenciais (206-211)
// As subvenções NÃO são somadas duas vezes — um bug real que
// encontramos e corrigimos ao validar contra os totais oficiais.
//
// ATUALIZADO EM 17/09 — extensão até Agosto/2026, extraída da planilha
// "HISTÓRICO DA LUCRATIVIDADE JAN-AGO/2026". Nessa atualização a
// contabilidade reestruturou o bloco gerencial (renomeou "NF Posto"
// para "Notas Técnicas" — mesmo conceito — e acrescentou 3 linhas de
// detalhamento de Descontos Concedidos por competência, que NÃO
// entram na nossa fórmula: continuamos usando nosso próprio cálculo,
// já validado, dessa linha). Confirmado com a contabilidade em 17/09.
// ═══════════════════════════════════════════════════════════════════

import { fechamentosNoMes } from "./fechamentos.js";

export const MESES = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
export const MESES_LABEL = { "2026-01": "Jan", "2026-02": "Fev", "2026-03": "Mar", "2026-04": "Abr", "2026-05": "Mai", "2026-06": "Jun", "2026-07": "Jul", "2026-08": "Ago" };

export const REF = {
  receitaBruta: { "2026-01": 7904400.74, "2026-02": 7297232.28, "2026-03": 7154918.26, "2026-04": 8633209.77, "2026-05": 7967609.43, "2026-06": 7707628.74, "2026-07": 9726621.31, "2026-08": 9201595.38 },
  deducoes: { "2026-01": -1419532.23, "2026-02": -1402650.96, "2026-03": -1330155.35, "2026-04": -1410859.16, "2026-05": -1339725.66, "2026-06": -1223006.79, "2026-07": -1639411.54, "2026-08": -1685009.19 },
  cpv: { "2026-01": -3583295.78, "2026-02": -3838861.73, "2026-03": -4523536.46, "2026-04": -4321713.22, "2026-05": -4501657.87, "2026-06": -4759382.33, "2026-07": -5425390.46, "2026-08": -5481673.35 },
  // Despesas operacionais JÁ SEM o efeito da linha 138 (isolada p/ recompor ao vivo)
  despesasOperacionaisSemLinha138: { "2026-01": -1720353.8, "2026-02": -1526158.53, "2026-03": -1634101.65, "2026-04": -1629896.66, "2026-05": -1656194.76, "2026-06": -2003574.57, "2026-07": -3170158.56, "2026-08": -2066982.56 },
  receitasOperacionais: { "2026-01": 168375.42, "2026-02": 158892.62, "2026-03": 216505.43, "2026-04": 187517.58, "2026-05": 183154.04, "2026-06": 165766.94, "2026-07": 160387.71, "2026-08": 154663.47 },
  receitasNaoOperacionais: { "2026-01": 969668.91, "2026-02": 861257.9, "2026-03": 1069435.33, "2026-04": 1020285.44, "2026-05": 861219.93, "2026-06": 830522.47, "2026-07": 1115493.93, "2026-08": 1032109.67 },
  provisaoCsllIrpj: { "2026-01": 0, "2026-02": 0, "2026-03": -385828.45, "2026-04": 0, "2026-05": 0, "2026-06": -5670.37, "2026-07": 0, "2026-08": 0 },
  depreciacao: { "2026-01": 335595.53, "2026-02": 337373.07, "2026-03": 337560.35, "2026-04": 338692.11, "2026-05": 339250.17, "2026-06": 345606.39, "2026-07": 423172.9, "2026-08": 424631.25 },
  easy: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0, "2026-08": 0 },
  nfBaixaBacuri: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0, "2026-08": 0 },
  // "NF Posto" foi renomeado para "Notas Técnicas" pela contabilidade em Agosto — mesmo conceito, mesmo tratamento.
  nfPosto: { "2026-01": 238300.64, "2026-02": 222731.45, "2026-03": 502353.24, "2026-04": 10441.52, "2026-05": 292894.06, "2026-06": 443041.87, "2026-07": 313540.55, "2026-08": 489669.06 },
  // 3 linhas novas do bloco gerencial (confirmado na fórmula real da
  // planilha-mestra, linha 217: soma D208+D209+D210 junto com os
  // demais ajustes). Reatribuem a linha 138, no nível gerencial, de
  // volta pro regime de competência — necessário porque, desde a
  // decisão de 18/09, o bloco CONTÁBIL passou a usar caixa/bruto puro
  // (pra bater com a linha 199), então essa correção só pode entrar
  // aqui, no gerencial. Os 3 valores já vêm com o sinal certo — somam
  // direto, sem inverter nada (igual aos demais ajustes desta lista).
  descontosConcedidos2025: { "2026-01": 263125.49, "2026-02": 203347.5, "2026-03": 25679.96, "2026-04": 6815.49, "2026-05": 894981.67, "2026-06": 85142.5, "2026-07": 93180.61, "2026-08": 0 },
  descontosConcedidos2026: { "2026-01": 0, "2026-02": 70268.74, "2026-03": 173602.86, "2026-04": 202584.31, "2026-05": 158990.86, "2026-06": 654669.59, "2026-07": 385773.8, "2026-08": 591361.61 },
  descontosConcedidosPorComp: { "2026-01": -563700.53, "2026-02": -348711.08, "2026-03": -213988.62, "2026-04": -302994.55, "2026-05": -186143.44, "2026-06": -30351.94, "2026-07": 0, "2026-08": 0 },
  faturamentoGerencial: { "2026-01": 7608270.97, "2026-02": 6916992.49, "2026-03": 6844337.6, "2026-04": 8418031.28, "2026-05": 7743298.09, "2026-06": 7608805.05, "2026-07": 9493705.12, "2026-08": 8824364.91 },
};

// Só existe para os meses com auditoria manual concluída (Jan-Jul). A
// partir de Agosto, essas 3 linhas dependem inteiramente do import ao
// vivo (2107 / 750-222 / 124-750+caixa10) — sem import, valem 0 (ver
// função `valorOficialOuZero`), nunca undefined/NaN.
export const OFICIAL = {
  // Decisão confirmada com a contabilidade em 18/09: a referência da
  // linha 138 (quando não há import ao vivo) usa o valor BRUTO/CAIXA
  // — o mesmo que a planilha-mestra usa na linha 199 (Resultado
  // Líquido do Exercício) — não o ajustado por competência. Isso faz
  // o sistema bater exato com a linha 199 em todos os meses. O import
  // ao vivo do 2107, quando feito, continua respeitando o toggle de
  // regime (Competência / Competência Completa / Caixa) normalmente —
  // essa mudança só afeta o valor de referência usado ANTES de haver
  // import ao vivo.
  "138": { "2026-01": -273381, "2026-02": -287380.58, "2026-03": -224828.93, "2026-04": -209435.8, "2026-05": -1069941.22, "2026-06": -742239.33, "2026-07": -478954.41, "2026-08": -913510.27 },
  "209": { "2026-01": 45245.33, "2026-02": 189013.75, "2026-03": 60284.59, "2026-04": 177610.65, "2026-05": 69295.56, "2026-06": 74273.3, "2026-07": 1141852.26, "2026-08": 128378.09 },
  "211": { "2026-01": 256600.1, "2026-02": 261185.82, "2026-03": 279984.39, "2026-04": 314185.9, "2026-05": 313406.26, "2026-06": 354644.82, "2026-07": 415595.63, "2026-08": 394536.71 },
};

function round2(n) { return Math.round(n * 100) / 100; }
function valorOficialOuZero(chave, mes) { return OFICIAL[chave]?.[mes] ?? 0; }

/**
 * Monta a DRE completa de um mês, usando os valores AO VIVO das linhas
 * 138/209/211 quando fornecidos (senão cai para a referência oficial,
 * ou para 0 se nem isso existir ainda — meses futuros sem nenhum
 * import feito não quebram a tela, só ficam incompletos até o import).
 * Validado célula a célula contra os totais oficiais (213/218) em
 * 20/08/2026 — os 7 meses batem exato.
 */
export function montarDreDoMes(mes, { linha138, linha209, linha211 } = {}) {
  const l138 = linha138 ?? valorOficialOuZero("138", mes);
  const l209 = linha209 ?? valorOficialOuZero("209", mes);
  const l211 = linha211 ?? valorOficialOuZero("211", mes);

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
  // As 3 linhas de "Descontos Concedidos" (2025/2026/por Comp) entram
  // aqui — confirmado direto na fórmula real da planilha-mestra
  // (célula D217: soma D208+D209+D210 junto com os demais ajustes).
  const descontos2025 = REF.descontosConcedidos2025[mes] || 0;
  const descontos2026 = REF.descontosConcedidos2026[mes] || 0;
  const descontosPorComp = REF.descontosConcedidosPorComp[mes] || 0;
  const ajustesGerenciais = round2(depreciacao + easy + nfBaixaBacuri + l209 + nfPosto - l211 + descontos2025 + descontos2026 + descontosPorComp);
  const lucroOperacionalGerencial = round2(lucroOperacionalContabil + ajustesGerenciais);
  const lucroComSubvencoes = round2(resultadoLiquido + ajustesGerenciais);

  const faturamentoGerencial = REF.faturamentoGerencial[mes];
  const lucratividadeContabil = faturamentoGerencial ? round2((lucroOperacionalContabil / faturamentoGerencial) * 10000) / 100 : null;
  // Confirmado na fórmula real da planilha (célula D218: =D217/D4) —
  // a Lucratividade GERENCIAL usa a RECEITA BRUTA como base, não o
  // Faturamento Gerencial (diferente das outras duas lucratividades).
  const lucratividadeGerencial = receitaBruta ? round2((lucroOperacionalGerencial / receitaBruta) * 10000) / 100 : null;
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
// LOCALIZAÇÃO DE LINHAS POR RÓTULO — RESILIENTE A REESTRUTURAÇÃO
// A contabilidade já reordenou a planilha-mestra uma vez (inserção da
// conta "TARIFA" empurrou "Descontos Concedidos" de 138 pra 139, e o
// bloco gerencial inteiro deslocou). Números de linha SOZINHOS não são
// confiáveis como identificador — por isso resolvemos pelo RÓTULO,
// toda vez que a árvore é montada, em vez de depender de um número
// fixo digitado no código.
// ═══════════════════════════════════════════════════════════════════
export function localizarLinha(dreNodes, { labelExato, contem, nivel } = {}) {
  for (const n of dreNodes) {
    const labelBate = labelExato ? n.label.trim().toUpperCase() === labelExato.toUpperCase()
      : contem ? n.label.toUpperCase().includes(contem.toUpperCase()) : false;
    if (labelBate && (nivel === undefined || n.level === nivel)) return n.row;
  }
  return null;
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
// Total de impostos = ICMS s/venda + PIS + COFINS sobre a receita, +
// Despesas Tributárias (já subtotal) + Provisão CSLL/IRPJ (já
// subtotal). Localizados por RÓTULO (ver acima), não por número fixo
// — sobrevive a reestruturação da planilha-mestra.
// ═══════════════════════════════════════════════════════════════════
export function calcularCargaTributaria(mes, dreNodes, overrides) {
  const porRow = {};
  for (const n of dreNodes) porRow[n.row] = n;

  const rowReceitaBruta = localizarLinha(dreNodes, { contem: "RECEITA DOS PRODUTOS VENDIDOS", nivel: 0 });
  const rowIcms = localizarLinha(dreNodes, { labelExato: "ICMS S/VENDA", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "ICMS S/VENDA" });
  const rowPis = localizarLinha(dreNodes, { labelExato: "PIS", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "PIS" });
  const rowCofins = localizarLinha(dreNodes, { labelExato: "COFINS", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "COFINS" });
  const rowDespTrib = localizarLinha(dreNodes, { contem: "DESPESAS TRIBUTARIAS", nivel: 1 }) ?? localizarLinha(dreNodes, { contem: "DESPESAS TRIBUTÁRIAS", nivel: 1 });
  const rowProvisao = localizarLinha(dreNodes, { contem: "PROVISÃO PARA CSLL", nivel: 0 });

  const linhasImposto = [rowIcms, rowPis, rowCofins, rowDespTrib, rowProvisao].filter((r) => r !== null);
  const receita = getValorNode(porRow[rowReceitaBruta], mes, overrides);
  const impostos = linhasImposto.reduce((s, row) => s + Math.abs(getValorNode(porRow[row], mes, overrides) || 0), 0);
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
//
// "secao" = rótulo da seção-mãe (nível 0 mais próximo acima) — usado
// para desambiguar contas com nome igual em seções diferentes (ex:
// "FGTS" existe tanto em Custos c/ Pessoal — produção — quanto em
// Despesas c/ Pessoal — administrativo; são contas reais distintas,
// não duplicidade de dado, só precisavam aparecer com o contexto certo).
// ═══════════════════════════════════════════════════════════════════
export function detectarAnomaliasTodasLinhas(dreNodes, overrides, limiarPct, opcoes = {}) {
  const { porFechamento = false } = opcoes;
  const achados = [];

  let secaoAtual = null;
  const secaoPorRow = {};
  for (const n of dreNodes) {
    if (n.level === 0) secaoAtual = n.label;
    secaoPorRow[n.row] = secaoAtual;
  }

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
        secao: node.level === 0 ? null : secaoPorRow[node.row],
        valor: round2(valorAtual), media: round2(media), delta: round2(delta), variacaoPct,
        porFechamento,
        nivel: absVar > limiarPct * 2 ? "critico" : "atencao",
      });
    }
  }
  return achados.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
