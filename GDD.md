# Myth TD — Game Design Document

*Última atualização: 2026-10-03*

## Visão Geral

**Myth TD** é um tower defense roguelite: divindades e criaturas de diferentes panteões mitológicos defendem um núcleo central contra hordas crescentes de inimigos, em runs curtas e intensas de 10 a 20 minutos.

**Pilares de design:**

- **Hordas, não corredores** — inimigos avançam de todas as direções em um grid, não em lanes fixas.
- **Runs curtas, decisões rápidas** — cada partida dura 10-20min; build e posicionamento acontecem em tempo real, sem pausas longas de planejamento.
- **Mitologia como identidade de conteúdo** — cada torre é uma figura mitológica reconhecível, agrupada em panteões com visual e papel distintos.
- **Progressão dupla** — poder temporário dentro da run (builds, upgrades) + progressão permanente entre runs (desbloqueios).
- **Zero fricção** — joga no navegador, sem instalação, sem conta; progresso salvo localmente no dispositivo.

## Core Gameplay Loop

**Dentro da run:** o jogador escolhe onde posicionar torres no grid; o núcleo central precisa sobreviver a ondas crescentes de inimigos que avançam das bordas em direção ao centro. Não há personagem controlável — toda ação do jogador é construir, posicionar, fazer upgrade e evoluir torres. Entre picos de inimigos, o jogador gasta recursos ganhos em combate para expandir seu arsenal.

**Entre runs (meta):** ao fim de cada run (vitória ou derrota), recursos permanentes ganhos são convertidos em desbloqueios e upgrades que tornam a próxima run mais forte desde o início — o gancho de replay típico do gênero survivor.

## Grid e Núcleo

- O mapa é um grid NxM (dimensão exata a validar em playtest; ponto de partida sugerido: 9x9 ou 11x11 para caber em runs de 10-20min).
- O **núcleo** fica no centro geométrico do grid; perder toda a sua vida encerra a run em derrota.
- Cada torre ocupa uma célula do grid. Nem toda célula é construível — células muito próximas do núcleo podem ficar reservadas, e obstáculos podem bloquear outras.
- Inimigos **não seguem corredores fixos**: entram pelas bordas do grid e se movem em direção ao núcleo contornando torres e obstáculos, pressionando de todos os lados ao mesmo tempo — esse é o elemento "survivor" da fórmula.
- O alcance de cada torre é definido em **células do grid**, não em pixels, permitindo padrões de alcance distintos por torre (linha, cruz, diamante, anel, cone) que reforcem a identidade mitológica de cada uma.

## Torres Mitológicas

Cada torre representa uma figura mitológica, agrupada por **panteão** (grego, nórdico, egípcio — outros a definir). Panteões funcionam como "elementos" para futuras sinergias e afinidades entre torres.

**Regra central: só 1 torre de cada tipo pode existir no mapa ao mesmo tempo.** Não dá pra empilhar vários Zeus — cada god é único na run. Essa restrição é o que torna o elenco de torres o verdadeiro espaço de decisão do jogo (em vez de "qual torre é melhor pra spammar", a pergunta vira "qual combinação de deuses eu monto nesta run"), e é a razão pela qual o panteão grego precisa de um elenco mínimo (~8 torres) para sustentar uma run inteira.

**Elenco grego implementado no protótipo (foco atual):**

| Torre | Papel | Padrão de alcance |
| --- | --- | --- |
| Zeus | Dano único alvo, alcance infinito em linha/coluna | Linha |
| Ártemis | Dano único alvo, mesmo alcance de Zeus, cadência bem mais rápida e dano menor por tiro | Linha |
| Poseidon | Dano em área — atinge TODOS os inimigos em sua linha/coluna, não só o mais próximo | Linha (área) |
| Ares | Dano único alvo muito alto, alcance curto | Losango |
| Atena | Dano em área circular, alcance médio | Raio |
| Deméter | Dano em área, alcance curto, cadência rápida e dano baixo por tiro (desgaste) | Cruz |
| Hera | Passiva — não ataca; enquanto viva no mapa, +15% de dano em TODAS as outras torres | Aura global |
| Hades | Passiva — não ataca; retarda (-50% velocidade) inimigos dentro do seu raio | Aura local |
| Hermes | Passiva — não ataca; dobra a regeneração passiva de Favor | Aura global |

**Torre extra de outro panteão (implementada antes do pivô de foco para o grego):**

| Torre | Panteão | Papel | Padrão de alcance |
| --- | --- | --- | --- |
| Thor | Nórdico | Dano em área, alcance curto | Cruz |

