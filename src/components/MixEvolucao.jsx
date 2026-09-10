import { useMemo } from "react";
import GraficoEvolucao from "./GraficoEvolucao.jsx";
import { DEPARTAMENTOS, classificarDepartamento } from "../lib/departamentos.js";

// ═══════════════════════════════════════════════════════════════════
// Adapta o histórico da rotina 1464 (produtos) para o gráfico de
// evolução: item = sabor, grupo = departamento comercial.
// ═══════════════════════════════════════════════════════════════════

/**
 * Se o mesmo código aparecer duas vezes no mês, soma — e o preço médio
 * é recalculado do agregado, nunca a média de duas médias.
 */
function montarBase(dados1464) {
  const meses = Object.keys(dados1464 || {}).sort();
  const catalogo = new Map();
  const valores = new Map();

  for (const mes of meses) {
    const produtos = dados1464[mes]?.extra?.produtos;
    if (!Array.isArray(produtos)) continue;
    for (const p of produtos) {
      const chave = String(p.codigo ?? p.descricao);
      // a descrição mais recente prevalece (mudança de embalagem, etc.)
      catalogo.set(chave, {
        chave,
        rotulo: p.descricao || catalogo.get(chave)?.rotulo || chave,
        grupo: classificarDepartamento(p),
      });
      if (!valores.has(chave)) valores.set(chave, {});
      const serie = valores.get(chave);
      const antes = serie[mes] || { quantidade: 0, faturamento: 0 };
      const quantidade = antes.quantidade + (p.quantidade || 0);
      const faturamento = antes.faturamento + (p.faturamento || 0);
      serie[mes] = { quantidade, faturamento, precoMedio: quantidade ? faturamento / quantidade : null };
    }
  }
  return { meses, catalogo: [...catalogo.values()], valores };
}

export default function MixEvolucao({ T, dados1464 }) {
  const { meses, catalogo, valores } = useMemo(() => montarBase(dados1464), [dados1464]);
  if (!meses.length) return null;
  return (
    <GraficoEvolucao
      T={T} meses={meses} catalogo={catalogo} valores={valores}
      grupos={DEPARTAMENTOS}
      titulo="Evolução por sabor"
      nomeItem="Sabores"
      descricao={<>Uma linha por sabor ao longo dos meses importados. Escolha o indicador, filtre por categoria e marque os sabores. Passe o mouse para ver o rótulo de dados no ponto. Cada sabor tem cor, <b>forma de marcador</b> e <b>tipo de traço</b> próprios — a leitura não depende de enxergar a cor.</>}
    />
  );
}
