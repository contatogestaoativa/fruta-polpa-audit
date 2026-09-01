// ═══════════════════════════════════════════════════════════════════
// RESUMO DE RESULTADO MENSAL (demanda Gerson, 01/09/2026)
//
// Compara o mês selecionado contra a DRE MÉDIA do ano e explica, conta
// por conta, por que as linhas de resultado ficaram acima ou abaixo
// dessa média.
//
// JANELA DA MÉDIA — regra combinada:
//   · janela móvel dos meses já fechados, travada em no máximo 12
//   · "incluir o mês analisado" é opção da tela (padrão: incluir)
//     - com 7 meses fechados e Jul selecionado, incluindo: média de 7
//     - com 9 meses fechados e Set selecionado, excluindo: média de 8
//     - a partir de 12 fechados: sempre os últimos 12
//
// LINHAS DE RESULTADO acompanhadas (definidas pelo Gerson):
//   58  Lucro Bruto (R$) — a "margem"; também exposto como % da receita
//   204 Lucratividade Contábil (%)
//   214 Lucratividade Gerencial (%)
//   219 Lucratividade com as Subvenções (%)
//
// Regra de ouro: linha de % NUNCA é somada nem tirada média direto.
// A média de uma linha de % é sempre lucro acumulado ÷ faturamento
// acumulado da janela.
// ═══════════════════════════════════════════════════════════════════

import { getValorNode, REF } from "./dreReference.js";
import { fechamentosNoMes, fechamentosNoPeriodo } from "./fechamentos.js";

export const LINHAS_RESULTADO = [58, 204, 214, 219];
export const MAX_JANELA = 12;

const PCT_ROWS = new Set([204, 214, 219]);
// linha de % -> linha em R$ que a origina (p/ recalcular a média corretamente)
const PCT_PARA_LINHA_MONEY = { 204: 203, 214: 213, 219: 218 };

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Meses que entram na média de referência do mês analisado.
 * @param {string[]} mesesFechados  todos os meses fechados, em ordem
 * @param {string} mesAnalisado
 * @param {{incluirMesAnalisado?: boolean, maxMeses?: number}} opcoes
 */
export function janelaDeReferencia(mesesFechados, mesAnalisado, opcoes = {}) {
  const { incluirMesAnalisado = true, maxMeses = MAX_JANELA } = opcoes;
  const i = mesesFechados.indexOf(mesAnalisado);
  if (i < 0) return [];
  const ate = incluirMesAnalisado ? i + 1 : i;
  return mesesFechados.slice(0, ate).slice(-maxMeses);
}

/** Soma de uma linha ao longo de uma lista de meses (ignora não-números). */
function somaBruta(node, meses, overrides) {
  return meses.reduce((s, m) => {
    const v = getValorNode(node, m, overrides);
    return s + (typeof v === "number" && !Number.isNaN(v) ? v : 0);
  }, 0);
}

/**
 * Valor médio de uma linha na janela.
 * Linha de % é recalculada (soma do lucro ÷ soma do faturamento);
 * linha em R$ é média aritmética simples.
 */
export function mediaDaLinha(node, janela, overrides, porRow) {
  if (!janela.length) return null;
  if (PCT_ROWS.has(node.row)) {
    const moneyRow = porRow[PCT_PARA_LINHA_MONEY[node.row]];
    const fat = janela.reduce((s, m) => s + (REF.faturamentoGerencial[m] || 0), 0);
    if (!moneyRow || !fat) return null;
    return somaBruta(moneyRow, janela, overrides) / fat;
  }
  return somaBruta(node, janela, overrides) / janela.length;
}

// ═══════════════════════════════════════════════════════════════════
// ANÁLISE VERTICAL (% sobre a base)
// Regra do Gerson, 01/09/2026: linha de custo e despesa NUNCA se compara
// só em R$. CPV de R$ 3,58 mi sobre receita de R$ 9,7 mi não é
// comparável a CPV de R$ 2,6 mi sobre receita de R$ 7,9 mi — em reais
// "estourou", em percentual a conversa é outra. O que diz se a operação
// piorou é o percentual, e a diferença entre dois percentuais se
// expressa em PONTOS PERCENTUAIS.
//
// Base, seguindo a mesma regra da aba DRE:
//   linhas < 201  -> Receita dos Produtos Vendidos (linha 4)
//   linhas >= 201 -> Faturamento Gerencial (linha 201)
// ═══════════════════════════════════════════════════════════════════
function linhaBaseDe(row) { return row < 201 ? 4 : 201; }