O panteão egípcio e outras torres gregas adicionais ficam para depois — ver Escopo do MVP e Roadmap.

**Identidade visual por torre**: além da paleta de cor, cada torre tem uma silhueta própria (não é só o mesmo boneco recolorido) — Hera usa um vestido que se alarga em camadas até a bainha, Ares tem um elmo fechado cobrindo quase o rosto todo (só a fresta dos olhos aparece, brilhando), Atena tem elmo coríntio com crista e escudo redondo, Ártemis usa túnica curta (pernas de fora) com aljava de flechas nas costas, Poseidon empunha um tridente grande de 3 pontas, Hermes tem sandálias aladas ecoando o capacete alado. Zeus, Thor, Hades e Deméter mantiveram a silhueta original (já distintas via arma/capuz/coroa).

**Menu lateral de torres** (estilo BloonsTD): cada torre aparece como um ícone (recorte da cabeça/cocar da própria sprite, não um emoji genérico — mais fácil de reconhecer) + nome + um botão de interrogação que mostra, ao passar o mouse, uma descrição em linguagem direta do que a torre faz (substituindo o jargão "linha/coluna" por frases tipo "acerta todos os inimigos na sua linha e coluna de uma vez"). Dividido em duas seções, **Ativo** (as 7 torres que atacam) e **Passivo** (Hera/Hades/Hermes, que só emanam aura) — deixa claro de cara que essas três não vão disparar nada.

**Navegação durante a run**: um botão "☰ Menu" na barra superior pausa a simulação e volta pro menu principal sem perder o progresso em memória (só não fica persistido até clicar em Salvar) — complementa Salvar/Carregar pra quem só quer sair rápido.

## Inimigos e Ondas

- Inimigos nascem nas bordas do grid, de múltiplas direções simultaneamente, aumentando em número e variedade com o tempo — estilo horda de survivor, não ondas numeradas rígidas.
- **Escalonamento por tempo decorrido**: a cada X segundos de run, mais inimigos spawnam; cada arquétipo passa a poder aparecer a partir de um certo tempo decorrido (seleção por peso aleatório entre os arquétipos já liberados), como na curva de dificuldade de Vampire Survivors.
- **Chefes** aparecem em marcos de tempo fixos como picos de dificuldade e fontes de recompensa maior. Implementado: um chefe (titã) aos 5min, com banner de aviso na tela. Marcos adicionais (10min, 15min) ficam para quando a run for mais longa que os 10min atuais.

**Arquétipos de inimigo (elenco completo implementado):**

| Arquétipo | Comportamento | Libera a partir de |
| --- | --- | --- |
| Fraco em massa (grunt) | Pressiona pelo número, dano baixo individual | Início da run |
| Rápido | Pouco HP, atravessa defesas antes de serem reforçadas | 30s |
| Especial (curandeiro) | Pulsa a cada poucos segundos e restaura HP de aliados próximos — prioridade de abate | 60s |
| Tanque | Muito HP, avança bem devagar, dano alto se chegar ao núcleo | 90s |
| Chefe (titã) | HP muito alto, spawn único num marco de tempo fixo, recompensa grande | 5min (marco fixo, não aleatório) |

## Progressão na Run

- **Recursos de run**: ganhos ao derrotar inimigos, usados para construir novas torres e fazer upgrade das existentes (nível, dano, alcance).
- **Relíquias/bênçãos**: drops aleatórios ou escolhas periódicas (ao estilo "level up" de survivor) que concedem efeitos passivos globais — ex.: +10% de dano para todas as torres de um panteão.
- **Builds emergentes**: a combinação de torres + relíquias escolhidas numa run determina uma build diferente a cada tentativa, incentivando replay.
- **Evolução de torre**: ao atingir certo nível, ou com certa relíquia, uma torre pode evoluir para uma forma mitológica mais poderosa (ex.: Zeus evolui para uma forma com trovão do Olimpo).

## Meta-progressão

**Implementado.** Moeda permanente: **Ambrosia** (nome resolvido — substitui o antigo placeholder "Favor Divino", eliminando a colisão de nome com o Favor de run). Ganha ao final de cada run (vitória ou derrota), persistida em `localStorage` separado do save de run em andamento (ver Tecnologia), nunca perdida ao começar de novo.

**Fórmula de ganho** (base, antes de modificadores da própria árvore): `floor(tempo_sobrevivido / 10) + abates × 2`. Ou seja, 10s sobrevividos = 1 Ambrosia, cada abate = 2 Ambrosia. Modificada por Plantação de Ambrosia (%), Colheita do Chefe (+50% se o chefe for derrotado) e Favor em Ambrosia (converte Favor que sobrou no fim da run) — ver árvore abaixo.

