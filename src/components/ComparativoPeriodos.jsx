import { useState, useMemo, Fragment } from "react";
import { DRE_NODES } from "../lib/dreNodes.js";
import { getValorNode, REF } from "../lib/dreReference.js";
import { fechamentosNoMes, fechamentosNoPeriodo } from "../lib/fechamentos.js";

// ═══════════════════════════════════════════════════════════════════
// COMPARATIVO DE PERÍODOS (demanda Gerson, 31/08/2026)
// O usuário escolhe DOIS períodos quaisquer (um mês contra outro, ou
// um intervalo contra outro) e vê a DRE inteira lado a lado, com a
// diferença em R$ e em %.
//
// Três bases de comparação, porque comparar períodos de tamanhos
// diferentes em valor cheio mente:
//   · Total do período  — soma pura
//   · Média mensal      — soma ÷ nº de meses
//   · Por fechamento    — soma ÷ nº de sextas-feiras (fechamentos)
//
// Análise vertical segue a mesma regra da aba DRE: bloco contábil
// (linhas < 201) sobre a Receita dos Produtos Vendidos; bloco gerencial
// (linhas >= 201) sobre o Faturamento Gerencial.
// ═══════════════════════════════════════════════════════════════════

const PCT_ROWS = new Set([204, 214, 219]);
const PCT_PARA_LINHA_MONEY = { 204: 203, 214: 213, 219: 218 };
const LINHAS_RESULTADO = [201, 213, 214, 218, 219, 204]; // cards do topo

