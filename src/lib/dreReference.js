// ═══════════════════════════════════════════════════════════════════
// REFERÊNCIA DA DRE — ARQUITETURA DINÂMICA (04/10/2026)
//
// MUDANÇA DE ARQUITETURA — leia antes de mexer neste arquivo
// ───────────────────────────────────────────────────────────────────
// Até 03/10, a DRE inteira (as ~180 contas contábeis + meses) era um
// arquivo estático (dreNodes.js) que eu regenerava manualmente toda
// vez que alguém me mandava a planilha-mestra atualizada. Isso mudou:
// descobrimos a função nativa do Winthor que gera a Rotina 2122 por
// dentro (PKG_DRECONTABIL.FNC_RETORNADADOS), e o script Python
// (integracao_winthor.py) já grava o resultado dela no Supabase, na
// mesma rotina ("2122-dre-contabil") que o resto do sistema usa.
//
// Este arquivo agora MONTA a DRE em tempo real a partir desses dois
// ingredientes:
//   1. SEED  — o que já tínhamos (dreNodes.js + os valores abaixo em
//      REF_SEED/OFICIAL_SEED), usado como PONTO DE PARTIDA e como
//      FALLBACK pros meses que o script ainda não alimentou no banco.
//   2. AO VIVO — o que o historico["2122-dre-contabil"] trouxer do
//      Supabase, mês a mês. Quando existe, ele GANHA do seed (os
//      números batem exatos contra a planilha-mestra, validado em
//      03/10/2026 — ver `construirDreNodesEfetivo`).
//
// Isso significa que, a partir do momento em que o script Python
// rodar pra um mês novo, esse mês aparece no sistema SEM eu precisar
// editar este arquivo — é esse o objetivo de toda essa mudança.
//
// O QUE AINDA NÃO VEM DO BANCO (fica no SEED, documentado abaixo):
//   - Easy Consultoria, NF Baixa Bacuri, Notas Técnicas, e as 3 linhas
//     de Descontos Concedidos por competência (2025/2026/porComp) —
//     são ajustes do bloco GERENCIAL, que a função do Winthor que
//     automatizamos NÃO cobre (ela só gera o bloco CONTÁBIL, até
//     "Resultado Líquido do Exercício"). Fica como pendência.
//   - Faturamento Gerencial — vem de uma tabela diferente
//     (FP_VENDA_LIQ), que o script já consulta mas ainda só usa pra
//     VALIDAÇÃO, não grava no Supabase. Também fica pendência.
//
// IMPORTANTE — fórmula do bloco gerencial confirmada com a
// contabilidade em 20/08 e 18/09 (isso não mudou):
//   Lucro Operacional Gerencial = Lucro Operacional Contábil (ANTES
//     das subvenções) + ajustes gerenciais
//   Lucro com Subvenções = Resultado Líquido do Exercício (DEPOIS das
//     subvenções) + OS MESMOS ajustes gerenciais
//   Lucratividade Gerencial usa RECEITA BRUTA como base (não
//     Faturamento Gerencial, diferente das outras duas lucratividades
//     — confirmado direto na fórmula da planilha, célula D218=D217/D4).
// ═══════════════════════════════════════════════════════════════════

import { fechamentosNoMes } from "./fechamentos.js";
import { DRE_NODES as DRE_NODES_SEED } from "./dreNodes.js";

// Reexportado de propósito: `dreNodes === DRE_NODES_SEED` (igualdade de
// referência) é como outros arquivos detectam se a numeração de linha
// ainda é a "legada" (estável, a mesma de sempre) ou se já é a
// numeração sintética da montagem dinâmica — ver uso em
// AnaliseTrimestral.jsx, que depende de números de linha fixos vindos
// de dre2025Reference.js e ainda não foi adaptado pra numeração dinâmica.
export { DRE_NODES_SEED };

export const MESES_SEED = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

// Rótulo de qualquer mês de 2026 — não precisa editar isso quando um
// mês novo chegar (Setembro já funciona, mesmo sem estar no MESES_SEED).
const NOME_MES = { "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez" };
export const MESES_LABEL = new Proxy({}, { get: (_, mes) => NOME_MES[String(mes).slice(-2)] || mes });