/** Valor da linha no mês analisado (mesma unidade da média). */
export function valorDoMes(node, mes, overrides) {
  const v = getValorNode(node, mes, overrides);
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/** Uma linha comparada: mês x média, com delta e variação. */
export function compararLinha(node, mes, janela, overrides, porRow) {
  const ehPct = PCT_ROWS.has(node.row);
  const valor = valorDoMes(node, mes, overrides);
  const media = mediaDaLinha(node, janela, overrides, porRow);
  const delta = (valor === null || media === null) ? null : valor - media;
  const deltaPct = (delta === null || !media) ? null : delta / Math.abs(media);

  // ── percentual sobre a base (não se aplica a linhas que já são %) ──
  let pctMes = null, pctMedia = null, deltaPP = null;
  if (!ehPct) {
    const base = porRow[linhaBaseDe(node.row)];
    if (base) {
      const baseMes = valorDoMes(base, mes, overrides);
      if (baseMes) pctMes = valor / baseMes;
      const baseJanela = somaBruta(base, janela, overrides);
      if (baseJanela) pctMedia = somaBruta(node, janela, overrides) / baseJanela;
      if (pctMes !== null && pctMedia !== null) deltaPP = pctMes - pctMedia;
    }
  }

  return {
    row: node.row, label: node.label, conta: node.conta, level: node.level,
    ehPct, valor, media,
    delta: delta === null ? null : (ehPct ? delta : round2(delta)),
    deltaPct,
    // percentual da linha sobre a receita (ou sobre o faturamento
    // gerencial, no bloco gerencial), e a diferença em pontos percentuais
    pctMes, pctMedia, deltaPP,
    atingiu: delta === null ? null : delta >= 0,
  };
}

/**
 * Margem bruta em % (linha 58 ÷ Receita dos Produtos Vendidos, linha 4).
 * O Gerson chama a 58 de "margem" — aqui ela aparece nas duas leituras.
 */
export function margemBruta(mes, janela, overrides, porRow) {
  const l58 = porRow[58], l4 = porRow[4];
  if (!l58 || !l4) return { mes: null, media: null, deltaPP: null };
  const receitaMes = valorDoMes(l4, mes, overrides);
  const lucroMes = valorDoMes(l58, mes, overrides);
  const pctMes = receitaMes ? lucroMes / receitaMes : null;

  const receitaJanela = somaBruta(l4, janela, overrides);
  const lucroJanela = somaBruta(l58, janela, overrides);
  const pctMedia = receitaJanela ? lucroJanela / receitaJanela : null;

  return {
    mes: pctMes, media: pctMedia,
    deltaPP: (pctMes === null || pctMedia === null) ? null : pctMes - pctMedia,
  };
}

/** Uma linha é folha da árvore quando o próximo nó não é filho dela. */
function ehFolha(nodes, i) {
  const proximo = nodes[i + 1];
  return !proximo || proximo.level <= nodes[i].level;
}

/**
 * Resumo completo do mês. Devolve tudo já calculado — a IA só narra,
 * nunca inventa número.
 */
export function calcularResumoDoMes({ dreNodes, mes, mesesFechados, overrides, incluirMesAnalisado = true, topN = 15 }) {
  const porRow = Object.fromEntries(dreNodes.map((n) => [n.row, n]));
  const janela = janelaDeReferencia(mesesFechados, mes, { incluirMesAnalisado });

  const resultado = LINHAS_RESULTADO
    .map((row) => porRow[row])
    .filter(Boolean)
    .map((node) => compararLinha(node, mes, janela, overrides, porRow));

  // Todas as linhas comparadas (alimenta a tabela hierárquica da tela)
  const todas = dreNodes.map((node) => compararLinha(node, mes, janela, overrides, porRow));
  const porRowComparada = Object.fromEntries(todas.map((c) => [c.row, c]));

  // Contas analíticas que mais afastaram o mês da média
  const explicacoes = dreNodes
    .filter((n, i) => !PCT_ROWS.has(n.row) && !n.total && ehFolha(dreNodes, i))
    .map((node) => compararLinha(node, mes, janela, overrides, porRow))
    .filter((c) => c.delta !== null && Math.abs(c.delta) > 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN);

  return {
    mes,
    janela,
    mesesNaJanela: janela.length,
    incluirMesAnalisado,
    fechamentosDoMes: fechamentosNoMes(mes),
    fechamentosDaJanela: fechamentosNoPeriodo(janela),
    mediaFechamentos: janela.length ? round2(fechamentosNoPeriodo(janela) / janela.length) : null,
    resultado,
    margemBruta: margemBruta(mes, janela, overrides, porRow),
    todas,
    porRow: porRowComparada,
    explicacoes,
  };
}

/**
 * Payload enxuto pra mandar pra Netlify Function. Só os números que a
 * narrativa precisa — não vai a DRE inteira nem nada identificável além
 * do que já está no sistema.
 */
export function montarPayloadIA(resumo, mesesLabel) {
  const fmtLinha = (c) => ({
    linha: c.row,
    conta: c.label,
    codigo: c.conta || null,
    unidade: c.ehPct ? "percentual" : "reais",
    valorMes: c.valor,
    media: c.media,
    diferenca: c.delta,
    variacaoPct: c.deltaPct,
    // Análise vertical: é ESTA leitura que diz se a operação piorou,
    // porque neutraliza a diferença de volume entre os meses.
    ...(c.ehPct ? {} : {
      percentualSobreReceitaNoMes: c.pctMes,
      percentualSobreReceitaNaMedia: c.pctMedia,
      diferencaEmPontosPercentuais: c.deltaPP,
    }),
  });

  return {
    mes: mesesLabel[resumo.mes] || resumo.mes,
    mesChave: resumo.mes,
    janela: {
      meses: resumo.janela.map((m) => mesesLabel[m] || m),
      quantidade: resumo.mesesNaJanela,
      incluiOMesAnalisado: resumo.incluirMesAnalisado,
    },
    fechamentos: {
      doMes: resumo.fechamentosDoMes,
      mediaDaJanela: resumo.mediaFechamentos,
    },
    linhasDeResultado: resumo.resultado.map(fmtLinha),
    margemBruta: {
      unidade: "percentual",
      valorMes: resumo.margemBruta.mes,
      media: resumo.margemBruta.media,
      diferencaEmPontosPercentuais: resumo.margemBruta.deltaPP,
    },
    contasQueExplicam: resumo.explicacoes.map(fmtLinha),
    comoLerEstesNumeros:
      "Toda conta de custo e despesa traz percentualSobreReceitaNoMes e percentualSobreReceitaNaMedia. " +
      "Comparar essas duas é o que diz se a operação piorou; a diferença entre elas está em " +
      "diferencaEmPontosPercentuais. A diferença em reais mistura variação de volume com variação de " +
      "eficiência e sozinha engana.",
  };
}
