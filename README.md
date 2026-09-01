# Fruta Polpa — Sistema de Auditoria Gerencial

## O que já funciona
- **DRE hierárquica completa** (186 linhas reais, contábil + gerencial), com mostrar/ocultar por seção, comentários originais da contabilidade (💬) e linhas de lucratividade (%) destacadas.
- **3 linhas 100% automatizadas e validadas contra os dados reais**: 138 (Descontos Concedidos), 209 (Grupo 222), 211 (Grupo 750).
- **Import inteligente**: detecta automaticamente lote (arquivo com uma aba por mês) vs. mês único, e detecta o mês pelo conteúdo quando aplicável.
- **Reconciliação**: compara todo valor importado contra o número já validado manualmente na auditoria.
- **Toggle Competência/Caixa** (afeta hoje a linha 138) e **tema Claro/Escuro**.
- **Detecção de anomalia** configurável (variação % vs. média dos últimos 3 meses), com **coluna de diferença em R$**, filtro de **impacto mínimo** e opção de comparar **por fechamento**.
- **Comparativo de Períodos**: escolhe dois meses (ou dois intervalos) quaisquer e mostra a DRE inteira lado a lado, com diferença em R$, em % e análise vertical dos dois lados.
- **Resumo do Mês**: compara o mês com a DRE média do ano, lista as contas que explicam o desvio e gera um resumo escrito por IA (1 a 2 páginas) via Netlify Function.
- **Fechamentos do mês** (= sextas-feiras) na DRE, no Comparativo e nas Anomalias, com opção de ver todos os números normalizados por fechamento.

### Anomalias — % e R$ juntos
A sensibilidade (%) diz *o quanto* a conta se moveu; o impacto mínimo (R$) diz se esse movimento *vale a conversa*. Uma conta de média R$ 93 que foi para R$ 500 varia +438% e move R$ 407 — com impacto mínimo em R$ 5.000 ela sai da lista. A coluna **Diferença (R$)** é o delta entre o valor do mês e a média dos 3 meses anteriores, e é por ela que a lista vem ordenada por padrão.

### Comparativo de Períodos
Três bases de comparação, porque comparar períodos de tamanhos diferentes em valor cheio distorce a leitura:

| Base | O que faz | Quando usar |
|---|---|---|
| Total | soma pura do período | períodos do mesmo tamanho |
| Média mensal | soma ÷ nº de meses | 1 mês × 1 trimestre |
| Por fechamento | soma ÷ nº de sextas-feiras | qualquer comparação de volume |

A tela avisa quando os dois períodos se sobrepõem ou têm tamanhos diferentes com a base em "Total".

### Resumo do Mês (com IA)
Três camadas na mesma tela: os cards das quatro linhas de resultado (58 Lucro Bruto, 204 Lucratividade Contábil, 214 Lucratividade Gerencial, 219 Lucratividade com as Subvenções) mais a margem bruta em %; a lista das 15 contas analíticas que mais afastaram o mês da média; e a DRE média × mês inteira, linha por linha.

**A média usa uma janela móvel** dos meses já fechados, travada em no máximo 12. O botão "Incluir o mês analisado na média" decide se a janela conta o próprio mês: ligado (padrão), Jul com 7 meses fechados compara contra a média de 7; desligado, contra a média dos 6 anteriores.

**O cálculo não passa pela IA.** Todos os números são apurados no cliente (`src/lib/resumoMensal.js`), conferidos contra a DRE, e só então enviados prontos para a função escrever a narrativa. O modelo é instruído a não calcular nada. As tabelas funcionam mesmo sem a chave da API configurada — só o texto deixa de ser gerado.

Nunca se soma nem se tira média de linha percentual: a média de uma linha de % é sempre lucro acumulado ÷ faturamento acumulado da janela.

### Fechamentos (sextas-feiras)
O número de fechamentos de um mês é a quantidade de sextas-feiras dele — uma variável de volume: um mês com 5 sextas tem capacidade de faturamento estruturalmente maior que um de 4. Em 2026: Jan 5 · Fev 4 · Mar 4 · Abr 4 · Mai 5 · Jun 4 · Jul 5. A regra vive em `src/lib/fechamentos.js` e é usada na DRE (botão "Por fechamento"), no Comparativo (base de comparação) e nas Anomalias (checkbox "Por fechamento", que evita acusar anomalia num mês de 5 fechamentos contra meses de 4).

## Pendente (falta amostra real de dados para automatizar)
- Rotina 2122 (DRE contábil bruta) e Rotina 1464 (Faturamento Gerencial) — hoje usam valor de referência da auditoria manual.
- Rotina 124 pura, grupo de conta 750 (termo 1 da linha 211, hoje só o termo 2/Caixa 10 é 100% auto).
- Regra de caixa para as demais ~40 linhas da DRE (só a 138 tem essa regra definida hoje).

---

## Passo 1 — Rodar localmente (antes de publicar)
```
npm install
npm run dev
```
Abre em `http://localhost:5173`. Sem nenhuma configuração adicional, o app já funciona inteiro em **modo local**: os imports e a DRE funcionam normalmente, só não fica salvo entre sessões (fecha a aba, perde o que foi importado).

---

## Passo 2 — Publicar no Netlify

