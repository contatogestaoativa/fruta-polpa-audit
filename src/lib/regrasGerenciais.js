// Regras do bloco gerencial compartilhadas entre o parser dos arquivos (parsers/grupo750.js)
// e a leitura do dado do banco (dreReference.js). Ficam num arquivo só para não divergirem.

// Grupo 750, termo 1: o relatório 124 tem dois subtotais — o primeiro soma só as contas com saldo
// de despesa ("desconsiderando as receitas", como diz o Pedro) e o último é o líquido, com os créditos.
// A contabilidade usou o primeiro em todos os meses de 2026 conferidos, EXCETO julho (usou o líquido).
// Motivo da exceção de julho: pergunta em aberto com o Pedro.
export const MESES_COM_SUBTOTAL_LIQUIDO = ["2026-07"];