**Tela de Melhorias**: acessível pelo menu principal, apresentada como uma árvore de habilidades com 5 ramos (colunas) — Favor, Dano, Velocidade, Mítico, Ambrosia —, lado a lado (nunca empilhados verticalmente — a tela rola na horizontal se não couber), cada um partindo de um nó raiz. Os nós filhos têm pré-requisito de nível no nó pai (ex.: só aparecem compráveis depois que o pai atinge X níveis) — é assim que a árvore "ramifica" a partir dos nós raízes originais. **Velocidade de Ataque** começou como filha de Dano das Torres mas virou raiz do próprio ramo — empilhada, ela acabava escondida embaixo de Golpe Perfurante em vez de ficar lado a lado.

| Ramo | Nó | Pré-requisito | Níveis | Custo por nível | Efeito no nível máximo |
| --- | --- | --- | --- | --- | --- |
| Favor | **Favor Inicial** (raiz) | — | 100 | 2× o nível (2, 4, 6... 200) | +100 Favor inicial |
| Favor | Juros do Favor | Favor Inicial nível 10 | 3 | 50 / 100 / 150 | +0.6/s de regeneração de Favor |
| Favor | Primeira Torre Grátis | Favor Inicial nível 5 | 1 | 150 | 1ª torre de cada run não custa Favor |
| Dano | **Dano das Torres** (raiz) | — | 5 (não cumulativo) | 40× o nível (40, 80... 200) | +25% de dano em todas as torres |
| Dano | Fúria Divina | Dano das Torres nível 5 | 3 | 200 / 300 / 400 | 20% de chance de dano crítico (x2) |
| Dano | Golpe Perfurante | Dano das Torres nível 3 | 1 | 250 | Torres de linha (Zeus/Ártemis) passam a acertar todos na linha/coluna, não só o mais próximo |
| Velocidade | **Velocidade de Ataque** (raiz, ramo próprio) | — | 3 (não cumulativo) | 150 / 250 / 350 | 30% de cadência de ataque mais rápida em todas as torres |
| Mítico | **Mítico: Duplicata** (raiz) | — | 1 | 1000 | Escolhe 1 torre (via seletor na própria tela) que pode ter 2 cópias no mapa |
| Mítico | Mítico: Tríade | Duplicata nível 1 | 1 | 2500 | A torre escolhida pode ter até 3 cópias |
| Ambrosia | **Plantação de Ambrosia** (raiz) | — | 5 (não cumulativo) | 40× o nível (40, 80... 200) | +25% de Ambrosia ganha ao fim da run |
| Ambrosia | Colheita do Chefe | Plantação nível 3 | 1 | 300 | +50% de Ambrosia se o chefe for derrotado na run |
| Ambrosia | Favor em Ambrosia | **Colheita do Chefe** nível 1 | 2 | 150 / 300 | Favor restante no fim da run vira Ambrosia (20:1 → 10:1 no nível 2) |

*Correção de design*: "Favor em Ambrosia" inicialmente dependia só de Plantação de Ambrosia nível 1, o que deixava ela disponível sem precisar de Colheita do Chefe — corrigido para depender de Colheita do Chefe nível 1, fazendo o ramo Ambrosia virar uma cadeia linear de verdade (raiz → Colheita → Favor em Ambrosia).

*Nota sobre os valores de Dano das Torres/Plantação de Ambrosia*: a especificação original só trazia nível e bônus percentual (5%/10%/15%/20%/25%), sem custo em Ambrosia explícito — os custos (40 × nível) foram uma decisão de design para preencher essa lacuna, seguindo o mesmo formato linear de Favor Inicial. Ajustável em playtest.

As torres passivas (Hera, Hades, Hermes) ficam de fora da lista de "Duplicata" — o efeito delas é por presença no mapa (um booleano), não por contagem, então uma 2ª cópia não faria nada a mais.

## Estrutura da Run

