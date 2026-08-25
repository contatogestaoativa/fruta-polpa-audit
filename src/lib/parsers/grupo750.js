import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════
// LINHA 211 — DESPESAS GRUPO 750
// Dois termos, dois graus de automação (confirmado com a contabilidade
// em 19/08/2026):
//
//   TERMO 1 (maior, ~90% do valor, quase sem tratamento manual)
//     Relatório 124, grupo de conta 750 (despesas gerais), direto.
//
//   TERMO 2 (menor, exige curadoria manual mensal)
//     Relatório 124, grupo de conta 538 (ESB) + 750, regime de caixa,
//     filtrado para manter só lançamentos originados do
//     CAIXA TESOURARIA 10, excluindo receitas e aportes financeiros
//     do Sr. Marcelo.
//
// Termo 2 validado 100% contra o extrato real de julho/2026
// ("750 - validação Ingrid 07_2026.xlsx"): R$ 66.004,29.
// ═══════════════════════════════════════════════════════════════════

const CAIXA_TESOURARIA_10 = 10;

// Palavras-chave para excluir receitas/aportes do sócio (regra de negócio
// explícita — ajustar/ampliar lista junto com a contabilidade conforme
// novos casos apareçam).
const HISTORICO_EXCLUIR = [
  "aporte",
  "distribuição de lucro",
  "distribuicao de lucro",
  "aporte financeiro",
];

/**
 * TERMO 1 — direto do Relatório 124, grupo de conta 750.
 * Fonte real: export do 124 já vem com uma linha de SUBTOTAL própria
 * (colunas Filial/Cód.conta/Conta em branco, só o valor preenchido)
 * logo após os lançamentos individuais do grupo 750. Essa linha bate
 * exatamente com o termo usado na DRE em 6 dos 7 meses auditados
 * (jan-jun/2026). Em julho, a contabilidade usou uma SEGUNDA linha de
 * subtotal (após incluir mais 2 contas lançadas depois, como
 * "COMBUSTIVEIS") — inconsistência real, ver nota abaixo.
 *
 * @param {any[][]} rows  linhas cruas (header:1) da aba do relatório 124
 * @returns {{ subtotais: number[], termoUsado: number|null }}
 */
export function parseGrupo750Termo1(rows) {
  const subtotais = [];
  for (const row of rows) {
    const temCodigoConta = row[1] !== undefined && row[1] !== null && row[1] !== "";
    const valor = row[3];
    if (!temCodigoConta && typeof valor === "number") {
      subtotais.push(round2(Math.abs(valor)));
    }
  }
  // Default: primeiro subtotal encontrado (correto em 6/7 meses reais).
  // Julho é excepção conhecida — exige confirmação manual (ver README/dúvidas).
  return { subtotais, termoUsado: subtotais.length > 0 ? subtotais[0] : null };
}

/**
 * TERMO 2 — extrato de caixa/tesouraria (Rotina de lançamento de caixa,
 * ex: "ROTINA_LANC_631"), sem cabeçalho no export original. Posições
 * confirmadas contra o arquivo real "validação Ingrid":
 *   [0]=Dt.Lanc [1]=Num.Lanc [2]=Histórico [3]=Parceiro
 *   [4]=0 [5]=0 [6]='OUTROS' [7]=Valor [8]=Código do Caixa
 *   [9]='-' [10]=null [11]=Rotina de origem [12]='1' [13]=Filial
 */
export function parseGrupo750Termo2(rows) {
  let total = 0;
  let excluidoPorHistorico = 0;
  let excluidoPorCaixa = 0;

  for (const rawRow of rows) {
    const values = Array.isArray(rawRow) ? rawRow : Object.values(rawRow);
    const historico = String(values[2] ?? "").toLowerCase();
    const valor = Number(values[7]);
    const codigoCaixa = Number(values[8]);
    if (Number.isNaN(valor)) continue;

    if (HISTORICO_EXCLUIR.some((kw) => historico.includes(kw))) {
      excluidoPorHistorico += valor;
      continue;
    }
    if (codigoCaixa !== CAIXA_TESOURARIA_10) {
      excluidoPorCaixa += valor;
      continue;
    }
    total += valor;
  }

  // Convenção da DRE: despesas do Grupo 750 aparecem como termo positivo
  // na fórmula (ex: "=349591.34+66004.29"), mesmo vindo negativo do
  // extrato de caixa (saída de caixa). Normaliza para valor absoluto.
  return {
    total: round2(Math.abs(total)),
    excluidoPorHistorico: round2(excluidoPorHistorico),
    excluidoPorCaixa: round2(excluidoPorCaixa),
  };
}

