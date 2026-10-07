// Regras do bloco gerencial compartilhadas entre o parser dos arquivos (parsers/grupo750.js)
// e a leitura do dado do banco (dreReference.js). Ficam num arquivo só para não divergirem.

// Grupo 750, termo 1: o relatório 124 tem dois totais — o primeiro soma só as contas com saldo
// de despesa ("desconsiderando as receitas", como diz o Pedro) e o último é o líquido, com os créditos.
// Vale SEMPRE o primeiro. Confirmado pelo Pedro em 06/10/2026: o uso do segundo total em julho/2026
// (349.591,34) foi erro de digitação; o correto em julho é o primeiro (351.493,85).
// Esta lista existe só para o caso de algum mês futuro ter de usar o líquido; hoje está vazia.
export const MESES_COM_SUBTOTAL_LIQUIDO = [];