1. Suba esta pasta para um repositório Git (GitHub/GitLab/Bitbucket) — ou arraste a pasta direto no [app.netlify.com/drop](https://app.netlify.com/drop) para um teste rápido sem Git.
2. No Netlify: **Add new site → Import an existing project** → conecte o repositório.
3. Configurações de build (o `netlify.toml` já deixa isso pronto, mas confira):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Clique em **Deploy**. Em ~1 minuto o site está no ar num link tipo `nome-aleatorio.netlify.app` (pode trocar por um domínio próprio depois em Site settings → Domain management).

Nesse ponto o site já funciona em modo local (sem histórico persistente). Para habilitar persistência de verdade, siga o Passo 3.

---

## Passo 3 — Conectar o Supabase (persistência real + histórico)

### 3.1 Criar o projeto
1. Crie uma conta em [supabase.com](https://supabase.com) (tem plano gratuito, suficiente para começar).
2. **New Project** → escolha um nome (ex: `fruta-polpa-auditoria`), uma senha de banco (guarde essa senha) e a região mais próxima (ex: São Paulo/`sa-east-1`).
3. Aguarde ~2 minutos até o projeto ficar pronto.

### 3.2 Criar as tabelas
1. No painel do Supabase, abra **SQL Editor** (ícone no menu lateral).
2. Abra o arquivo `schema.sql` (nesta mesma pasta), copie todo o conteúdo e cole no editor.
3. Clique em **Run**. Isso cria: `perfis` (usuários e papéis), `lotes_importacao` (histórico/versionamento), `descontos_concedidos`, `titulos_1008`, `dre_linhas` e `alertas_anomalia`.

### 3.3 Pegar as credenciais
1. No painel do Supabase: **Project Settings → API**.
2. Copie dois valores:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (uma chave longa começando com `eyJ...`)

### 3.4 Configurar no Netlify
1. No Netlify: **Site settings → Environment variables → Add a variable**.
2. Adicione as duas:
   - `VITE_SUPABASE_URL` = a Project URL que você copiou
   - `VITE_SUPABASE_ANON_KEY` = a anon public key que você copiou
3. Vá em **Deploys → Trigger deploy → Deploy site** para o Netlify rebuildar com as novas variáveis.

Depois disso, o indicador no topo do site deve mudar de "○ Modo local" para "● Supabase conectado", e as importações passam a ficar salvas de verdade (com histórico de substituições).

### 3.5 (Opcional, mas recomendado) Criar os primeiros usuários
1. No Supabase: **Authentication → Users → Add user** — crie um login para você e um para o Pedro/Wenne (e-mail + senha).
2. No **SQL Editor**, rode (trocando o e-mail e o papel desejado):
   ```sql
   insert into perfis (id, nome, papel)
   select id, 'Pedro Felix', 'importador' from auth.users where email = 'pedro@empresa.com';
   ```
   Papéis disponíveis: `importador` (sobe arquivos), `visualizador` (só consulta), `admin`.
3. O app ainda não tem uma tela de login própria — hoje qualquer pessoa com o link acessa em modo "visualizador" implícito. Adicionar a tela de login é o próximo passo natural de desenvolvimento, quando fizer sentido para o time.

---

---

## Passo 4 — Configurar a IA do Resumo do Mês

A aba **Resumo do Mês** funciona sem nenhuma configuração: mês × média, contas que explicam o desvio e a DRE comparada são todos calculados no navegador. Só o **texto escrito por IA** precisa de chave.

A chave não pode ficar no front (o sistema roda inteiro no navegador; qualquer chave ali fica visível no DevTools). Por isso ela mora numa Netlify Function, em `netlify/functions/resumo-mensal.js`.

1. Pegue uma chave em [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. No Netlify: **Site settings → Environment variables → Add a variable**
   - `ANTHROPIC_API_KEY_FRUTAPOLPA` = a chave (começa com `sk-ant-`)
3. **Deploys → Trigger deploy → Deploy site**.

Modelo usado: `claude-sonnet-4-6`, `max_tokens` 4000 (um resumo de 1 a 2 páginas corta no meio abaixo de ~2500). Custo por resumo gerado: alguns centavos.

**Rodando localmente:** `npm run dev` (Vite puro) não serve funções — o botão de IA vai avisar isso na tela. Para testar a função local, use `netlify dev` com a variável exportada no shell.

---

## Testar se rodou como esperado
- Local (`npm run dev`) e no Netlify publicado, importe os arquivos reais (`2107_...xlsx`, `750_-_grupo_222_...xlsx`, `ROTINA_124_GRUPO_750...xls`, `ROTINA_124_-_GRUPO_538...xlsx`).
- Na aba **DRE**, as linhas 138/209/211 devem ficar verdes.
- Na aba **Reconciliação**, todas as linhas devem mostrar ✅.

## Estrutura do projeto
```
src/
  App.jsx                    ← shell principal, abas, cabeçalho fixo
  theme.js                   ← tokens de cor (dark/light)
  lib/
    dreReference.js          ← valores de referência + cascata de cálculo da DRE
    dreNodes.js               ← as 186 linhas reais da DRE (analítico + comentários)
    supabaseClient.js         ← conexão e função de importarLote()
    parsers/                  ← as regras de cada rotina (138, 209, 211, anomalia)
  lib/
    fechamentos.js            ← nº de fechamentos do mês (= sextas-feiras)
    resumoMensal.js           ← janela da média + comparação mês x média (cálculo puro)
  components/
    DreHierarquica.jsx        ← árvore da DRE com mostrar/ocultar e notas
    ComparativoPeriodos.jsx   ← comparativo entre dois períodos quaisquer
    ResumoDoMes.jsx           ← mês x média do ano + resumo escrito por IA
    AnaliseTrimestral.jsx     ← comparativo 2025 x 2026 por trimestre
    Logo.jsx, AnomalyBadge.jsx
netlify/functions/
  resumo-mensal.js            ← guarda a chave da Anthropic e chama a Messages API
schema.sql                    ← script para rodar no Supabase SQL Editor
```