export function ehLoteMultiMes(workbook) {
  return workbook.SheetNames.filter((n) => RE_MES_ABA.test(n)).length >= 2;
}

export function parseGrupo750(rows124Grupo750, rowsCaixaTesouraria) {
  const termo1 = parseGrupo750Termo1(rows124Grupo750);
  const termo2 = parseGrupo750Termo2(rowsCaixaTesouraria);
  return {
    termo1,
    termo2: termo2.total,
    total: round2(termo1 + termo2.total),
    detalheTermo2: termo2,
    memoriaCalculo: `=${termo1}+${termo2.total}`,
  };
}

// ─── IMPORTAÇÃO EM LOTE — arquivos "um mês por aba" ─────────────
// Confirmado contra os arquivos reais (19-20/08/2026):
//   ROTINA_124_GRUPO_750_DE_JANEIRO_A_JULHO.xls  → termo 1
//   ROTINA_124_-_GRUPO_538_JAN_A_JUN_2026.xlsx   → termo 2
// Nomes de aba variam ("012026 - ROTINA 124...", "01 2026 - 538",
// "02 2026"...) mas sempre começam com MM + AAAA.
const RE_MES_ABA = /^(\d{2})\D{0,3}(\d{4})/;

function extrairMesDaAba(nomeAba) {
  const m = nomeAba.match(RE_MES_ABA);
  if (!m) return null;
  return `${m[2]}-${m[1]}`; // AAAA-MM
}

/**
 * TERMO 1 em lote — cada aba é um mês. Extrai TODOS os subtotais
 * (linhas com Filial vazio + valor numérico) na ordem em que aparecem.
 * O ⚠️ achado da auditoria: jan-jun usam o 1º subtotal (bruto, antes de
 * ajustes/"outras receitas"); julho usa o ÚLTIMO subtotal (líquido).
 * Por isso retornamos os dois e marcamos qual bate com o padrão mais
 * recente, para decisão explícita — não escondemos a divergência.
 */
export function parseGrupo750Termo1Lote(workbook) {
  const XLSXUtil = XLSX.utils;
  const resultado = {};

  for (const nomeAba of workbook.SheetNames) {
    const mes = extrairMesDaAba(nomeAba);
    if (!mes) continue;
    const ws = workbook.Sheets[nomeAba];
    const rows = XLSXUtil.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) continue;

    const header = rows[0];
    const idxValor = header.findIndex((h) => String(h).trim() === "Valor Realizado");
    const idxFilial = 0;
    if (idxValor === -1) continue;

    const subtotais = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const filial = row[idxFilial];
      const valor = row[idxValor];
      if ((filial === null || filial === undefined) && typeof valor === "number") {
        subtotais.push(round2(Math.abs(valor)));
      }
    }
    if (subtotais.length === 0) continue;

    resultado[mes] = {
      subtotalBruto: subtotais[0],
      totalLiquido: subtotais[subtotais.length - 1],
      // valor "oficial" adotado historicamente até jun/2026 era o bruto;
      // a partir de jul/2026 passou a ser o líquido — ver achado de auditoria.
      valorHistoricoAdotado: mes <= "2026-06" ? subtotais[0] : subtotais[subtotais.length - 1],
    };
  }
  return resultado;
}

/**
 * TERMO 2 em lote — cada aba é um mês, mesma estrutura do extrato de
 * caixa (sem cabeçalho fixo de posição — localiza a coluna "VALOR" pelo
 * nome, soma tudo exceto a linha de total, que tem a coluna DATA vazia).
 */
export function parseGrupo750Termo2Lote(workbook) {
  const XLSXUtil = XLSX.utils;
  const resultado = {};

  for (const nomeAba of workbook.SheetNames) {
    const mes = extrairMesDaAba(nomeAba);
    if (!mes) continue;
    const ws = workbook.Sheets[nomeAba];
    const rows = XLSXUtil.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) continue;

    const header = rows[0];
    const idxValor = header.findIndex((h) => String(h).trim() === "VALOR");
    const idxData = 0;
    if (idxValor === -1) continue;

    let total = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[idxData] === null || row[idxData] === undefined) continue; // linha de total
      const valor = row[idxValor];
      if (typeof valor === "number") total += valor;
    }
    resultado[mes] = { total: round2(Math.abs(total)) };
  }
  return resultado;
}

function round2(n) { return Math.round(n * 100) / 100; }
