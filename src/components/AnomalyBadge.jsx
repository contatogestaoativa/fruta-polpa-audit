import { riskColor } from "../theme.js";

const LABELS = { ok: "Dentro da curva", atencao: "Atenção", critico: "Crítico" };

export function AnomalyBadge({ T, nivel, variacaoPct }) {
  const color = riskColor(T, nivel);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: color + "1E", border: `1px solid ${color}55`, color,
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700,
      fontFamily: T.fontBody,
    }}>
      {nivel === "critico" ? "⛔" : nivel === "atencao" ? "⚠" : "✓"} {LABELS[nivel]}
      {variacaoPct !== null && variacaoPct !== undefined && (
        <span style={{ opacity: 0.75 }}>({variacaoPct > 0 ? "+" : ""}{variacaoPct}%)</span>
      )}
    </span>
  );
}

export function StatCard({ T, label, value, sub, accent }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "16px 18px", flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.textMuted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, color: accent || T.primary, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