// ═══════════════════════════════════════════════════════════════════
// SEED — valores de referência manuais (Jan-Ago/2026), usados só como
// PONTO DE PARTIDA/FALLBACK enquanto o Supabase não tem dado ao vivo
// pra um mês. À medida que o script Python for alimentando mais
// meses, esses números vão sendo cada vez menos necessários.
// ═══════════════════════════════════════════════════════════════════
export const REF_SEED = {
  easy: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0, "2026-08": 0 },
  nfBaixaBacuri: { "2026-01": 0, "2026-02": 0, "2026-03": 0, "2026-04": 0, "2026-05": 0, "2026-06": 0, "2026-07": 0, "2026-08": 0 },
  // "NF Posto" foi renomeado para "Notas Técnicas" pela contabilidade em Agosto — mesmo conceito, mesmo tratamento.
  nfPosto: { "2026-01": 238300.64, "2026-02": 222731.45, "2026-03": 502353.24, "2026-04": 10441.52, "2026-05": 292894.06, "2026-06": 443041.87, "2026-07": 313540.55, "2026-08": 489669.06 },
  descontosConcedidos2025: { "2026-01": 263125.49, "2026-02": 203347.5, "2026-03": 25679.96, "2026-04": 6815.49, "2026-05": 894981.67, "2026-06": 85142.5, "2026-07": 93180.61, "2026-08": 0 },
  descontosConcedidos2026: { "2026-01": 0, "2026-02": 70268.74, "2026-03": 173602.86, "2026-04": 202584.31, "2026-05": 158990.86, "2026-06": 654669.59, "2026-07": 385773.8, "2026-08": 591361.61 },
  descontosConcedidosPorComp: { "2026-01": -563700.53, "2026-02": -348711.08, "2026-03": -213988.62, "2026-04": -302994.55, "2026-05": -186143.44, "2026-06": -30351.94, "2026-07": 0, "2026-08": 0 },
  faturamentoGerencial: { "2026-01": 7608270.97, "2026-02": 6916992.49, "2026-03": 6844337.6, "2026-04": 8418031.28, "2026-05": 7743298.09, "2026-06": 7608805.05, "2026-07": 9493705.12, "2026-08": 8824364.91 },
  // Mantidos só como fallback de depreciação e Descontos Concedidos
  // PARA MESES SEM DADO AO VIVO ainda — uma vez que o mês tenha dado
  // em historico["2122-dre-contabil"], esses dois são recalculados
  // dinamicamente a partir de lá (ver `resolverDepreciacao`/`resolverDescontosConcedidos`).
  depreciacao: { "2026-01": 335595.53, "2026-02": 337373.07, "2026-03": 337560.35, "2026-04": 338692.11, "2026-05": 339250.17, "2026-06": 345606.39, "2026-07": 423172.9, "2026-08": 424631.25 },
};

export const OFICIAL_SEED = {
  // Regime de caixa/bruto (decisão de 18/09, pra bater com a linha 199
  // da planilha-mestra) — usado só quando não há import ao vivo do
  // 2107 NEM dado em historico["2122-dre-contabil"] pro mês.
  "138": { "2026-01": -273381, "2026-02": -287380.58, "2026-03": -224828.93, "2026-04": -209435.8, "2026-05": -1069941.22, "2026-06": -742239.33, "2026-07": -478954.41, "2026-08": -913510.27 },
  "209": { "2026-01": 45245.33, "2026-02": 189013.75, "2026-03": 60284.59, "2026-04": 177610.65, "2026-05": 69295.56, "2026-06": 74273.3, "2026-07": 1141852.26, "2026-08": 128378.09 },
  "211": { "2026-01": 256600.1, "2026-02": 261185.82, "2026-03": 279984.39, "2026-04": 314185.9, "2026-05": 313406.26, "2026-06": 354644.82, "2026-07": 415595.63, "2026-08": 394536.71 },
};

function round2(n) { return Math.round(n * 100) / 100; }

// ═══════════════════════════════════════════════════════════════════
// LOCALIZAÇÃO DE LINHAS POR RÓTULO — RESILIENTE A REESTRUTURAÇÃO
// (inalterado desde antes — continua sendo a base de tudo)
// ═══════════════════════════════════════════════════════════════════
export function localizarLinha(dreNodes, { labelExato, contem, nivel } = {}) {
  for (const n of dreNodes) {
    const labelBate = labelExato ? n.label.trim().toUpperCase() === labelExato.toUpperCase()
      : contem ? n.label.toUpperCase().includes(contem.toUpperCase()) : false;
    if (labelBate && (nivel === undefined || n.level === nivel)) return n.row;
  }
  return null;
}

