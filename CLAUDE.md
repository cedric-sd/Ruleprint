# RulePrint

Ferramenta que gera um "livro de regras" navegável a partir de um repositório,
sem exigir que o dev escreva documentação.

## Antes de qualquer tarefa
Leia `docs/SPEC.md` e `docs/ROADMAP.md`. O schema em `packages/spec` é o contrato:
mudanças nele exigem ADR em `docs/adr/`.

## Regras de trabalho
- `packages/core` é puro: proibido importar `fs`, `path`, `process` ou fazer rede.
- Todo coletor implementa a interface `Collector` e tem teste de snapshot contra um
  fixture em `examples/`.
- Escreva o teste antes da implementação. Sem exceção para coletores.
- Nenhuma dependência nova sem justificativa no PR.
- Commits em Conventional Commits (changesets depende disso).

## Comandos
- `pnpm test` / `pnpm test --watch`
- `pnpm dev` sobe o serve contra `examples/fixture-express-api`
- `pnpm check:golden` compara a saída com os snapshots