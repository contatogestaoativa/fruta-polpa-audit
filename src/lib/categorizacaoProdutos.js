// ═══════════════════════════════════════════════════════════════════
// CATEGORIZAÇÃO DE PRODUTOS (Rotina 1464 — Faturamento por Produto)
//
// Não é um simples "contém a palavra X" — isso juntaria coisas erradas:
//   · "MORANGO CONGELADO" (fruta crua) ≠ "POLPA DE MORANGO" (processada)
//     — são produtos e categorias de negócio diferentes, mesmo os dois
//     tendo "morango" no nome.
//   · "AÇAÍ COM MORANGO" é um produto da linha Açaí (sabor), não deve
//     cair na categoria "Morango".
//
// Por isso a regra usa o INÍCIO do nome (prefixo), que é o padrão real
// de nomenclatura do Winthor pra essa empresa: "ACAI ...", "POLPA DE
// ...", "POLPA MIX ...", "MORANGO CONGELADO ...".
// ═══════════════════════════════════════════════════════════════════

const PREFIXO_FRUTA = {
  ABACAXI: "Abacaxi", ACEROLA: "Acerola", BACURI: "Bacuri", CAJA: "Cajá",
  CAJU: "Caju", CUPUACU: "Cupuaçu", GOIABA: "Goiaba", GRAVIOLA: "Graviola",
  MANGA: "Manga", MARACUJA: "Maracujá", MORANGO: "Morango", MURICI: "Murici",
  TAMARINDO: "Tamarindo", ACAI: "Açaí",
};

/**
 * @param {string} descricao  ex: "POLPA DE MORANGO 400G FRUTA POLPA PREM"
 * @returns {{ id: string, label: string }}
 */
export function categorizarProduto(descricao) {
  const d = String(descricao || "").trim().toUpperCase();

  if (d.startsWith("MORANGO CONGELADO")) return { id: "morango_congelado", label: "Morango Congelado" };
  if (d.startsWith("ACAI")) return { id: "acai", label: "Açaí" };
  if (d.startsWith("POLPA MIX")) return { id: "mix", label: "Mix" };

  if (d.startsWith("POLPA DE ")) {
    const resto = d.slice("POLPA DE ".length);
    if (resto.startsWith("ACAI")) return { id: "acai", label: "Açaí" };
    for (const prefixo of Object.keys(PREFIXO_FRUTA)) {
      if (resto.startsWith(prefixo)) return { id: `polpa_${prefixo.toLowerCase()}`, label: PREFIXO_FRUTA[prefixo] };
    }
  }
  return { id: "outros", label: "Outros" };
}

/** Lista de grupos únicos, na ordem em que aparecem no catálogo — para alimentar o filtro de categoria. */
export function listarGruposProdutos(catalogo) {
  const vistos = new Map();
  catalogo.forEach((item) => { if (!vistos.has(item.grupo)) vistos.set(item.grupo, item.grupoLabel); });
  return Array.from(vistos, ([id, label]) => ({ id, label }));
}
