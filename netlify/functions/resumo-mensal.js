// ═══════════════════════════════════════════════════════════════════
// NETLIFY FUNCTION — RESUMO DE RESULTADO MENSAL
//
// Existe por um motivo só: a chave da API da Anthropic não pode ficar
// no front. O sistema roda inteiro no navegador; qualquer chave embutida
// ali estaria visível pra quem abrisse o DevTools.
//
// O cálculo NÃO acontece aqui. Todos os números chegam prontos, já
// calculados e conferidos no cliente (src/lib/resumoMensal.js). O modelo
// só escreve a narrativa em cima deles.
//
// Variáveis de ambiente no Netlify:
//   ANTHROPIC_API_KEY_FRUTAPOLPA  (obrigatória; ou ANTHROPIC_API_KEY)
//   ANTHROPIC_WORKSPACE_ID        (só para chave "identity-linked")
//
// Existem dois tipos de chave na Anthropic. A clássica é presa a um
// workspace e funciona sozinha. A "identity-linked" é ligada à sua
// identidade e exige o cabeçalho anthropic-workspace-id dizendo em qual
// workspace a requisição age — sem ele a API devolve 400. O id do
// workspace NÃO é segredo (é um identificador), então pode ser uma
// variável comum, sem marcar como secret.
// ═══════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";

// Impressao digital da chave: 8 caracteres do sha256. Nao revela nada do
// valor, mas permite comparar se a chave configurada aqui e a mesma que
// funciona em outro lugar. Sem isso, "chave errada" e "chave certa mal
// salva" sao indistinguiveis de fora.
function impressaoDigital(valor) {
  if (!valor) return null;
  return createHash("sha256").update(valor).digest("hex").slice(0, 8);
}

const MODELO = "claude-sonnet-4-6";
// 1 a 2 páginas de texto corrido. Abaixo de ~2500 o resumo corta no meio.
const MAX_TOKENS = 4000;

