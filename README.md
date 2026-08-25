# Fruta Polpa — Sistema de Auditoria Gerencial

## O que já funciona
- **DRE hierárquica completa** (186 linhas reais, contábil + gerencial), com mostrar/ocultar por seção, comentários originais da contabilidade (💬) e linhas de lucratividade (%) destacadas.
- **3 linhas 100% automatizadas e validadas contra os dados reais**: 138 (Descontos Concedidos), 209 (Grupo 222), 211 (Grupo 750).
- **Import inteligente**: detecta automaticamente lote (arquivo com uma aba por mês) vs. mês único, e detecta o mês pelo conteúdo quando aplicável.
- **Reconciliação**: compara todo valor importado contra o número já validado manualmente na auditoria.
- **Toggle Competência/Caixa** (afeta hoje a linha 138) e **tema Claro/Escuro**.
- **Detecção de anomalia** configurável (variação % vs. média dos últimos 3 meses).

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
  components/
    DreHierarquica.jsx        ← árvore da DRE com mostrar/ocultar e notas
    Logo.jsx, AnomalyBadge.jsx
schema.sql                    ← script para rodar no Supabase SQL Editor
```
