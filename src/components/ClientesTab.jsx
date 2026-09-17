import { useState, useMemo, useEffect } from "react";
import { StatCard } from "./AnomalyBadge.jsx";
import { MESES_LABEL } from "../lib/dreReference.js";
import ClientesEvolucao from "./ClientesEvolucao.jsx";

const OPCOES_TOPN = [5, 10, 15, 20, "Todos"];

export default function ClientesTab({ T, dadosClientes }) {
  const mesesDisponiveis = Object.keys(dadosClientes || {}).sort();
  const [mesSelecionado, setMesSelecionado] = useState(mesesDisponiveis[mesesDisponiveis.length - 1] || null);
  const [topN, setTopN] = useState(10);

  useEffect(() => {
    if (mesesDisponiveis.length && !mesesDisponiveis.includes(mesSelecionado)) {
      setMesSelecionado(mesesDisponiveis[mesesDisponiveis.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesDisponiveis.join(",")]);

  if (!mesesDisponiveis.length) {
    return (
      <div>
        <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Faturamento por Cliente</h1>
        <p style={{ color: T.textSub, fontSize: 13, marginBottom: 20, maxWidth: 640 }}>
          Concentração de faturamento por cliente (Rotina 1464), com filtro por Top N maiores contas.
        </p>
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted }}>Nenhum dado importado ainda — vá em "Importar" e carregue o arquivo "Faturamento por Cliente".</div>
      </div>
    );
  }

  const dadosMes = dadosClientes[mesSelecionado];
  // O acumulado e calculado sobre o ranking INTEIRO, nao sobre a fatia
  // exibida: "os 10 maiores fazem 68% do faturamento" e uma frase sobre
  // a carteira toda. Se fosse calculado dentro do Top N, o ultimo da
  // lista sempre daria 100% e a leitura viraria mentira.
  const listaCompleta = dadosMes.clientes.reduce((acc, c) => {
    const anterior = acc.length ? acc[acc.length - 1].pctAcumulado : 0;
    acc.push({ ...c, posicao: acc.length + 1, pctAcumulado: anterior + (c.pctParticipacao || 0) });
    return acc;
  }, []);
  const lista = topN === "Todos" ? listaCompleta : listaCompleta.slice(0, topN);
  // Quantos clientes bastam para 80% do faturamento — o corte da curva ABC.
  const clientesAte80 = Math.max(1, listaCompleta.findIndex((c) => c.pctAcumulado >= 80) + 1);
  const somaTopN = lista.reduce((s, c) => s + c.faturamento, 0);
  const pctTopN = dadosMes.totalFaturamento ? (somaTopN / dadosMes.totalFaturamento) * 100 : 0;

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Faturamento por Cliente</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 16, maxWidth: 680 }}>
        Concentração de faturamento por cliente (Rotina 1464) — {dadosMes.clientes.length} clientes no mês. Útil para avaliar dependência de contas grandes (ex: um único cliente representando quase metade do faturamento).
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>Mês:
          <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12 }}>
            {mesesDisponiveis.map((m) => <option key={m} value={m}>{MESES_LABEL[m] || m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>Top:
          <select value={topN} onChange={(e) => setTopN(e.target.value === "Todos" ? "Todos" : Number(e.target.value))} style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12 }}>
            {OPCOES_TOPN.map((n) => <option key={n} value={n}>{n === "Todos" ? "Todos" : `Top ${n}`}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard T={T} label="Faturamento Total do Mês" value={`R$ ${dadosMes.totalFaturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent={T.primary} />
        <StatCard T={T} label={topN === "Todos" ? "Nº de Clientes" : `Concentração Top ${topN}`} value={topN === "Todos" ? String(listaCompleta.length) : `${pctTopN.toFixed(2)}%`} sub={topN === "Todos" ? undefined : "do faturamento total"} accent={T.gold} />
        <StatCard T={T} label="Clientes até 80%" value={String(clientesAte80)} sub={`de ${listaCompleta.length} clientes no mês`} accent={T.text} />
        <StatCard T={T} label="Maior Cliente" value={listaCompleta[0]?.nome?.split(" ").slice(0, 3).join(" ") || "—"} sub={listaCompleta[0] ? `${listaCompleta[0].pctParticipacao.toFixed(2)}% do total` : undefined} accent={T.leaf} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            {["#", "Cliente", "Qtd.", "Faturamento", "Preço Médio", "% Participação", "% Acumulado", "Concentração"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.codigo}>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>{c.posicao}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}` }}>{c.nome}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{c.quantidade.toLocaleString("pt-BR")}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>R$ {c.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{c.precoMedio != null ? `R$ ${c.precoMedio.toFixed(2)}` : "—"}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{c.pctParticipacao.toFixed(2)}%</td>
                <td title="Soma da participação deste cliente e de todos acima dele no ranking do mês" style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontWeight: 700, color: T.gold }}>{c.pctAcumulado.toFixed(2)}%</td>
                {/* Curva de concentração (Pareto): a barra e o ACUMULADO,
                    entao ela cresce ate encher no fim da carteira. Lida de
                    cima para baixo, responde "quantos clientes fazem 80%
                    do faturamento". A barra antiga usava o maior cliente
                    como denominador, entao o primeiro da lista sempre
                    enchia a barra — desenhava a ordenacao, nao um dado. */}
                <td title={`Até aqui, ${c.posicao} ${c.posicao === 1 ? "cliente responde" : "clientes respondem"} por ${c.pctAcumulado.toFixed(2)}% do faturamento do mês`}
                  style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, minWidth: 150 }}>
                  <div style={{ position: "relative", background: T.border, borderRadius: 3, height: 8, width: "100%" }}>
                    <div style={{ background: c.pctAcumulado >= 80 ? T.leaf : T.primary, borderRadius: 3, height: 8, width: `${Math.min(100, c.pctAcumulado)}%` }} />
                    {/* marca dos 80% — o corte classico da curva ABC */}
                    <div title="Corte de 80%" style={{ position: "absolute", left: "80%", top: -3, width: 1, height: 14, background: T.textMuted }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientesEvolucao T={T} dadosClientes={dadosClientes} />
    </div>
  );
}