const SISTEMA = `Você é o analista de controladoria da Fruta Polpa, uma indústria de processamento de frutas. Escreve para a diretoria: Marcelo (dono), Léo (operações) e a contabilidade.

Sua tarefa é explicar, em texto corrido, por que o resultado do mês ficou acima ou abaixo da média do ano.

REGRAS INEGOCIÁVEIS SOBRE OS NÚMEROS
1. Todos os números já vêm calculados no JSON. Use exatamente os valores recebidos.
2. NUNCA calcule, estime, arredonde de cabeça ou invente um número que não esteja no JSON. Se algo não está lá, não mencione.
3. Não some nem tire média de linhas percentuais. Diferença entre percentuais se diz em "pontos percentuais", nunca em "%".
4. Valores em reais no formato R$ 1.234.567,89.

COMO ESCREVER
- Português brasileiro. Tom técnico-industrial, direto, de quem senta na mesa da diretoria. Sem jargão de consultoria e sem enrolação.
- Sem emoji. Sem travessão. Sem bullet decorativo: escreva parágrafos.
- Uma a duas páginas, entre 400 e 700 palavras.
- Estrutura: (1) um parágrafo dizendo se o mês bateu ou não a média e por quanto, linha de resultado por linha de resultado; (2) dois a quatro parágrafos explicando as contas que puxaram o resultado, sempre citando a conta, o valor do mês e a média, na ordem de quem mais pesou; (3) um parágrafo curto de fechamento com o que a diretoria deveria checar no mês seguinte.
- Quando uma conta explicar sozinha boa parte do desvio, diga isso com todas as letras.
- O número de fechamentos do mês (quantidade de sextas-feiras) é uma variável de volume. Se o mês tiver mais ou menos fechamentos que a média da janela, considere isso na leitura antes de culpar uma conta.
- Não invente causa operacional que os números não sustentam. Se uma conta subiu e você não sabe por quê, diga que subiu e que a causa precisa ser confirmada com a área.`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ erro: "Use POST." }, 405);
  }

  // .trim() de propósito: colar a chave no painel do Netlify costuma
  // trazer espaço ou quebra de linha junto, e aí a API devolve 401.
  const apiKeyBruta = process.env.ANTHROPIC_API_KEY_FRUTAPOLPA || process.env.ANTHROPIC_API_KEY || "";
  const apiKey = apiKeyBruta.trim();
  if (!apiKey) {
    return json({
      erro: "chave_ausente",
      mensagem: "A variável ANTHROPIC_API_KEY_FRUTAPOLPA não está configurada neste ambiente. No Netlify: Site settings, Environment variables. A tabela e as variações continuam funcionando sem ela.",
    }, 503);
  }

  let dados;
  try {
    dados = await req.json();
  } catch {
    return json({ erro: "json_invalido", mensagem: "Corpo da requisição não é JSON válido." }, 400);
  }

  if (!dados || !dados.mes || !Array.isArray(dados.linhasDeResultado)) {
    return json({ erro: "payload_incompleto", mensagem: "Faltam os dados do mês no corpo da requisição." }, 400);
  }

  // ── baseURL explícita, de propósito ──────────────────────────────
  // Se o AI Gateway estiver ligado no site, o Netlify injeta sozinho a
  // variável ANTHROPIC_BASE_URL apontando pro gateway dele, e o SDK da
  // Anthropic LÊ essa variável automaticamente. O resultado é a nossa
  // chave real sendo enviada pro gateway, que espera a chave-placeholder
  // dele e responde 401 SEM CORPO — um erro que não acontece em teste
  // local, porque a máquina do dev não tem essa variável.
  //
  // Fixamos a URL oficial pra usar a conta da Anthropic da Fruta Polpa,
  // com custo e limites próprios, em vez dos créditos de IA do Netlify
  // (que são compartilhados com todos os outros sites da conta).
  const workspaceId = (process.env.ANTHROPIC_WORKSPACE_ID || "").trim();
  const client = new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });

  try {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: SISTEMA,
      messages: [{
        role: "user",
        content: `Escreva o resumo de resultado do mês com base nestes números já apurados.

${JSON.stringify(dados, null, 2)}

Comece direto pelo primeiro parágrafo, sem título e sem preâmbulo.`,
      }],
    });

    if (resposta.stop_reason === "refusal") {
      return json({ erro: "recusa", mensagem: "O modelo recusou a solicitação." }, 502);
    }

    const texto = resposta.content
      .filter((bloco) => bloco.type === "text")
      .map((bloco) => bloco.text)
      .join("\n")
      .trim();

    if (!texto) {
      return json({ erro: "resposta_vazia", mensagem: "O modelo não devolveu texto." }, 502);
    }

    return json({
      texto,
      modelo: MODELO,
      truncado: resposta.stop_reason === "max_tokens",
      uso: {
        entrada: resposta.usage?.input_tokens ?? null,
        saida: resposta.usage?.output_tokens ?? null,
      },
    });
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      // Diagnóstico que NÃO revela a chave: só o formato dela. Serve pra
      // distinguir "colei errado/truncado" de "a chave foi revogada".
      return json({
        erro: "chave_invalida",
        mensagem: "A chave da API foi recusada pela Anthropic (401). Confira o valor de ANTHROPIC_API_KEY_FRUTAPOLPA.",
        diagnostico: {
          comecaComPrefixoEsperado: apiKey.startsWith("sk-ant-"),
          tamanho: apiKey.length,
          tinhaEspacoOuQuebraDeLinha: apiKeyBruta !== apiKey,
          variavelUsada: process.env.ANTHROPIC_API_KEY_FRUTAPOLPA ? "ANTHROPIC_API_KEY_FRUTAPOLPA" : "ANTHROPIC_API_KEY",
          impressaoDigitalDaChave: impressaoDigital(apiKey),
          workspaceConfigurado: workspaceId || null,
          // Mensagem crua da Anthropic — é ela que diz o motivo real.
          // Não contém a chave.
          mensagemDaApi: erro.message || null,
          statusDaApi: erro.status ?? null,
          requestId: erro.request_id || erro.requestID || null,
          runtime: process.version,
          baseUrlInjetadaPeloNetlify: process.env.ANTHROPIC_BASE_URL || null,
        },
      }, 502);
    }
    if (erro instanceof Anthropic.RateLimitError) {
      return json({ erro: "limite", mensagem: "Limite de requisições atingido. Tente de novo em alguns instantes." }, 429);
    }
    if (erro instanceof Anthropic.BadRequestError) {
      // Caso específico e fácil de resolver: chave identity-linked sem
      // o workspace declarado.
      if (/anthropic-workspace-id/i.test(erro.message || "")) {
        return json({
          erro: "workspace_ausente",
          mensagem: "A chave configurada é do tipo identity-linked e exige saber em qual workspace agir. Configure a variável ANTHROPIC_WORKSPACE_ID no Netlify com o id do workspace (ele aparece na URL do console.anthropic.com). Não precisa marcar como secret.",
        }, 400);
      }
      return json({ erro: "requisicao_invalida", mensagem: erro.message }, 400);
    }
    if (erro instanceof Anthropic.APIError) {
      return json({ erro: "api", mensagem: `Erro ${erro.status} na API da Anthropic: ${erro.message}` }, 502);
    }
    return json({ erro: "inesperado", mensagem: String(erro?.message || erro) }, 500);
  }
};
