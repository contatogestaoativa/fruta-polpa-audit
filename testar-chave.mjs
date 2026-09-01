// ═══════════════════════════════════════════════════════════════════
// TESTE DA CHAVE DA ANTHROPIC — roda local, não expõe a chave.
//
// Como usar:
//   1. Crie um arquivo .env na raiz deste repo com uma linha:
//        ANTHROPIC_API_KEY_FRUTAPOLPA=sk-ant-...
//      (o .env já está no .gitignore, não sobe pro Git)
//   2. node testar-chave.mjs
//
// A saída mostra só status, formato e mensagem da API. Nunca a chave.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import { createHash } from "node:crypto";

function lerChave() {
  const doAmbiente = process.env.ANTHROPIC_API_KEY_FRUTAPOLPA || process.env.ANTHROPIC_API_KEY;
  if (doAmbiente) return { chave: doAmbiente.trim(), origem: "variável de ambiente" };
  try {
    const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
    for (const linha of env.split("\n")) {
      const m = linha.match(/^\s*(?:export\s+)?(ANTHROPIC_API_KEY_FRUTAPOLPA|ANTHROPIC_API_KEY)\s*=\s*(.*)$/);
      if (m) return { chave: m[2].trim().replace(/^["']|["']$/g, ""), origem: `arquivo .env (${m[1]})` };
    }
    return { chave: null, origem: "o .env existe mas não tem a linha da chave" };
  } catch {
    return { chave: null, origem: "não achei nem variável de ambiente nem arquivo .env" };
  }
}

/** Lê qualquer variável do .env (usado para o workspace id, que não é segredo). */
function lerVar(nome) {
  try {
    const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
    for (const linha of env.split("\n")) {
      const m = linha.match(new RegExp(`^\\s*(?:export\\s+)?${nome}\\s*=\\s*(.*)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return null;
}

const { chave, origem } = lerChave();
console.log("origem:", origem);

if (!chave) {
  console.log("\n✗ Sem chave pra testar. Crie o arquivo .env como explicado no topo deste arquivo.");
  process.exit(1);
}

console.log("formato: prefixo sk-ant-", chave.startsWith("sk-ant-") ? "OK" : "AUSENTE", "| tamanho", chave.length);
console.log("impressao digital desta chave:", createHash("sha256").update(chave).digest("hex").slice(0, 8), "(compare com a que o site reporta)");
console.log("\nchamando a API da Anthropic...\n");

const workspaceId = (process.env.ANTHROPIC_WORKSPACE_ID || lerVar("ANTHROPIC_WORKSPACE_ID") || "").trim();
if (workspaceId) console.log("workspace declarado:", workspaceId);

const r = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": chave,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 16,
    messages: [{ role: "user", content: "Responda apenas: ok" }],
  }),
});

const corpo = await r.json().catch(() => ({}));

if (r.ok) {
  console.log("✓ A CHAVE FUNCIONA. HTTP", r.status);
  console.log("  resposta do modelo:", corpo.content?.[0]?.text);
  console.log("\n  Então o problema está na configuração do Netlify, não na chave.");
} else {
  console.log("✗ A API RECUSOU. HTTP", r.status);
  console.log("  tipo:", corpo.error?.type || "(sem tipo)");
  console.log("  mensagem:", corpo.error?.message || "(sem mensagem)");
  console.log("\n  Leitura:");
  if (/anthropic-workspace-id/i.test(corpo.error?.message || "")) {
    console.log("  A CHAVE É VÁLIDA. Ela é do tipo identity-linked e só precisa saber em qual");
    console.log("  workspace agir. Acrescente ao .env uma linha:");
    console.log("    ANTHROPIC_WORKSPACE_ID=<o id que aparece na URL do console.anthropic.com>");
    console.log("  e rode de novo. O id do workspace não é segredo.");
  }
  else if (r.status === 401) console.log("  401 = a chave não é válida. Foi revogada, ou é de uma organização/workspace que não está mais ativo.");
  else if (r.status === 400 && /credit/i.test(corpo.error?.message || "")) console.log("  A chave é válida, mas a organização está sem créditos. Adicione crédito em console.anthropic.com, aba Billing.");
  else if (r.status === 429) console.log("  A chave é válida, só bateu limite de requisição. Tente de novo.");
  else console.log("  Erro fora do previsto. A mensagem acima é da própria Anthropic.");
}