export function getValorNode(node, mes, overrides) {
  if (!node) return undefined;
  const ov = overrides?.[mes]?.[node.row];
  return ov !== undefined ? ov : node.values[mes];
}

// ═══════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM O DADO AO VIVO (historico["2122-dre-contabil"])
//
// O script Python grava, por mês, a lista COMPLETA de linhas que a
// função nativa do Winthor devolveu (memoria_calculo.nos — ver
// `buscar_dre_completa` em integracao_winthor.py). Cada linha tem
// {label, level, valor, codconta_pc, natureza, total}.
//
// Junta isso com o SEED assim:
//   - A ORDEM/HIERARQUIA (que linha vem antes de qual) usa o mês AO
//     VIVO mais recente disponível como "molde" — se não houver
//     nenhum mês ao vivo ainda, usa o SEED inteiro.
//   - Contas de detalhe (têm codconta_pc) são casadas ENTRE MESES pelo
//     próprio codconta_pc — sobrevive a conta mudar de posição.
//   - Linhas de cabeçalho/total (sem codconta_pc) são casadas por
//     RÓTULO exato — mesmo critério usado em todo o resto do sistema.
//   - Pra cada mês, se existir valor ao vivo (historico tem esse mês),
//     ele GANHA do seed. Senão, usa o valor do seed, se existir.
// ═══════════════════════════════════════════════════════════════════
export function construirDreNodesEfetivo(historicoDreContabil) {
  const mesesAoVivo = Object.keys(historicoDreContabil || {})
    .filter((mes) => Array.isArray(historicoDreContabil[mes]?.extra?.nos))
    .sort();

  if (mesesAoVivo.length === 0) {
    // Nenhum dado ao vivo ainda — comportamento idêntico ao sistema anterior.
    return DRE_NODES_SEED;
  }

  // Molde: o mês ao vivo mais recente dá a ordem/hierarquia/rótulos do
  // bloco CONTÁBIL. O bloco GERENCIAL (linha ~200 em diante) não existe
  // na função nativa que automatizamos — PKG_DRECONTABIL só cobre até
  // "Resultado Líquido do Exercício" — então ele SEMPRE vem do seed,
  // em todos os cenários, concatenado depois do bloco contábil ao vivo.
  const mesMolde = mesesAoVivo[mesesAoVivo.length - 1];
  const nosMolde = historicoDreContabil[mesMolde].extra.nos;
  const blocoGerencialSeed = DRE_NODES_SEED.filter((n) => n.row >= 200);

  const efetivoContabil = nosMolde.map((n, i) => ({
    row: i + 1, // posição sintética — só precisa ser única e estável dentro desta montagem
    level: n.level,
    label: n.label,
    conta: n.codconta_pc || null,
    total: Boolean(n.total),
    values: {},
  }));
  const efetivoGerencial = blocoGerencialSeed.map((n, i) => ({ ...n, row: efetivoContabil.length + i + 1, values: { ...n.values } }));
  const efetivo = [...efetivoContabil, ...efetivoGerencial];

  // Índices auxiliares pra casar linha de mês antigo -> linha do molde
  const porCodconta = {};
  const porLabel = {};
  efetivo.forEach((n) => {
    if (n.conta) porCodconta[n.conta] = n;
    if (!porCodconta[n.conta]) porLabel[n.label.trim().toUpperCase()] = n;
  });

  for (const mes of mesesAoVivo) {
    for (const n of historicoDreContabil[mes].extra.nos) {
      const alvo = (n.codconta_pc && porCodconta[n.codconta_pc]) || porLabel[n.label.trim().toUpperCase()];
      if (alvo) alvo.values[mes] = round2(n.valor || 0);
    }
  }

  // Preenche com o SEED os meses que ainda não têm dado ao vivo, e
  // qualquer linha do molde que por acaso não exista no seed (conta
  // nova) simplesmente fica sem valor nesses meses antigos — correto,
  // já que ela realmente não existia antes.
  for (const seedNode of DRE_NODES_SEED) {
    const alvo = (seedNode.conta && porCodconta[seedNode.conta]) || porLabel[seedNode.label.trim().toUpperCase()];
    if (!alvo) continue;
    for (const mes of Object.keys(seedNode.values)) {
      if (alvo.values[mes] === undefined) alvo.values[mes] = seedNode.values[mes];
    }
  }

  return efetivo;
}

