// ═══════════════════════════════════════════════════════════════════
// ANÁLISE TRIMESTRAL — arquivo consolidado 2025 x 2026, uma aba por mês
// (JAN, FEV, MAR... nome abreviado, não data) — mesmo formato da
// planilha usada para montar a referência de 2025. Serve para
// atualizar os meses seguintes (Ago/2026 em diante) sem depender só
// do valor de referência estático.
// Estrutura de cada aba: Coluna A = "código - descrição" (ou só
// descrição, para totais), Coluna B = valor 2025, Coluna C = valor 2026.
// ═══════════════════════════════════════════════════════════════════

const MES_ABREV_PARA_CHAVE = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function extraiCodigo(label) {
  const m = String(label || "").trim().match(/^(\d+)\s*-\s*/);
  return m ? Number(m[1]) : null;
}
function round2(n) { return Math.round(n * 100) / 100; }

export function ehArquivoAnaliseTrimestral(workbook) {
  return workbook.SheetNames.some((n) => MES_ABREV_PARA_CHAVE[n.trim().toLowerCase()]);
}

/**
 * @param {object} workbook  XLSX workbook (precisa de workbook + XLSX.utils já disponível no chamador)
 * @param {object} XLSXUtil  XLSX.utils (passado pelo chamador, ver App.jsx)
 * @param {number} anoBase   ano dos dados "2026" no arquivo (padrão 2026)
 * @returns {Record<string, {porCodigo: Record<number,{v2025:number, v2026:number}>, arquivoOrigem:string}>}
 */
export function parseAnaliseTrimestral(workbook, XLSXUtil, anoBase = 2026) {
  const resultado = {};
  for (const nomeAba of workbook.SheetNames) {
    const mm = MES_ABREV_PARA_CHAVE[nomeAba.trim().toLowerCase()];
    if (!mm) continue;
    const mesKey = `${anoBase}-${mm}`;
    const rows = XLSXUtil.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, defval: null });
    const porCodigo = {};
    for (const row of rows) {
      const label = row[0];
      const codigo = extraiCodigo(label);
      if (codigo === null) continue; // pula linhas de total/cabeçalho — só interessa conta de detalhe
      const v2025 = Number(row[1]) || 0;
      const v2026 = Number(row[2]) || 0;
      porCodigo[codigo] = { v2025: round2(v2025), v2026: round2(v2026) };
    }
    resultado[mesKey] = { porCodigo };
  }
  return resultado;
}
