import { useState, useMemo, Fragment } from "react";
import { DRE_NODES } from "../lib/dreNodes.js";
import { getValorNode, REF } from "../lib/dreReference.js";
import { fechamentosNoMes, fechamentosNoPeriodo } from "../lib/fechamentos.js";

const PCT_ROWS = new Set([204, 214, 219]); // Lucratividade Contábil / Gerencial / c/ Subvenções
const PCT_PARA_LINHA_MONEY = { 204: 203, 214: 213, 219: 218 }; // linha % -> linha em R$ correspondente, p/ acumular certo
const HEADER_TOP = 0; // agora relativo ao próprio painel de rolagem (não mais à página)
const ALTURA_LINHA1 = 46; // altura da 1ª linha do cabeçalho (mês + "N fech.") — usada p/ grudar a 2ª linha

function fmtMoeda(n) {
  if (n === null || n === undefined) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
function fmtPctSimples(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// Agrupa a lista plana em seções: cada nó level=0 é um cabeçalho, e os
// nós level 1/2 seguintes (até o próximo level=0) são seus filhos.
function agruparSecoes(nodes) {
  const secoes = [];
  let atual = null;
  for (const n of nodes) {
    if (n.level === 0) {
      atual = { header: n, children: [] };
      secoes.push(atual);
    } else if (atual) {
      atual.children.push(n);
    }
  }
  return secoes;
}

export default function DreHierarquica({ T, meses, mesesLabel, overrides, importedFlags }) {
  const secoes = useMemo(() => agruparSecoes(DRE_NODES), []);
  const porRow = useMemo(() => Object.fromEntries(DRE_NODES.map((n) => [n.row, n])), []);
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [notaAberta, setNotaAberta] = useState(null);
  const [mostrarPct, setMostrarPct] = useState(false);
  // Fechamentos = sextas-feiras do mês. Ver lib/fechamentos.js.
  const [porFechamento, setPorFechamento] = useState(false);
  const fechamentosPorMes = useMemo(() => Object.fromEntries(meses.map((m) => [m, fechamentosNoMes(m)])), [meses]);
  const totalFechamentos = useMemo(() => fechamentosNoPeriodo(meses), [meses]);

  const toggle = (row) => setExpandidas((prev) => {
    const next = new Set(prev);
    next.has(row) ? next.delete(row) : next.add(row);
    return next;
  });
  const expandirTudo = () => setExpandidas(new Set(secoes.map((s) => s.header.row)));
  const recolherTudo = () => setExpandidas(new Set());

  // valor CHEIO da linha no mês (sem normalização) — é o que alimenta os %
  function valorBruto(node, mes) {
    return getValorNode(node, mes, overrides);
  }
  // valor EXIBIDO — se "por fechamento" estiver ligado, divide pelo nº de
  // sextas-feiras do mês. Linhas que já são % ficam intocadas.
  function valorDaLinha(node, mes) {
    const bruto = valorBruto(node, mes);
    const live = Boolean(importedFlags[mes]?.[node.row]);
    if (!porFechamento || PCT_ROWS.has(node.row) || typeof bruto !== "number") return { valor: bruto, live };
    const f = fechamentosPorMes[mes];
    return { valor: f ? bruto / f : null, live };
  }
  function pctSobre(node, mes) {
    if (PCT_ROWS.has(node.row)) return null; // já é % — não faz sentido % de %
    // Bloco contábil (linhas < 201): % sobre a Receita dos Produtos Vendidos (linha 4)
    // Bloco gerencial (linhas >= 201): % sobre o Faturamento Gerencial (linha 201)
    // (o % não muda com "por fechamento" — é razão entre duas linhas do mesmo mês)
    const base = node.row < 201 ? REF.receitaBruta[mes] : REF.faturamentoGerencial[mes];
    const valor = valorBruto(node, mes);
    if (!base || valor === null || valor === undefined) return null;
    return (valor / base) * 100;
  }

  // Total acumulado dos meses carregados (soma simples para valores em R$;
  // para linhas de % recalcula com base no acumulado da linha em R$
  // correspondente ÷ acumulado da base certa — nunca soma %).
  const totalFatGerencial = useMemo(() => meses.reduce((s, m) => s + (REF.faturamentoGerencial[m] || 0), 0), [meses]);
  const totalReceitaBruta = useMemo(() => meses.reduce((s, m) => s + (REF.receitaBruta[m] || 0), 0), [meses]);
  function somaBrutaDaLinha(node) {
    return meses.reduce((s, m) => s + (valorBruto(node, m) || 0), 0);
  }
  function totalDaLinha(node) {
    if (PCT_ROWS.has(node.row)) {
      const moneyRow = porRow[PCT_PARA_LINHA_MONEY[node.row]];
      if (!moneyRow || !totalFatGerencial) return null;
      return (somaBrutaDaLinha(moneyRow) / totalFatGerencial) * 100;
    }
    const soma = somaBrutaDaLinha(node);
    if (!porFechamento) return soma;
    return totalFechamentos ? soma / totalFechamentos : null;
  }
  function totalPctSobre(node) {
    if (PCT_ROWS.has(node.row)) return null;
    const base = node.row < 201 ? totalReceitaBruta : totalFatGerencial;
    if (!base) return null;
    return (somaBrutaDaLinha(node) / base) * 100;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={expandirTudo} style={btnMini(T)}>Expandir tudo (analítico)</button>
        <button onClick={recolherTudo} style={btnMini(T)}>Recolher tudo (sintético)</button>
        <button onClick={() => setMostrarPct((v) => !v)} style={btnMini(T, mostrarPct)}>
          {mostrarPct ? "▾ Ocultar % Sobre" : "▸ Mostrar % Sobre"}
        </button>
        <button onClick={() => setPorFechamento((v) => !v)} style={btnMini(T, porFechamento)}
          title="Divide cada linha pelo nº de fechamentos (sextas-feiras) do mês. Um mês de 5 sextas fatura mais que um de 4 — comparar sem normalizar distorce a leitura.">
          {porFechamento ? "✓ Por fechamento" : "○ Por fechamento"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: porFechamento ? T.gold : T.textMuted, marginBottom: 10 }}>
        Fechamentos (sextas-feiras) no período: <b>{totalFechamentos}</b> — {meses.map((m) => `${mesesLabel[m]} ${fechamentosPorMes[m]}`).join(" · ")}
        {porFechamento && <span> &nbsp;·&nbsp; ⚙ valores exibidos <b>por fechamento</b> (as linhas de % continuam sendo % do mês cheio)</span>}
      </div>
      <div style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle(T), textAlign: "left", position: "sticky", left: 0, top: HEADER_TOP, background: T.bg, zIndex: 3, width: 300, minWidth: 300, maxWidth: 300 }}>Linha</th>
              {meses.map((m) => (
                <th key={m} colSpan={mostrarPct ? 2 : 1} style={{ ...thStyle(T), textAlign: mostrarPct ? "center" : "right", whiteSpace: "nowrap", position: "sticky", top: HEADER_TOP, background: T.bg, zIndex: 2 }}>
                  {mesesLabel[m]}
                  <span style={{ display: "block", fontSize: 9, fontWeight: 400, color: T.textMuted }}>{fechamentosPorMes[m]} fech.</span>
                </th>
              ))}
              <th colSpan={mostrarPct ? 2 : 1} style={{ ...thStyle(T), textAlign: mostrarPct ? "center" : "right", whiteSpace: "nowrap", position: "sticky", top: HEADER_TOP, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>
                Total ({meses.length}m)
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, color: T.primary, opacity: 0.8 }}>{totalFechamentos} fech.</span>
              </th>
            </tr>
            {mostrarPct && (
              <tr>
                <th style={{ ...thStyle(T), position: "sticky", left: 0, top: HEADER_TOP + ALTURA_LINHA1, background: T.bg, zIndex: 3 }}></th>
                {meses.map((m) => (
                  <Fragment key={m}>
                    <th style={{ ...thStyle(T), textAlign: "right", fontSize: 10, position: "sticky", top: HEADER_TOP + ALTURA_LINHA1, background: T.bg, zIndex: 2 }}>Valor</th>
                    <th style={{ ...thStyle(T), textAlign: "right", fontSize: 10, position: "sticky", top: HEADER_TOP + ALTURA_LINHA1, background: T.bg, zIndex: 2, color: T.gold }}>% Sobre</th>
                  </Fragment>
                ))}
                <th style={{ ...thStyle(T), textAlign: "right", fontSize: 10, position: "sticky", top: HEADER_TOP + ALTURA_LINHA1, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>Valor</th>
                <th style={{ ...thStyle(T), textAlign: "right", fontSize: 10, position: "sticky", top: HEADER_TOP + ALTURA_LINHA1, background: T.primaryDim, zIndex: 2, color: T.primary }}>% Sobre</th>
              </tr>
            )}
          </thead>
          <tbody>
            <TituloSecao T={T} texto="DRE CONTÁBIL" colSpan={meses.length * (mostrarPct ? 2 : 1) + 1 + (mostrarPct ? 2 : 1)} />
            {secoes.map((sec, idx) => (
              <FragmentComTitulo key={sec.header.row}
                T={T} sec={sec} meses={meses} mostrarPct={mostrarPct}
                isPct={PCT_ROWS.has(sec.header.row)} isExpanded={expandidas.has(sec.header.row)}
                temFilhos={sec.children.length > 0}
                temNota={Object.keys(sec.header.comments || {}).length > 0}
                notaAberta={notaAberta} setNotaAberta={setNotaAberta}
                toggle={toggle} valorDaLinha={valorDaLinha} pctSobre={pctSobre}
                totalDaLinha={totalDaLinha} totalPctSobre={totalPctSobre}
                inserirTituloGerencialAntes={sec.header.row === 201}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TituloSecao({ T, texto, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "10px 10px", background: T.primaryDim, borderTop: `2px solid ${T.primary}`, borderBottom: `1px solid ${T.primary}`, fontWeight: 800, fontSize: 13, color: T.primary, letterSpacing: 0.5, position: "sticky", left: 0 }}>
        {texto}
      </td>
    </tr>
  );
}

function FragmentComTitulo({ T, sec, meses, mostrarPct, isPct, isExpanded, temFilhos, temNota, notaAberta, setNotaAberta, toggle, valorDaLinha, pctSobre, totalDaLinha, totalPctSobre, inserirTituloGerencialAntes }) {
  const colSpanTotal = meses.length * (mostrarPct ? 2 : 1) + 1 + (mostrarPct ? 2 : 1);
  const rows = [];
  if (inserirTituloGerencialAntes) {
    rows.push(<TituloSecao key="titulo-gerencial" T={T} texto="DRE GERENCIAL" colSpan={colSpanTotal} />);
  }

  rows.push(
    <tr key={sec.header.row} style={{ background: isPct ? T.goldDim : T.card }}>
      <td style={{ ...tdStyle(T), fontWeight: 700, position: "sticky", left: 0, background: isPct ? T.goldDim : T.card, color: isPct ? T.gold : T.text, width: 300, minWidth: 300, maxWidth: 300, overflow: "hidden" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {temFilhos && (
            <button onClick={() => toggle(sec.header.row)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11, padding: 0 }}>
              {isExpanded ? "▾" : "▸"}
            </button>
          )}
          {!temFilhos && <span style={{ width: 12 }} />}
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", marginRight: 2 }}>{sec.header.row}</span>
          {sec.header.label}
          {temNota && (
            <button onClick={() => setNotaAberta(notaAberta === sec.header.row ? null : sec.header.row)} title="Ver nota explicativa" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>💬</button>
          )}
        </span>
      </td>
      {sec.header && meses.map((m) => {
        const { valor, live } = valorDaLinha(sec.header, m);
        const pct = mostrarPct ? pctSobre(sec.header, m) : null;
        return (
          <Fragment key={m}>
            <td style={{ ...tdStyle(T), textAlign: "right", fontWeight: 700, color: live ? T.leaf : (isPct ? T.gold : T.text), whiteSpace: "nowrap" }}>
              {isPct ? fmtPct(valor) : fmtMoeda(valor)}
            </td>
            {mostrarPct && (
              <td style={{ ...tdStyle(T), textAlign: "right", color: T.gold, fontSize: 11, whiteSpace: "nowrap" }}>
                {pct === null ? "—" : fmtPctSimples(pct)}
              </td>
            )}
          </Fragment>
        );
      })}
      {(() => {
        const totalValor = totalDaLinha(sec.header);
        const totalPct = mostrarPct ? totalPctSobre(sec.header) : null;
        return (
          <Fragment key="total">
            <td style={{ ...tdStyle(T), textAlign: "right", fontWeight: 700, color: isPct ? T.gold : T.primary, whiteSpace: "nowrap", background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>
              {isPct ? fmtPct(totalValor / 100) : fmtMoeda(totalValor)}
            </td>
            {mostrarPct && (
              <td style={{ ...tdStyle(T), textAlign: "right", color: T.primary, fontSize: 11, whiteSpace: "nowrap", background: T.primaryDim }}>
                {totalPct === null ? "—" : fmtPctSimples(totalPct)}
              </td>
            )}
          </Fragment>
        );
      })()}
    </tr>
  );

  if (temNota && notaAberta === sec.header.row) {
    rows.push(
      <tr key={sec.header.row + "-nota"}>
        <td colSpan={colSpanTotal} style={{ padding: "8px 14px", background: T.goldDim, borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textSub }}>
          {Object.entries(sec.header.comments).map(([mes, texto]) => (
            <div key={mes} style={{ marginBottom: 4 }}><b style={{ color: T.text }}>{mes}:</b> {texto}</div>
          ))}
        </td>
      </tr>
    );
  }

  if (isExpanded) {
    sec.children.forEach((child) => {
      const temNotaChild = Object.keys(child.comments || {}).length > 0;
      rows.push(
        <tr key={child.row}>
          <td style={{ ...tdStyle(T), paddingLeft: 14 + child.level * 16, position: "sticky", left: 0, background: T.bg, color: T.textSub, fontWeight: child.total ? 700 : 400, width: 300, minWidth: 300, maxWidth: 300, overflow: "hidden" }}>
            {child.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{child.conta}</span>}
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>{child.row}</span>
            {child.label}
            {temNotaChild && (
              <button onClick={() => setNotaAberta(notaAberta === child.row ? null : child.row)} title="Ver nota explicativa" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, marginLeft: 6 }}>💬</button>
            )}
          </td>
          {meses.map((m) => {
            const { valor, live } = valorDaLinha(child, m);
            const pct = mostrarPct ? pctSobre(child, m) : null;
            return (
              <Fragment key={m}>
                <td style={{ ...tdStyle(T), textAlign: "right", color: live ? T.leaf : T.textSub, fontWeight: live ? 700 : (child.total ? 700 : 400), whiteSpace: "nowrap" }}>{fmtMoeda(valor)}</td>
                {mostrarPct && <td style={{ ...tdStyle(T), textAlign: "right", color: T.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>{pct === null ? "—" : fmtPctSimples(pct)}</td>}
              </Fragment>
            );
          })}
          {(() => {
            const totalValor = totalDaLinha(child);
            const totalPct = mostrarPct ? totalPctSobre(child) : null;
            return (
              <Fragment key="total">
                <td style={{ ...tdStyle(T), textAlign: "right", fontWeight: 700, color: T.primary, whiteSpace: "nowrap", background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>{fmtMoeda(totalValor)}</td>
                {mostrarPct && <td style={{ ...tdStyle(T), textAlign: "right", color: T.primary, fontSize: 11, whiteSpace: "nowrap", background: T.primaryDim }}>{totalPct === null ? "—" : fmtPctSimples(totalPct)}</td>}
              </Fragment>
            );
          })()}
        </tr>
      );
      if (temNotaChild && notaAberta === child.row) {
        rows.push(
          <tr key={child.row + "-nota"}>
            <td colSpan={colSpanTotal} style={{ padding: "8px 14px", background: T.goldDim, borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.textSub }}>
              {Object.entries(child.comments).map(([mes, texto]) => (
                <div key={mes} style={{ marginBottom: 4 }}><b style={{ color: T.text }}>{mes}:</b> {texto}</div>
              ))}
            </td>
          </tr>
        );
      }
    });
  }

  return rows;
}

function thStyle(T) { return { padding: "10px 12px", color: T.textMuted, fontWeight: 700, fontSize: 11, borderBottom: `1px solid ${T.border}` }; }
function tdStyle(T) { return { padding: "8px 12px", borderBottom: `1px solid ${T.border}` }; }
function btnMini(T, ativo) { return { background: ativo ? T.primaryDim : "transparent", border: `1px solid ${ativo ? T.primary : T.borderHi}`, color: ativo ? T.primary : T.textSub, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }; }