export function construirMesesEfetivo(historicoDreContabil) {
  const mesesAoVivo = Object.keys(historicoDreContabil || {}).filter((mes) => Array.isArray(historicoDreContabil[mes]?.extra?.nos));
  const todos = new Set([...MESES_SEED, ...mesesAoVivo]);
  return [...todos].sort();
}

/**
 * Descontos Concedidos (regime bruto/caixa) e Depreciação, lidos
 * direto da DRE ao vivo quando existir pro mês — senão cai pro SEED.
 * Validado em 03/10/2026: os dois batem exato contra a planilha-mestra
 * quando a fonte ao vivo está disponível.
 */
function resolverDescontosConcedidos(dreNodes, mes) {
  const row = localizarLinha(dreNodes, { labelExato: "DESCONTOS CONCEDIDOS", nivel: 2 });
  const valor = row ? dreNodes.find((n) => n.row === row)?.values[mes] : undefined;
  return valor !== undefined ? valor : OFICIAL_SEED["138"][mes] ?? 0;
}
function resolverDepreciacao(dreNodes, mes) {
  const row = localizarLinha(dreNodes, { contem: "DEPRECIAÇÃO E AMORTIZAÇÃO", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "DEPRECIACAO E AMORTIZACAO", nivel: 2 });
  const valor = row ? dreNodes.find((n) => n.row === row)?.values[mes] : undefined;
  // a conta aparece como despesa (negativa); o ajuste gerencial soma o valor absoluto de volta.
  return valor !== undefined ? Math.abs(valor) : REF_SEED.depreciacao[mes] ?? 0;
}

/**
 * Monta a DRE completa de um mês. `dreNodes` é o resultado de
 * `construirDreNodesEfetivo` — todo o bloco contábil (Receita Bruta,
 * Deduções, Receita Líquida, CPV, Lucro Bruto, Despesas Operacionais,
 * Lucro Operacional, Receitas Não Operacionais, Resultado antes
 * CSLL/IRPJ, Resultado Líquido) é LIDO DIRETO da DRE ao vivo quando
 * disponível — só a linha 138 precisa de ajuste manual (porque o
 * valor ao vivo do próprio banco é bruto/caixa; se tiver IMPORT AO VIVO
 * do 2107 — regime de competência, feito pela tela — ele substitui
 * esse bruto e a conta é recalculada a partir daí).
 */
