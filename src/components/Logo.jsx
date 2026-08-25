export function Logo({ T, height = 34, showText = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={height} height={height} viewBox="0 0 48 48" fill="none">
        <path d="M24 10c-8 0-14 6.5-14 15s6 13 14 13 14-5.5 14-13-6-15-14-15z" fill={T.primary} />
        <path d="M24 10c2-3 5-4 8-3-1 3-4 5-7 5" fill={T.leaf} />
      </svg>
      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: height * 0.5, fontWeight: 700, color: T.text, letterSpacing: "-0.3px" }}>
            fruta<span style={{ color: T.primary }}>polpa</span>
          </span>
          {height >= 28 && (
            <span style={{ fontFamily: T.fontBody, fontSize: height * 0.2, fontWeight: 600, color: T.textMuted, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              Auditoria Gerencial
            </span>
          )}
        </div>
      )}
    </div>
  );
}
