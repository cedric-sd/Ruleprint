# ADR-0004: Ids provisórios, fingerprint provisório e o pipeline do `scan`

- **Status:** aceito
- **Data:** 2026-09-04

## Contexto

O M3 entrega `ruleprint scan`, `serve` e `build`, o que obriga a produzir um `ruleprint.json`
completo antes de existirem o lock e o fingerprint de AST normalizada (M4). Cada regra precisa de
`id`, `fingerprint` e `status`, e a UI precisa linkar arquivo/linha no GitHub, o que o schema v0.1
não permitia. Também era preciso decidir como os pacotes rodam sob Node (`npx ruleprint`) sem
abandonar a resolução por fonte nos testes, e como o `serve` avisa o navegador de mudanças.

## Decisão

**Ids provisórios por hash estável.** `id = "RP-" + (fnv1a32(collector + "\0" + título) mod 10^6)`
com seis dígitos e zero à esquerda. O mesmo teste recebe o mesmo id em qualquer execução e em
qualquer ordem de arquivos, sem depender de estado. Colisão dentro de um documento resolve por
incremento a partir do valor colidido, com os candidatos ordenados de forma determinística
(coletor, título, arquivo, linha). Renomear o teste muda o id; o lock do M4 passa a ser a
memória que preserva ids através de renomeações.

**Fingerprint provisório.** `sha256:` + SHA-256 de `collector\ntítulo\narquivo:símbolo` de cada
fonte. Calculado em `packages/core` com `globalThis.crypto.subtle` (Web Crypto, disponível em
Node 20 sem importar `node:crypto`, respeitando a pureza do core). É um placeholder honesto: muda
quando a regra muda de nome ou de lugar, não quando a condição muda. O M4 substitui pela AST
normalizada sem alterar o formato do campo.

**`status` inicial é `pending`** para toda regra emitida pelo `scan`; `approved`, `drifted` e
`orphan` só existem com lock.

**`project.repository`** entra no schema como campo opcional (`^https?://`). O `scan` preenche a
partir de `git remote get-url origin`, normalizando `git@host:owner/repo.git` e URLs `https`
para `https://host/owner/repo`. A UI monta `${repository}/blob/${commit ?? 'HEAD'}/${file}#L${line}`.
`specVersion` continua `0.1`: enquanto pré-release, campos opcionais novos não incrementam a
versão; a partir do M5 toda mudança de schema incrementa.

**Dist para Node, fontes para testes.** Cada pacote emite `dist/` com `tsc -b` (project
references). `exports` aponta `default`/`types` para `dist` e expõe a condição customizada
`ruleprint-source` para `src`; `tsconfig` de typecheck usa `customConditions`, o vitest usa alias
para `packages/*/src`. O CLI publica `bin` em `dist/bin.js`; a UI é buildada pelo Vite e servida do
`dist` do pacote `@ruleprint/ui`, localizado em runtime via `require.resolve`.

**Hot reload por Server-Sent Events**, não WebSocket. O brief citava WebSocket, mas SSE resolve o
caso (servidor → navegador, "recarregue") com `node:http` puro, sem dependência (`ws`) e sem
handshake. O observador de arquivos é `fs.watch(dir, { recursive: true })` do Node, com debounce,
em vez de `chokidar`.

**`init` = `scan` + próximos passos.** É o comando de primeira vez do README; `scan` fica para CI.

## Consequências

- Ids de seis dígitos são menos legíveis que `RP-0042`, mas estáveis. Quando o lock existir, ids
  já aprovados nunca mudam por renomeação; novos continuam vindo do hash.
- Um `ruleprint.json` gerado antes do M4 terá todos os `status: pending`; o `check` do M4 é o
  primeiro a produzir outros estados.
- Consumidores que validem só com o JSON Schema v0.1 antigo rejeitarão `project.repository`
  (objetos fechados). Aceito por ser pré-release; a política de versão muda no M5.
- `fs.watch` recursivo depende do suporte do sistema (Linux, macOS, Windows em Node ≥ 20); sem
  ele o `serve` avisa e continua sem hot reload.
- Publicar no npm exige `pnpm build` antes de `changeset publish`; o script `release` encadeia os
  dois.
