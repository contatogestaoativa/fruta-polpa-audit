import { useMemo } from "react";
import GraficoEvolucao from "./GraficoEvolucao.jsx";

// ═══════════════════════════════════════════════════════════════════
// Adapta o histórico da rotina 1464 (clientes) para o gráfico de
// evolução: item = cliente. Sem categorias, mas com busca — são cerca
// de mil clientes por mês.
// ═══════════════════════════════════════════════════════════════════

function montarBase(dadosClientes) {
  const meses = Object.keys(dadosClientes || {}).sort();
  const catalogo = new Map();
  const valores = new Map();

  for (const mes of meses) {
    const clientes = dadosClientes[mes]?.clientes;
    if (!Array.isArray(clientes)) continue;
    for (const c of clientes) {
      const chave = String(c.codigo ?? c.nome);
      catalogo.set(chave, { chave, rotulo: c.nome || catalogo.get(chave)?.rotulo || chave });
      if (!valores.has(chave)) valores.set(chave, {});
      const serie = valores.get(chave);
      const antes = serie[mes] || { quantidade: 0, faturamento: 0 };
      const quantidade = antes.quantidade + (c.quantidade || 0);
      const faturamento = antes.faturamento + (c.faturamento || 0);
      serie[mes] = { quantidade, faturamento, precoMedio: quantidade ? faturamento / quantidade : null };
    }
  }
  // ordem alfabética na lista de escolha, para procurar com o olho
  const lista = [...catalogo.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" }));
  return { meses, catalogo: lista, valores };
}

export default function ClientesEvolucao({ T, dadosClientes }) {
  const { meses, catalogo, valores } = useMemo(() => montarBase(dadosClientes), [dadosClientes]);
  if (!meses.length) return null;
  return (
    <GraficoEvolucao
      T={T} meses={meses} catalogo={catalogo} valores={valores}
      comBusca
      titulo="Evolução por cliente"
      nomeItem="Clientes"
      descricao={<>Uma linha por cliente ao longo dos meses importados. O gráfico já abre com os cinco maiores do mês mais recente; use a busca para trocar por qualquer outro. Passe o mouse para ver o rótulo de dados no ponto. É aqui que se enxerga <b>conta grande perdendo volume</b> antes de o total do mês acusar.</>}
    />
  );
}
