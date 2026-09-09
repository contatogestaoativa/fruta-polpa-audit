// ═══════════════════════════════════════════════════════════════════
// ROTINA 1464 — FATURAMENTO POR CLIENTE PRINCIPAL
// Formato: uma aba por mês (nome completo em português: "janeiro",
// "fevereiro"...), sem cabeçalho — colunas posicionais:
//   [0] Código do cliente
//   [1] Nome do cliente
//   [2] Quantidade
//   [3] Faturamento (R$)
//   [4] % Participação (já vem calculado no arquivo)
//   [5] Valor complementar (varia por cliente — não essencial pro mix)
//   [6] (sempre 0, não utilizado)
// Já testado: a soma da coluna Faturamento bate exata com a Receita
// Bruta da DRE no mesmo mês.
// ═══════════════════════════════════════════════════════════════════

const MES_NOME_PARA_CHAVE = {
  janeiro: "01", fevereiro: "02", março: "03", marco: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
};

function round2(n) { return Math.round(n * 100) / 100; }

export function ehArquivoClientes1464(workbook) {
  return workbook.SheetNames.some((n) => MES_NOME_PARA_CHAVE[n.trim().toLowerCase()]);
}

/**
 * @param {object} workbook  XLSX workbook já lido
 * @param {object} XLSXUtil  XLSX.utils
 * @param {number} ano
 * @returns {Record<string, {clientes: Array, totalQuantidade:number, totalFaturamento:number}>}
 */
export function parseClientes1464(workbook, XLSXUtil, ano = 2026) {
  const resultado = {};
  for (const nomeAba of workbook.SheetNames) {
    const mm = MES_NOME_PARA_CHAVE[nomeAba.trim().toLowerCase()];
    if (!mm) continue;
    const mesKey = `${ano}-${mm}`;
    const rows = XLSXUtil.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, defval: null });

    const clientes = [];
    let totalQuantidade = 0, totalFaturamento = 0;
    for (const row of rows) {
      if (!row || row[1] === null || row[1] === undefined) continue;
      const quantidade = Number(row[2]) || 0;
      const faturamento = Number(row[3]) || 0;
      clientes.push({
        codigo: row[0],
        nome: String(row[1]).trim(),
        quantidade,
        faturamento: round2(faturamento),
        precoMedio: quantidade ? round2(faturamento / quantidade) : null,
      });
      totalQuantidade += quantidade;
      totalFaturamento += faturamento;
    }
    clientes.forEach((c) => {
      c.pctParticipacao = totalFaturamento ? round2((c.faturamento / totalFaturamento) * 10000) / 100 : 0;
    });
    clientes.sort((a, b) => b.faturamento - a.faturamento);

    resultado[mesKey] = { clientes, totalQuantidade: round2(totalQuantidade), totalFaturamento: round2(totalFaturamento) };
  }
  return resultado;
}