export function montarDreDoMes(mes, dreNodes, { linha138, linha209, linha211 } = {}) {
  const buscar = (criterio) => {
    const row = localizarLinha(dreNodes, criterio);
    return row ? dreNodes.find((n) => n.row === row)?.values[mes] : undefined;
  };

  const receitaBruta = buscar({ contem: "RECEITA DOS PRODUTOS VENDIDOS", nivel: 0 }) ?? 0;
  const deducoes = buscar({ contem: "DEDUÇÕES DA RECEITA", nivel: 0 }) ?? buscar({ contem: "DEDUCOES DA RECEITA", nivel: 0 }) ?? 0;
  const receitaLiquida = round2(receitaBruta + deducoes);
  const cpv = buscar({ contem: "CUSTO DOS PRODUTOS VENDIDOS", nivel: 0 }) ?? 0;
  const lucroBruto = round2(receitaLiquida + cpv);

  const despesasOperacionaisTotal = buscar({ labelExato: "(-) DESPESAS OPERACIONAIS" }) ?? 0;
  const descontosConcedidosBruto = resolverDescontosConcedidos(dreNodes, mes);
  const l138 = linha138 ?? descontosConcedidosBruto;
  // Remove o valor bruto que já está embutido no total, e soma o valor
  // em vigor (ao vivo competência, ou o mesmo bruto se não houver import).
  const despesasOperacionais = round2(despesasOperacionaisTotal - descontosConcedidosBruto + l138);

  const receitasOperacionais = buscar({ contem: "RECEITAS OPERACIONAIS", nivel: 0 }) ?? 0;
  const lucroOperacionalContabil = round2(lucroBruto + despesasOperacionais + receitasOperacionais);
  const receitasNaoOperacionais = buscar({ contem: "RECEITAS NÃO OPERACIONAIS", nivel: 0 }) ?? buscar({ contem: "RECEITAS NAO OPERACIONAIS", nivel: 0 }) ?? 0;
  const resultadoAntesCsll = round2(lucroOperacionalContabil + receitasNaoOperacionais);
  const provisaoCsll = buscar({ contem: "PROVISÃO PARA CSLL", nivel: 0 }) ?? buscar({ contem: "PROVISAO PARA CSLL", nivel: 0 }) ?? 0;
  const resultadoLiquido = round2(resultadoAntesCsll + provisaoCsll);

  const l209 = linha209 ?? OFICIAL_SEED["209"][mes] ?? 0;
  const l211 = linha211 ?? OFICIAL_SEED["211"][mes] ?? 0;
  const depreciacao = resolverDepreciacao(dreNodes, mes);
  const easy = REF_SEED.easy[mes] ?? 0, nfBaixaBacuri = REF_SEED.nfBaixaBacuri[mes] ?? 0, nfPosto = REF_SEED.nfPosto[mes] ?? 0;
  const descontos2025 = REF_SEED.descontosConcedidos2025[mes] || 0;
  const descontos2026 = REF_SEED.descontosConcedidos2026[mes] || 0;
  const descontosPorComp = REF_SEED.descontosConcedidosPorComp[mes] || 0;
  const ajustesGerenciais = round2(depreciacao + easy + nfBaixaBacuri + l209 + nfPosto - l211 + descontos2025 + descontos2026 + descontosPorComp);
  const lucroOperacionalGerencial = round2(lucroOperacionalContabil + ajustesGerenciais);
  const lucroComSubvencoes = round2(resultadoLiquido + ajustesGerenciais);

  const faturamentoGerencial = REF_SEED.faturamentoGerencial[mes];
  const lucratividadeContabil = faturamentoGerencial ? round2((lucroOperacionalContabil / faturamentoGerencial) * 10000) / 100 : null;
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
// MÓDULO — RECEITA x LUCRO x CARGA TRIBUTÁRIA
// ═══════════════════════════════════════════════════════════════════
export function calcularCargaTributaria(mes, dreNodes, overrides) {
  const porRow = {};
  for (const n of dreNodes) porRow[n.row] = n;

  const rowReceitaBruta = localizarLinha(dreNodes, { contem: "RECEITA DOS PRODUTOS VENDIDOS", nivel: 0 });
  const rowIcms = localizarLinha(dreNodes, { labelExato: "ICMS S/VENDA", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "ICMS S/VENDA" });
  const rowPis = localizarLinha(dreNodes, { labelExato: "PIS", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "PIS" });
  const rowCofins = localizarLinha(dreNodes, { labelExato: "COFINS", nivel: 2 }) ?? localizarLinha(dreNodes, { contem: "COFINS" });
  const rowDespTrib = localizarLinha(dreNodes, { contem: "DESPESAS TRIBUTARIAS", nivel: 1 }) ?? localizarLinha(dreNodes, { contem: "DESPESAS TRIBUTÁRIAS", nivel: 1 });
  const rowProvisao = localizarLinha(dreNodes, { contem: "PROVISÃO PARA CSLL", nivel: 0 }) ?? localizarLinha(dreNodes, { contem: "PROVISAO PARA CSLL", nivel: 0 });

  const linhasImposto = [rowIcms, rowPis, rowCofins, rowDespTrib, rowProvisao].filter((r) => r !== null);
  const receita = getValorNode(porRow[rowReceitaBruta], mes, overrides);
  const impostos = linhasImposto.reduce((s, row) => s + Math.abs(getValorNode(porRow[row], mes, overrides) || 0), 0);
  const dre = montarDreDoMes(mes, dreNodes, {
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
// ANOMALIAS EM TODAS AS LINHAS DA DRE
// (lógica inalterada — só passou a receber `meses` como parâmetro em
// vez de usar a constante estática MESES, já que agora a lista de
// meses é dinâmica)
// ═══════════════════════════════════════════════════════════════════
export function detectarAnomaliasTodasLinhas(dreNodes, overrides, limiarPct, meses, opcoes = {}) {
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
    for (let i = 0; i < meses.length; i++) {
      if (i < 3) continue;
      const mes = meses[i];
      const anteriores = meses.slice(i - 3, i).map((m) => normalizar(getValorNode(node, m, overrides), m));
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