function fmtMoeda(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoedaCurta(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtPctFracao(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
function fmtPctSimples(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
// Sempre com ícone + sinal — nunca só cor (acessibilidade).
function fmtDeltaMoeda(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "▲ +" : n < 0 ? "▼ −" : "= ";
  return sinal + "R$ " + Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtDeltaPP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "▲ +" : n < 0 ? "▼ −" : "= ";
  return sinal + Math.abs(n * 100).toFixed(2) + " p.p.";
}
function fmtDeltaPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "+" : n < 0 ? "−" : "";
  return sinal + Math.abs(n * 100).toFixed(2) + "%";
}

function agruparSecoes(nodes) {
  const secoes = [];
  let atual = null;
  for (const n of nodes) {
    if (n.level === 0) { atual = { header: n, children: [] }; secoes.push(atual); }
    else if (atual) atual.children.push(n);
  }
  return secoes;
}

function intervalo(meses, de, ate) {
  const i = meses.indexOf(de), j = meses.indexOf(ate);
  if (i < 0 || j < 0) return [];
  return i <= j ? meses.slice(i, j + 1) : meses.slice(j, i + 1);
}

export default function ComparativoPeriodos({ T, meses, mesesLabel, overrides }) {
  const secoes = useMemo(() => agruparSecoes(DRE_NODES), []);
  const porRow = useMemo(() => Object.fromEntries(DRE_NODES.map((n) => [n.row, n])), []);
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [base, setBase] = useState("total"); // total | mensal | fechamento

  const ultimo = meses[meses.length - 1];
  const penultimo = meses[meses.length - 2] || ultimo;
  const [aDe, setADe] = useState(penultimo);
  const [aAte, setAAte] = useState(penultimo);
  const [bDe, setBDe] = useState(ultimo);
  const [bAte, setBAte] = useState(ultimo);

  const mesesA = useMemo(() => intervalo(meses, aDe, aAte), [meses, aDe, aAte]);
  const mesesB = useMemo(() => intervalo(meses, bDe, bAte), [meses, bDe, bAte]);

  const toggle = (row) => setExpandidas((prev) => {
    const next = new Set(prev);
    next.has(row) ? next.delete(row) : next.add(row);
    return next;
  });

  function aplicarPreset(preset) {
    if (preset === "mesAmes") { setADe(penultimo); setAAte(penultimo); setBDe(ultimo); setBAte(ultimo); }
    if (preset === "trimestres") { setADe(meses[0]); setAAte(meses[2]); setBDe(meses[3]); setBAte(meses[5]); }
    if (preset === "primeiroUltimo") { setADe(meses[0]); setAAte(meses[0]); setBDe(ultimo); setBAte(ultimo); }
  }

  // ── Núcleo do cálculo ───────────────────────────────────────────
  const divisor = (lista) => {
    if (base === "mensal") return lista.length || 1;
    if (base === "fechamento") return fechamentosNoPeriodo(lista) || 1;
    return 1;
  };
  function somaBruta(node, lista) {
    return lista.reduce((s, m) => {
      const v = getValorNode(node, m, overrides);
      return s + (typeof v === "number" ? v : 0);
    }, 0);
  }
  // valor do período já na base escolhida. Linhas de % são RECALCULADAS
  // (lucro acumulado ÷ faturamento acumulado) — nunca soma nem média de %.
  function valorPeriodo(node, lista) {
    if (!lista.length) return null;
    if (PCT_ROWS.has(node.row)) {
      const moneyRow = porRow[PCT_PARA_LINHA_MONEY[node.row]];
      const fat = lista.reduce((s, m) => s + (REF.faturamentoGerencial[m] || 0), 0);
      if (!moneyRow || !fat) return null;
      return somaBruta(moneyRow, lista) / fat;
    }
    return somaBruta(node, lista) / divisor(lista);
  }
  // análise vertical — não muda com a base (é razão dentro do mesmo período)
  function pctVertical(node, lista) {
    if (PCT_ROWS.has(node.row) || !lista.length) return null;
    const baseVertical = node.row < 201
      ? lista.reduce((s, m) => s + (REF.receitaBruta[m] || 0), 0)
      : lista.reduce((s, m) => s + (REF.faturamentoGerencial[m] || 0), 0);
    if (!baseVertical) return null;
    return (somaBruta(node, lista) / baseVertical) * 100;
  }

  function linhaComparada(node) {
    const a = valorPeriodo(node, mesesA);
    const b = valorPeriodo(node, mesesB);
    const ehPct = PCT_ROWS.has(node.row);
    const delta = (a === null || b === null) ? null : b - a;
    const deltaPct = (delta === null || !a) ? null : delta / Math.abs(a);
    return { node, a, b, delta, deltaPct, ehPct, pctA: pctVertical(node, mesesA), pctB: pctVertical(node, mesesB) };
  }

  const cards = useMemo(() => LINHAS_RESULTADO.map((row) => linhaComparada(porRow[row])).filter((c) => c.node), [mesesA, mesesB, base, overrides]);

  // Top movers: só contas ANALÍTICAS (folhas da árvore) — assim o mesmo
  // dinheiro não aparece duas vezes, uma no subtotal e outra no detalhe.
  const topMovers = useMemo(() => {
    return DRE_NODES
      .filter((n, i) => {
        if (PCT_ROWS.has(n.row) || n.total) return false;
        const proximo = DRE_NODES[i + 1];
        return !proximo || proximo.level <= n.level; // folha
      })
      .map(linhaComparada)
      .filter((c) => c.delta !== null && Math.abs(c.delta) > 0.5)
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      .slice(0, 12);
  }, [mesesA, mesesB, base, overrides]);

  const sobrepoe = mesesA.some((m) => mesesB.includes(m));
  const rotuloBase = base === "total" ? "total do período" : base === "mensal" ? "média mensal" : "por fechamento";
  const labelA = rotuloPeriodo(mesesA, mesesLabel);
  const labelB = rotuloPeriodo(mesesB, mesesLabel);

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Comparativo de Períodos</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 16, maxWidth: 760 }}>
        Escolha dois períodos quaisquer — dois meses, ou dois intervalos — e veja a DRE inteira lado a lado, linha por linha, com a diferença em R$ e em %. A análise vertical segue a regra da DRE: bloco contábil sobre a <b>Receita dos Produtos Vendidos</b>, bloco gerencial sobre o <b>Faturamento Gerencial</b>.
      </p>

      {/* ── Seletores ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <SeletorPeriodo T={T} titulo="Período A (base)" meses={meses} mesesLabel={mesesLabel} de={aDe} ate={aAte} setDe={setADe} setAte={setAAte} />
        <div style={{ fontSize: 20, color: T.textMuted, paddingBottom: 8 }}>×</div>
        <SeletorPeriodo T={T} titulo="Período B (comparado)" meses={meses} mesesLabel={mesesLabel} de={bDe} ate={bAte} setDe={setBDe} setAte={setBAte} />
        <div>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 6 }}>BASE DE COMPARAÇÃO</div>
          <div style={{ display: "flex", background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 20, padding: 2 }}>
            {[["total", "Total"], ["mensal", "Média mensal"], ["fechamento", "Por fechamento"]].map(([id, lb]) => (
              <button key={id} onClick={() => setBase(id)} title={id === "fechamento" ? "Divide pelo nº de sextas-feiras (fechamentos) do período" : id === "mensal" ? "Divide pelo nº de meses do período" : "Soma pura do período"}
                style={{ border: "none", borderRadius: 18, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", background: base === id ? T.primary : "transparent", color: base === id ? "#fff" : T.textSub }}>
                {base === id ? "✓ " : ""}{lb}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => aplicarPreset("mesAmes")} style={btnMini(T)}>Último mês × anterior</button>
        <button onClick={() => aplicarPreset("trimestres")} style={btnMini(T)}>1º Tri × 2º Tri</button>
        <button onClick={() => aplicarPreset("primeiroUltimo")} style={btnMini(T)}>{mesesLabel[meses[0]]} × {mesesLabel[ultimo]}</button>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
        <b style={{ color: T.textSub }}>A</b> = {labelA} ({mesesA.length} mês(es) · {fechamentosNoPeriodo(mesesA)} fechamentos) &nbsp;·&nbsp;
        <b style={{ color: T.textSub }}>B</b> = {labelB} ({mesesB.length} mês(es) · {fechamentosNoPeriodo(mesesB)} fechamentos) &nbsp;·&nbsp;
        valores em <b style={{ color: T.primary }}>{rotuloBase}</b>
      </div>
      {sobrepoe && (
        <div style={{ fontSize: 11, color: T.warning, border: `1px solid ${T.warning}55`, background: T.goldDim, borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
          ⚠ ATENÇÃO — os dois períodos têm meses em comum. A comparação continua válida, mas a leitura fica ambígua.
        </div>
      )}
      {base === "total" && mesesA.length !== mesesB.length && (
        <div style={{ fontSize: 11, color: T.warning, border: `1px solid ${T.warning}55`, background: T.goldDim, borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
          ⚠ ATENÇÃO — os períodos têm tamanhos diferentes ({mesesA.length} × {mesesB.length} meses) e a base é o total. Para uma leitura justa, troque para <b>Média mensal</b> ou <b>Por fechamento</b>.
        </div>
      )}

      {/* ── Cards de resultado ──────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.node.row} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 8 }}>{c.node.label}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, marginBottom: 2 }}>
              <span>A · {labelA}</span><b>{c.ehPct ? fmtPctFracao(c.a) : fmtMoedaCurta(c.a)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text, marginBottom: 8 }}>
              <span>B · {labelB}</span><b>{c.ehPct ? fmtPctFracao(c.b) : fmtMoedaCurta(c.b)}</b>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.delta === null ? T.textMuted : c.delta >= 0 ? T.leaf : T.danger }}>
              {c.ehPct ? fmtDeltaPP(c.delta) : fmtDeltaMoeda(c.delta)}
              {!c.ehPct && c.deltaPct !== null && <span style={{ fontSize: 11, fontWeight: 400, color: T.textMuted }}> &nbsp;({fmtDeltaPct(c.deltaPct)})</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Top movers ──────────────────────────────────────────── */}
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>O que mais mexeu o resultado</h2>
      <p style={{ color: T.textMuted, fontSize: 12, marginBottom: 10 }}>As 12 contas analíticas com maior diferença em R$ entre os dois períodos — ordenadas por impacto, não por %.</p>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "auto", marginBottom: 28 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={th(T)}>Linha</th><th style={th(T)}>Conta</th>
            <th style={{ ...th(T), textAlign: "right" }}>A</th>
            <th style={{ ...th(T), textAlign: "right" }}>B</th>
            <th style={{ ...th(T), textAlign: "right", color: T.gold }}>Diferença (R$)</th>
            <th style={{ ...th(T), textAlign: "right" }}>Var. %</th>
          </tr></thead>
          <tbody>
            {topMovers.map((c) => (
              <tr key={c.node.row}>
                <td style={{ ...td(T), color: T.textMuted }}>{c.node.row}</td>
                <td style={td(T)}>{c.node.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{c.node.conta}</span>}{c.node.label}</td>
                <td style={{ ...td(T), textAlign: "right", color: T.textSub, whiteSpace: "nowrap" }}>{fmtMoedaCurta(c.a)}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoedaCurta(c.b)}</td>
                <td style={{ ...td(T), textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", color: c.delta >= 0 ? T.leaf : T.danger }}>{fmtDeltaMoeda(c.delta)}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: T.textMuted }}>{fmtDeltaPct(c.deltaPct)}</td>
              </tr>
            ))}
            {topMovers.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: T.textMuted }}>Sem diferença relevante entre os dois períodos.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── DRE lado a lado ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>DRE lado a lado</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => setExpandidas(new Set(secoes.map((s) => s.header.row)))} style={btnMini(T)}>Expandir tudo (analítico)</button>
        <button onClick={() => setExpandidas(new Set())} style={btnMini(T)}>Recolher tudo (sintético)</button>
      </div>
      <div style={{ maxHeight: "calc(100vh - 240px)", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th(T), textAlign: "left", position: "sticky", left: 0, top: 0, background: T.bg, zIndex: 3, width: 300, minWidth: 300 }}>Linha</th>
              <th colSpan={2} style={{ ...th(T), textAlign: "center", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>A · {labelA}</th>
              <th colSpan={2} style={{ ...th(T), textAlign: "center", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>B · {labelB}</th>
              <th colSpan={2} style={{ ...th(T), textAlign: "center", position: "sticky", top: 0, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>Diferença (B − A)</th>
            </tr>
            <tr>
              <th style={{ ...th(T), position: "sticky", left: 0, top: 34, background: T.bg, zIndex: 3 }}></th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.bg, zIndex: 2 }}>Valor</th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.bg, zIndex: 2, color: T.gold }}>% Vert.</th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.bg, zIndex: 2 }}>Valor</th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.bg, zIndex: 2, color: T.gold }}>% Vert.</th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>R$</th>
              <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 34, background: T.primaryDim, zIndex: 2, color: T.primary }}>%</th>
            </tr>
          </thead>
          <tbody>
            <TituloSecao T={T} texto="DRE CONTÁBIL" />
            {secoes.map((sec) => (
              <SecaoComparada key={sec.header.row} T={T} sec={sec}
                isExpanded={expandidas.has(sec.header.row)} toggle={toggle}
                linhaComparada={linhaComparada}
                inserirTituloGerencialAntes={sec.header.row === 201} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rotuloPeriodo(lista, mesesLabel) {
  if (!lista.length) return "—";
  if (lista.length === 1) return mesesLabel[lista[0]] || lista[0];
  return `${mesesLabel[lista[0]] || lista[0]}–${mesesLabel[lista[lista.length - 1]] || lista[lista.length - 1]}`;
}

function SeletorPeriodo({ T, titulo, meses, mesesLabel, de, ate, setDe, setAte }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 6 }}>{titulo.toUpperCase()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select value={de} onChange={(e) => setDe(e.target.value)} style={selectStyle(T)}>
          {meses.map((m) => <option key={m} value={m}>{mesesLabel[m] || m}</option>)}
        </select>
        <span style={{ fontSize: 11, color: T.textMuted }}>até</span>
        <select value={ate} onChange={(e) => setAte(e.target.value)} style={selectStyle(T)}>
          {meses.map((m) => <option key={m} value={m}>{mesesLabel[m] || m}</option>)}
        </select>
      </div>
    </div>
  );
}

function TituloSecao({ T, texto }) {
  return (
    <tr>
      <td colSpan={7} style={{ padding: "10px", background: T.primaryDim, borderTop: `2px solid ${T.primary}`, borderBottom: `1px solid ${T.primary}`, fontWeight: 800, fontSize: 13, color: T.primary, letterSpacing: 0.5, position: "sticky", left: 0 }}>{texto}</td>
    </tr>
  );
}

function CelulasComparacao({ T, c, forte }) {
  const corDelta = c.delta === null ? T.textMuted : c.delta >= 0 ? T.leaf : T.danger;
  return (
    <>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontWeight: forte ? 700 : 400, color: c.ehPct ? T.gold : T.textSub }}>{c.ehPct ? fmtPctFracao(c.a) : fmtMoeda(c.a)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: T.textMuted }}>{c.pctA === null ? "—" : fmtPctSimples(c.pctA)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontWeight: forte ? 700 : 400, color: c.ehPct ? T.gold : T.text }}>{c.ehPct ? fmtPctFracao(c.b) : fmtMoeda(c.b)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: T.textMuted }}>{c.pctB === null ? "—" : fmtPctSimples(c.pctB)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: corDelta, background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>{c.ehPct ? fmtDeltaPP(c.delta) : fmtDeltaMoeda(c.delta)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: corDelta, background: T.primaryDim }}>{c.ehPct ? "—" : fmtDeltaPct(c.deltaPct)}</td>
    </>
  );
}

