-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — HISTÓRICO DOS RESUMOS MENSAIS GERADOS POR IA
-- Criada em 01/09/2026. Rode no SQL Editor do Supabase do projeto.
--
-- Por que existe: o resumo é gerado em cima da base do momento. Se a
-- base for corrigida depois, um resumo novo dirá outra coisa — e as
-- duas versões importam. A de antes explica o que foi apresentado à
-- diretoria naquela data; a de depois, o quadro corrigido. Por isso
-- nada é sobrescrito: cada geração vira uma linha nova, e a lista fica
-- ordenada por data.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- ══════════════════════════════════════════════════════════════════

create table if not exists resumos_mensais (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,          -- sempre dia 01 (ex: 2026-07-01)
  gerado_em timestamptz not null default now(),
  gerado_por uuid references perfis(id),
  texto text not null,
  modelo text,
  -- fotografia dos parâmetros e dos números que geraram ESTE texto:
  -- janela usada, se incluiu o mês analisado, fechamentos, linhas de
  -- resultado. Sem isso não dá pra saber, meses depois, por que o
  -- resumo antigo dizia o que dizia.
  parametros jsonb
);

create index if not exists idx_resumos_mes on resumos_mensais(mes_referencia);
create index if not exists idx_resumos_data on resumos_mensais(gerado_em desc);

alter table resumos_mensais enable row level security;

-- Leitura: qualquer pessoa logada. O histórico é o registro do que foi
-- apresentado, todo mundo do time precisa conseguir consultar.
drop policy if exists "logados leem resumos" on resumos_mensais;
create policy "logados leem resumos" on resumos_mensais
  for select using (auth.uid() is not null);

-- Gravação: qualquer pessoa logada pode gerar e salvar um resumo.
-- Diferente de importar dado, gerar resumo não altera a base — só lê e
-- narra —, então não faz sentido restringir a importador/admin.
drop policy if exists "logados salvam resumos" on resumos_mensais;
create policy "logados salvam resumos" on resumos_mensais
  for insert with check (auth.uid() is not null);

-- Sem policy de update ou delete de propósito: histórico não se
-- reescreve nem se apaga pela aplicação. Se precisar remover algo, é
-- decisão consciente feita aqui no SQL Editor.

select 'Tabela resumos_mensais criada.' as status;
select policyname, cmd from pg_policies where tablename = 'resumos_mensais';