- **Duração alvo**: 10 a 20 minutos por run.
- **Condição de derrota**: a vida do núcleo chega a zero.
- **Condição de vitória**: sobreviver até o marco de tempo final (ex.: 20min) e/ou derrotar um chefe final.
- **Eventos especiais**: chefe aos 5min (implementado — ver Inimigos e Ondas); ondas de elite e eventos de risco/recompensa (ex.: uma onda extra forte em troca de recompensa maior) ainda não implementados.
- **Ao fim** (vitória ou derrota): tela de resumo com estatísticas da run (tempo sobrevivido, inimigos derrotados, torres usadas) + recursos de meta-progressão ganhos.
- **Controle de velocidade**: botões 1x/2x/4x aceleram a simulação (tempo de jogo passa mais rápido, sem afetar a física/balanceamento — é o mesmo dt, só multiplicado). Pensado pra testar builds e pra quem já manja do jogo não esperar os minutos iniciais mais parados.
- **Menu principal**: tela inicial com Novo Jogo / Carregar Jogo — ao clicar em qualquer um dos dois, vai direto pra tela do jogo. Durante a run dá pra Salvar a qualquer momento; não há botão de voltar ao menu no meio do jogo (redundante com Salvar/Carregar) — só ao fim da run, na tela de resultado.

## Economia

- **Recursos de run (Favor)**: regeneram sozinhos a 1/segundo (mesmo sem abater nenhum inimigo — garante que o jogador sempre tenha alguma ação disponível) e também são ganhos por inimigo derrotado. Usados para construir/upgradar torres. Zeram ao fim da run.
  - *Nomenclatura resolvida*: o recurso permanente entre runs chama-se **Ambrosia** (não mais "Favor Divino") — sem mais colisão de nome com o Favor de run.
- **Recursos permanentes** (Ambrosia): ganhos ao fim da run, usados fora da run na árvore de Melhorias.
- O **custo de uma torre aumenta** com a quantidade já construída daquele tipo no grid, incentivando diversificar a build em vez de concentrar tudo em uma única torre.
- **Vender torre (implementado)**: clicar numa torre já construída a seleciona (anel pulsante vermelho ao redor dela); um botão "Vender" aparece mostrando o reembolso. Reembolso = 50% do Favor efetivamente pago por aquela torre (guardado por torre, não recalculado — uma torre ganha de graça pela melhoria "Primeira Torre Grátis" reembolsa 0). Libera a célula e o slot do tipo (relevante pra quem tem a melhoria Duplicata/Tríade).
- Curva de custo de upgrade, taxa de drop de relíquias e recompensa por chefe ainda precisam de validação em playtest.

## Arte e Áudio

- **Estilo visual**: pixel art (decidido — abandona a opção vetorial flat), com identidade visual distinta por panteão: paletas e iconografia próprias (ex.: dourado/branco para o panteão grego, azul/gelo para o nórdico, dourado/areia para o egípcio).
- **Legibilidade em primeiro lugar**: grid e núcleo precisam continuar claros mesmo com a tela cheia de efeitos — crítico no estilo survivor, onde muitos inimigos e projéteis ocupam a tela ao mesmo tempo.
- **Pré-visualização de alcance**: ao passar o mouse numa célula válida com uma torre selecionada, a área que ela cobriria ali (linha/coluna, cruz, losango ou raio circular, dependendo do padrão) aparece em laranja translúcido — mesma geometria usada pela torre de verdade, sem precisar construir pra descobrir. Junto, um sprite "fantasma" semitransparente da própria torre (na pose de descanso) mostra como ela vai ficar naquela célula.
- **Áudio (implementado)**: 100% procedural via Web Audio API, mesma filosofia das sprites — sem nenhum arquivo de áudio, gerado inteiramente por código no cliente (`src/game/audio.ts`).
  - **Efeitos sonoros**: bipes curtos (osciladores + envelope de volume) pra construir torre, vender, atirar, acertar, abater inimigo, chefe nascendo, núcleo tomando dano, vitória, derrota, compra de melhoria e cliques de UI.
  - **Trilha ambiente**: um drone grave contínuo + notas soltas aleatórias numa escala pentatônica, tocando em intervalos — textura generativa, não uma composição de verdade (limite real de música gerada só por código, como já era esperado). Toca durante a run, para no menu e na tela de Melhorias.
  - **Desbloqueio de áudio**: navegadores exigem um gesto do usuário antes de tocar qualquer som — o `AudioContext` só é criado no primeiro clique em Novo Jogo/Carregar/Melhorias.
  - **Botão de mudo** (🔊/🔇) disponível no menu e durante a run.

**Sprites são geradas por código, não por arquivos de imagem** — cada sprite é uma grade 16x16 definida em TypeScript (formas básicas + pixels à mão para detalhes), com contorno automático e pré-renderização única numa canvas offscreen. Mantém o deploy 100% estático e o bundle minúsculo, sem pipeline de assets.

**Padrão de animação (definido no protótipo, usar para todo conteúdo futuro):**