function SecaoComparada({ T, sec, isExpanded, toggle, linhaComparada, inserirTituloGerencialAntes }) {
  const temFilhos = sec.children.length > 0;
  const c = linhaComparada(sec.header);
  const isPct = c.ehPct;
  const rows = [];

  if (inserirTituloGerencialAntes) rows.push(<TituloSecao key="titulo-gerencial" T={T} texto="DRE GERENCIAL" />);

  rows.push(
    <tr key={sec.header.row} style={{ background: isPct ? T.goldDim : T.card }}>
      <td style={{ ...td(T), fontWeight: 700, position: "sticky", left: 0, background: isPct ? T.goldDim : T.card, color: isPct ? T.gold : T.text, width: 300, minWidth: 300 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {temFilhos
            ? <button onClick={() => toggle(sec.header.row)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11, padding: 0 }}>{isExpanded ? "▾" : "▸"}</button>
            : <span style={{ width: 12 }} />}
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px" }}>{sec.header.row}</span>
          {sec.header.label}
        </span>
      </td>
      <CelulasComparacao T={T} c={c} forte />
    </tr>
  );

  if (isExpanded) {
    sec.children.forEach((child) => {
      const cc = linhaComparada(child);
      rows.push(
        <tr key={child.row}>
          <td style={{ ...td(T), paddingLeft: 14 + child.level * 16, position: "sticky", left: 0, background: T.bg, color: T.textSub, fontWeight: child.total ? 700 : 400, width: 300, minWidth: 300 }}>
            {child.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{child.conta}</span>}
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>{child.row}</span>
            {child.label}
          </td>
          <CelulasComparacao T={T} c={cc} forte={child.total} />
        </tr>
      );
    });
  }
  return rows;
}

function th(T) { return { padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" }; }
function td(T) { return { padding: "6px 10px", borderBottom: `1px solid ${T.border}` }; }
function btnMini(T, ativo) { return { background: ativo ? T.primaryDim : "transparent", border: `1px solid ${ativo ? T.primary : T.borderHi}`, color: ativo ? T.primary : T.textSub, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }; }
function selectStyle(T) { return { background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12 }; }
