import { useState, useMemo, Fragment } from "react";
import { DRE_NODES } from "../lib/dreNodes.js";
import { mapaValores2025 } from "../lib/dre2025Reference.js";
import { getValorNode } from "../lib/dreReference.js";

const MESES_2026 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
const MESES_LABEL = { "2026-01": "Jan", "2026-02": "Fev", "2026-03": "Mar", "2026-04": "Abr", "2026-05": "Mai", "2026-06": "Jun", "2026-07": "Jul" };
const TRIMESTRES = [
  { label: "1º Trimestre", meses: ["2026-01", "2026-02", "2026-03"] },
  { label: "2º Trimestre", meses: ["2026-04", "2026-05", "2026-06"] },
];

function fmtMoeda(n) {
  if (n === null || n === undefined) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return (n * 100).toFixed(2) + "%";
}
function variacao(v2025, v2026) {
  if (v2025 === null || v2025 === undefined || v2026 === null || v2026 === undefined) return null;
  if (v2025 === 0) return v2026 === 0 ? 0 : 1;
  return (v2026 - v2025) / Math.abs(v2025);
}

function agruparSecoes(nodes) {
  const secoes = [];
  let atual = null;
  for (const n of nodes) {
    if (n.row >= 201) continue; // esta aba cobre só o bloco contábil (fonte não tem comparativo gerencial)
    if (n.level === 0) { atual = { header: n, children: [] }; secoes.push(atual); }
    else if (atual) atual.children.push(n);
  }
  return secoes;
}