- **Torres com membro articulado**: o corpo e o braço/arma são sprites separadas; o braço gira em torno do ombro (pivô fixo) para o ciclo de ataque. Evita o problema de "sprite inteira só pulsando" — o movimento é de verdade, não um efeito de escala.
- **Ciclo de ataque em 3 fases**, dirigido por progresso 0→1 ao longo da duração do ataque: **preparação** (recuo, ease-out) → **golpe** (arco rápido, ease-in, é o instante exato em que o dano é aplicado e o efeito visual dispara — não no momento em que a torre "decide" atacar) → **recuperação** (retorno suave à pose de descanso, ease-out). O corpo acompanha com uma inclinação sutil (~20% do ângulo do braço) para dar peso.
- **Idle vivo**: leve oscilação contínua (bob/squash) em todas as entidades, com uma fase própria por instância (seed aleatória) para que não animem em sincronia.
- **Feedback de dano**: flash branco rápido no alvo (via `globalCompositeOperation: "source-atop"`, tingindo só os pixels já desenhados da sprite) + número de dano flutuante que sobe e desvanece sobre o alvo, exibindo o valor exato de cada golpe (inclusive um número por alvo em ataques de área).
- **Morte de inimigo**: gira, encolhe e desaparece (fade) em vez de sumir instantaneamente.
- **Dano ao núcleo**: tremor de posição + flash vermelho curto.

Tudo implementado via transformações de canvas (`translate`/`rotate`/`scale`) em cima das sprites estáticas — sem spritesheets ou frames extras.

## Tecnologia

- **Alvo de deploy**: site estático hospedado no GitHub Pages — sem backend, sem servidor de jogo.
- **Stack decidida**: TypeScript + Vite (build estático), renderização em Canvas 2D puro (sem motor externo).
- **Persistência (implementado, parcial)**: `localStorage`, um slot único, salva manualmente pelo botão "Salvar" — serializa a run em andamento inteira (torres, inimigos, núcleo, Favor, tempo decorrido, chefe já apareceu ou não). "Carregar Jogo" no menu reconstrói a partir daí.
  - *Pendente*: isso ainda é save da **run em andamento**, não da meta-progressão (que nem existe ainda — ver Fase 2 no roadmap). Export/import como texto/arquivo (JSON) também não foi implementado — hoje o save só funciona no mesmo navegador/dispositivo.
- Sem conta de usuário e sem dados enviados a servidores — toda a lógica do jogo roda no cliente.

## Escopo do MVP e Roadmap

Quatro fases; cada uma só avança se o gate (critério de decisão) da fase anterior for validado em playtest.

```
 FASE 0              FASE 1               FASE 2               FASE 3
 Protótipo      ->   MVP jogável     ->   Progressão      ->   Polish final
 Grid + núcleo       Vários panteões      Moeda permanente     Novas torres
 1 torre, 1 tipo      Run de 10-20 min    Save/load local      Chefes + polish

      gate:                gate:                gate:
 Core loop            Run completa         Progressão
 divertido?           sem bugs?            engaja?
```

- **Fase 0 — Protótipo técnico**: grid funcional, núcleo, uma torre, um tipo de inimigo — valida se o core loop (torres fixas + horda vinda de todas as direções) é divertido.
- **Fase 1 — MVP jogável**: múltiplos panteões e tipos de inimigo, run completa de 10-20min, condições de vitória/derrota.
- **Fase 2 — Meta-progressão**: moeda permanente, desbloqueios entre runs, save/load com export/import via localStorage.
- **Fase 3 — Conteúdo e polish**: panteões adicionais, chefes, arte e áudio finais, balanceamento.

Fica fora do MVP (futuro, pós-Fase 3): múltiplos mapas/grids, modos de dificuldade, eventos sazonais, conquistas.

## Questões Abertas e Riscos

- [ ] Dimensão exata do grid (NxM) — validar em playtest qual tamanho equilibra legibilidade e espaço tático.
- [ ] Pathfinding dos inimigos ao redor de torres — definir se torres bloqueiam totalmente a passagem (estilo labirinto) ou são sempre contornáveis.
- [x] Formato da meta-progressão — decidido: árvore de habilidades ramificada (5 ramos, Ambrosia como moeda). Implementado — ver Meta-progressão.
- [ ] Número de panteões e torres no MVP vs. reservados para conteúdo pós-lançamento.
- [ ] Risco de balanceamento: runs muito curtas podem não dar tempo de sentir a progressão das torres; runs muito longas quebram a promessa "curta e intensa".
- [ ] Risco técnico: performance de muitos inimigos simultâneos em Canvas 2D no navegador — validar cedo na Fase 0.
