-- ══════════════════════════════════════════════════════════════════
-- FRUTA POLPA — AUDIT SYSTEM — SCHEMA CONSOLIDADO (Supabase / Postgres)
-- Versão atualizada em 21/08/2026 — reúne, num script só, tudo que foi
-- aplicado em 3 etapas separadas ao longo do desenvolvimento:
--   1) schema inicial (tabelas + 2 políticas)
--   2) politicas_rls.sql (4 políticas que faltavam)
--   3) atribuir_papeis.sql fica FORA deste arquivo — depende dos e-mails
--      reais criados em Authentication → Users, rode-o separadamente
--      depois de criar as contas.
--
-- Idempotente: pode rodar em um banco já existente (remove e recria).
-- ══════════════════════════════════════════════════════════════════

-- ─── LIMPEZA — remove tabelas antigas, se existirem ─────────────
drop table if exists alertas_anomalia cascade;
drop table if exists dre_linhas cascade;
drop table if exists titulos_1008 cascade;
drop table if exists descontos_concedidos cascade;
drop table if exists lotes_importacao cascade;
drop table if exists perfis cascade;
drop type if exists user_role cascade;

-- ─── USUÁRIOS E PAPÉIS ───────────────────────────────────────────
create type user_role as enum ('importador', 'visualizador', 'admin');

create table perfis (
  id uuid references auth.users primary key,
  nome text not null,
  papel user_role not null default 'visualizador',
  criado_em timestamptz default now()
);

-- ─── LOTES DE IMPORTAÇÃO (histórico/versionamento) ──────────────
create table lotes_importacao (
  id uuid primary key default gen_random_uuid(),
  rotina text not null,              -- '2107' | '750-222' | '124-750' | '750-caixa10'
  mes_referencia date not null,      -- sempre dia 01 do mês (ex: 2026-05-01)
  importado_por uuid references perfis(id),
  importado_em timestamptz default now(),
  substituido_por uuid references lotes_importacao(id),
  ativo boolean default true,
  nome_arquivo_original text,
  linhas_importadas integer
);

-- ─── DESCONTOS CONCEDIDOS (Rotina 2107, transação a transação) ──
create table descontos_concedidos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes_importacao(id) not null,
  nota integer not null,
  data date not null,
  historico text,
  valor numeric(14,2) not null,
  data_1008 date,
  cliente text,
  encontrado_1008 boolean default true
);
create index idx_desc_data on descontos_concedidos(data);
create index idx_desc_nota on descontos_concedidos(nota);

-- ─── BASE ROTINA 1008 (títulos, usada no cruzamento) ────────────
create table titulos_1008 (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes_importacao(id) not null,
  data date not null,
  nota integer not null,
  conta integer,
  cod integer,
  cliente text,
  valor numeric(14,2),
  tipo text
);
create index idx_1008_nota on titulos_1008(nota);

-- ─── DRE — LINHAS ESTRUTURADAS (contábil + gerencial) ───────────
create table dre_linhas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes_importacao(id) not null,
  mes_referencia date not null,
  codigo_conta text,
  linha_numero integer,              -- 138, 209, 211 etc.
  descricao text not null,
  valor numeric(14,2) not null,
  regime text not null default 'competencia' check (regime in ('competencia','caixa')),
  bloco text check (bloco in ('contabil','gerencial')),
  origem_rotina text,
  memoria_calculo text                -- JSON serializado (ex: saldoCompetencia/saldoCaixa da linha 138)
);
create index idx_dre_mes on dre_linhas(mes_referencia);
create index idx_dre_linha on dre_linhas(linha_numero);

-- ─── ALERTAS DE ANOMALIA (fora da curva) ────────────────────────
create table alertas_anomalia (
  id uuid primary key default gen_random_uuid(),
  dre_linha_id uuid references dre_linhas(id),
  mes_referencia date not null,
  valor_atual numeric(14,2),
  media_historica numeric(14,2),
  variacao_pct numeric(6,2),
  nivel text check (nivel in ('atencao','critico')),
  nota_explicativa text,
  resolvido boolean default false,
  criado_em timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════════
-- RLS (Row Level Security) — TODAS as políticas, incluindo as 4 que
-- faltavam no schema original (sem elas, login funcionava mas leitura/
-- gravação de dados ficava bloqueada silenciosamente).
-- ══════════════════════════════════════════════════════════════════

alter table dre_linhas enable row level security;
alter table lotes_importacao enable row level security;
alter table perfis enable row level security;

-- dre_linhas: leitura liberada a qualquer pessoa logada
create policy "visualizadores leem tudo" on dre_linhas
  for select using (true);

-- dre_linhas: gravação só p/ importador ou admin
create policy "importador grava linhas" on dre_linhas
  for insert with check (
    (select papel from perfis where id = auth.uid()) in ('importador','admin')
  );

-- lotes_importacao: leitura liberada (necessária p/ recarregar histórico)
create policy "leitura liberada" on lotes_importacao
  for select using (true);

-- lotes_importacao: criação só p/ importador ou admin
create policy "so importador escreve" on lotes_importacao
  for insert with check (
    (select papel from perfis where id = auth.uid()) in ('importador','admin')
  );

-- lotes_importacao: atualização (marcar lote antigo como substituído)
create policy "importador atualiza seus lotes" on lotes_importacao
  for update using (
    (select papel from perfis where id = auth.uid()) in ('importador','admin')
  );

-- perfis: cada um só lê o próprio perfil (necessário p/ o login saber o papel)
create policy "cada um le seu proprio perfil" on perfis
  for select using (auth.uid() = id);

-- ─── CONFIRMAÇÃO ─────────────────────────────────────────────────
select 'Schema consolidado criado com sucesso.' as status;
select table_name from information_schema.tables where table_schema='public' order by table_name;
select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename;
