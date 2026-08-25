// ═══════════════════════════════════════════════════════════════════
// FRUTA POLPA — AUDIT SYSTEM — DESIGN TOKENS (dark + light)
// ═══════════════════════════════════════════════════════════════════

const SHARED = {
  primary: "#E8500D",
  primaryDim: "#E8500D1E",
  gold: "#F2A71B",       // "laranjinha" — destaque das linhas de % (214/219)
  goldDim: "#F2A71B22",
  leaf: "#4C9A2A",
  danger: "#E23D3D",
  warning: "#F2A71B",
  fontDisplay: "'Playfair Display', Georgia, serif",
  fontBody: "'Segoe UI', 'DM Sans', sans-serif",
};

export const THEMES = {
  dark: {
    ...SHARED,
    bg: "#0F0E0D", surface: "#181614", card: "#1E1B18",
    border: "#2A2622", borderHi: "#3A342E",
    text: "#F2EFE9", textSub: "#A8A199", textMuted: "#5C5650",
  },
  light: {
    ...SHARED,
    bg: "#FAF8F5", surface: "#FFFFFF", card: "#FFFFFF",
    border: "#E7DFD5", borderHi: "#D8CDBF",
    text: "#241F1A", textSub: "#6B6259", textMuted: "#9C9186",
  },
};

export function riskColor(T, level) {
  if (level === "critico") return T.danger;
  if (level === "atencao") return T.warning;
  return T.leaf;
}