export default function AnaliseTrimestral({ T, overrides, dadosImportados }) {
  const secoes = useMemo(() => agruparSecoes(DRE_NODES), []);
  const [expandidas, setExpandidas] = useState(() => new Set());
  const toggle = (row) => setExpandidas((prev) => { const next = new Set(prev); next.has(row) ? next.delete(row) : next.add(row); return next; });

  // valor de 2026: usa import específico desta rotina (se existir pro mês), senão overrides do sistema (linhas já automatizadas), senão referência
  function valor2026(node, mes) {
    const importado = dadosImportados?.[mes]?.porCodigo?.[node.conta];
    if (importado) return importado.v2026;
    return getValorNode(node, mes, overrides);
  }
  function valor2025(node, mes) {
    const importado = dadosImportados?.[mes]?.porCodigo?.[node.conta];
    if (importado) return importado.v2025;
    const mapa = mapaValores2025(DRE_NODES, mes);
    return mapa[node.row] ?? null;
  }

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Análise Trimestral — 2026 x 2025</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 6, maxWidth: 680 }}>
        Comparativo ano a ano (2025 x 2026), com fechamento por trimestre. Os dados de 2025 são fixos (referência histórica); os de 2026 usam os valores já importados no sistema quando disponíveis, e o arquivo "Comparativo 2025x2026" (aba Importar) para os meses seguintes.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setExpandidas(new Set(secoes.map((s) => s.header.row)))} style={btnMini(T)}>Expandir tudo</button>
        <button onClick={() => setExpandidas(new Set())} style={btnMini(T)}>Recolher tudo</button>
      </div>

      <div style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th(T), textAlign: "left", position: "sticky", left: 0, top: 0, background: T.bg, zIndex: 3, width: 280, minWidth: 280 }}>Linha</th>
              {MESES_2026.map((mes, i) => (
                <Fragment key={mes}>
                  <th colSpan={3} style={{ ...th(T), textAlign: "center", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>{MESES_LABEL[mes]}</th>
                  {(mes === "2026-03" || mes === "2026-06") && (
                    <th colSpan={3} style={{ ...th(T), textAlign: "center", position: "sticky", top: 0, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>
                      {mes === "2026-03" ? "1º Trimestre" : "2º Trimestre"}
                    </th>
                  )}
                </Fragment>
              ))}
            </tr>
            <tr>
              <th style={{ ...th(T), position: "sticky", left: 0, top: 28, background: T.bg, zIndex: 3 }}></th>
              {MESES_2026.map((mes) => (
                <Fragment key={mes}>
                  <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.bg, zIndex: 2 }}>2025</th>
                  <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.bg, zIndex: 2 }}>2026</th>
                  <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.bg, zIndex: 2, color: T.gold }}>Var.</th>
                  {(mes === "2026-03" || mes === "2026-06") && (
                    <>
                      <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>2025</th>
                      <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.primaryDim, zIndex: 2, color: T.primary }}>2026</th>
                      <th style={{ ...th(T), textAlign: "right", fontSize: 9, position: "sticky", top: 28, background: T.primaryDim, zIndex: 2, color: T.primary }}>Var.</th>
                    </>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {secoes.map((sec) => (
              <LinhaComFilhos key={sec.header.row} T={T} sec={sec} isExpanded={expandidas.has(sec.header.row)} toggle={toggle}
                valor2025={valor2025} valor2026={valor2026} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function celulasMes(T, node, mes, valor2025, valor2026, destaque) {
  const v25 = valor2025(node, mes);
  const v26 = valor2026(node, mes);
  const varr = variacao(v25, v26);
  const corVar = varr === null ? T.textMuted : varr >= 0 ? T.leaf : T.danger;
  return (
    <>
      <td style={{ ...td(T), textAlign: "right", color: T.textMuted, whiteSpace: "nowrap", background: destaque ? T.primaryDim : undefined, borderLeft: destaque ? `2px solid ${T.primary}` : undefined }}>{fmtMoeda(v25)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", background: destaque ? T.primaryDim : undefined }}>{fmtMoeda(v26)}</td>
      <td style={{ ...td(T), textAlign: "right", color: corVar, fontWeight: 700, whiteSpace: "nowrap", background: destaque ? T.primaryDim : undefined }}>{varr === null ? "—" : fmtPct(varr)}</td>
    </>
  );
}

function LinhaComFilhos({ T, sec, isExpanded, toggle, valor2025, valor2026 }) {
  const temFilhos = sec.children.length > 0;
  // trimestre = soma dos 3 meses (2025 e 2026 separadamente), var recalculada por cima da soma
  function trimestre(node, meses) {
    let s25 = 0, s26 = 0, achou25 = false, achou26 = false;
    meses.forEach((m) => {
      const v25 = valor2025(node, m), v26 = valor2026(node, m);
      if (v25 !== null && v25 !== undefined) { s25 += v25; achou25 = true; }
      if (v26 !== null && v26 !== undefined) { s26 += v26; achou26 = true; }
    });
    return { v25: achou25 ? s25 : null, v26: achou26 ? s26 : null };
  }

  const rows = [];
  rows.push(
    <tr key={sec.header.row} style={{ background: T.card }}>
      <td style={{ ...td(T), fontWeight: 700, position: "sticky", left: 0, background: T.card, width: 280, minWidth: 280 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {temFilhos ? <button onClick={() => toggle(sec.header.row)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11, padding: 0 }}>{isExpanded ? "▾" : "▸"}</button> : <span style={{ width: 12 }} />}
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px" }}>{sec.header.row}</span>
          {sec.header.label}
        </span>
      </td>
      {MESES_2026.map((mes) => {
        const t = TRIMESTRES.find((tt) => tt.meses[tt.meses.length - 1] === mes);
        const el = celulasMes(T, sec.header, mes, valor2025, valor2026, false);
        if (!t) return <Fragment key={mes}>{el}</Fragment>;
        const soma = trimestre(sec.header, t.meses);
        const varr = variacao(soma.v25, soma.v26);
        const corVar = varr === null ? T.textMuted : varr >= 0 ? T.leaf : T.danger;
        return (
          <Fragment key={mes}>
            {el}
            <td style={{ ...td(T), textAlign: "right", fontWeight: 700, color: T.primary, whiteSpace: "nowrap", background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>{fmtMoeda(soma.v25)}</td>
            <td style={{ ...td(T), textAlign: "right", fontWeight: 700, color: T.primary, whiteSpace: "nowrap", background: T.primaryDim }}>{fmtMoeda(soma.v26)}</td>
            <td style={{ ...td(T), textAlign: "right", fontWeight: 700, color: corVar, whiteSpace: "nowrap", background: T.primaryDim }}>{varr === null ? "—" : fmtPct(varr)}</td>
          </Fragment>
        );
      })}
    </tr>
  );

  if (isExpanded) {
    sec.children.forEach((child) => {
      rows.push(
        <tr key={child.row}>
          <td style={{ ...td(T), paddingLeft: 14 + child.level * 16, position: "sticky", left: 0, background: T.bg, color: T.textSub, width: 280, minWidth: 280 }}>
            {child.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{child.conta}</span>}
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>{child.row}</span>
            {child.label}
          </td>
          {MESES_2026.map((mes) => {
            const t = TRIMESTRES.find((tt) => tt.meses[tt.meses.length - 1] === mes);
            const el = celulasMes(T, child, mes, valor2025, valor2026, false);
            if (!t) return <Fragment key={mes}>{el}</Fragment>;
            const soma = trimestre(child, t.meses);
            const varr = variacao(soma.v25, soma.v26);
            const corVar = varr === null ? T.textMuted : varr >= 0 ? T.leaf : T.danger;
            return (
              <Fragment key={mes}>
                {el}
                <td style={{ ...td(T), textAlign: "right", color: T.textMuted, whiteSpace: "nowrap", background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>{fmtMoeda(soma.v25)}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", background: T.primaryDim }}>{fmtMoeda(soma.v26)}</td>
                <td style={{ ...td(T), textAlign: "right", color: corVar, whiteSpace: "nowrap", background: T.primaryDim }}>{varr === null ? "—" : fmtPct(varr)}</td>
              </Fragment>
            );
          })}
        </tr>
      );
    });
  }
  return rows;
}

function th(T) { return { padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}` }; }
function td(T) { return { padding: "6px 10px", borderBottom: `1px solid ${T.border}` }; }
function btnMini(T) { return { background: "transparent", border: `1px solid ${T.borderHi}`, color: T.textSub, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }; }
