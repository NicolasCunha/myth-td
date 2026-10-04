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

- O mapa é um grid NxM (dimensão exata a validar em playtest; ponto de partida sugerido: 9x9 ou 11x11 para caber em runs de 10-20min). Implementado: 11x11 com células de 64px (janela pensada pra PC).
- O **núcleo** fica no centro geométrico do grid; perder toda a sua vida encerra a run em derrota. Uma barra de vida logo abaixo do orbe diminui e muda de cor (verde → amarelo → vermelho) conforme ele apanha.
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
| Hades | Passiva — não ataca; retarda (-35% velocidade; era -50%, reduzido após simulação mostrar que decidia a run sozinho) inimigos dentro do seu raio | Aura local |
| Hermes | Passiva — não ataca; dobra a regeneração passiva de Favor | Aura global |

**Torre extra de outro panteão (implementada antes do pivô de foco para o grego):**

| Torre | Panteão | Papel | Padrão de alcance |
| --- | --- | --- | --- |
| Thor | Nórdico | Dano em área, alcance curto | Cruz |

**Panteão egípcio (implementado) — torres direcionais.** A gimmick dos egípcios é que o alcance depende da **orientação** da torre: cada um cobre um formato fixo de células relativo a pra onde está virado (ver Orientação abaixo).

| Torre | Formato (virada pra direita, na coluna X) | Alvo |
| --- | --- | --- |
| Rá | Linha reta pra frente até a borda do mapa | Todos |
| Hórus | Só as duas diagonais frontais, até 4 casas | Único (mais próximo), dano alto |
| Anúbis | Cone frontal: 1, depois 3, depois 5 casas de largura | Todos |
| Sekhmet | Pula X+1 e acerta as linhas X+2 e X+3 inteiras | Todos, cadência lenta |
| Thoth | Bloco 3x3 centrado em X+4 (artilharia, nada perto) | Todos |
| Sobek | Só X+1 e X+2 na mesma linha | Único, maior dano do jogo |
| Bastet | As 3 casas encostadas à frente (frente + diagonais) | Todos, cadência rápida |
| Ísis | Só pros lados, até 3 casas de cada lado | Todos |

**Orientação das torres**: ao clicar numa célula pra construir, o jogo entra em **câmera lenta (0.5x)** e o jogador escolhe pra onde a torre fica virada — apontando o mouse pro lado desejado (ou setas/WASD) e confirmando com clique/Enter (Esc ou botão direito cancela). O alcance na orientação atual aparece em tempo real. Para os gregos (e Thor, por enquanto) a orientação é só cosmética; para egípcios — e futuramente nórdicos — define o alcance. Torres direcionais mostram uma setinha dourada na borda da célula indicando a orientação.

**Limite de torres**: no máximo **10 torres** no mapa ao mesmo tempo, com contador "Torres: X/10" abaixo do menu lateral. Provisório — vai dar lugar a um sistema de "deck building" de torres.

**Equipe (team builder)**: antes da run, na tela **Equipe** do menu principal, o jogador escolhe até **10 torres** pra levar — só elas aparecem no menu lateral durante o jogo. A equipe persiste entre sessões (`src/game/team.ts`) e fica fixa durante a run (salva junto no save da run). Sem nenhuma torre na equipe, "Novo Jogo" fica desabilitado.

**Loja de torres**: o jogador começa só com **Zeus**; todas as outras torres são desbloqueadas permanentemente com Ambrosia na tela **Loja** (50 a 220, calibrados pela simulação pra primeira compra sair já na 1ª run — ver `TOWER_PRICES` em `src/game/meta.ts`). Torre recém-comprada entra direto na equipe se houver vaga. Torres bloqueadas aparecem na tela de Equipe esmaecidas, com o preço.

**Configurações** (botão ⚙️ no menu principal, `src/game/settings.ts`): volume de música e efeitos, silenciar tudo, "Rever tutorial na próxima run" e exportar/importar save. Novas opções entram aqui.

**Tutorial guiado** (`src/tutorial.ts`): na primeira run, uma caixa fixa no canto inferior direito conduz o jogador em 10 passos — núcleo, Favor, escolher torre, construir, orientação, selecionar (câmera lenta + cartão da torre), melhorar pelo cartão (com prévia do próximo nível), bênçãos, vender/velocidade e o que fazer fora da run (Loja/Equipe/Melhorias). O elemento relevante da tela fica destacado com contorno dourado pulsante. Passos de leitura congelam o jogo e avançam com "Próximo"; passos de ação avançam sozinhos quando o jogador faz o que foi pedido (e pulam adiante se ele se adiantar). No passo de melhorar, os deuses completam o Favor que falta pro primeiro upgrade (o jogador melhora na hora, sem esperar) e o jogo fica congelado como nos passos de leitura. **"Pular tutorial" fica visível em todos os passos.** Concluído ou pulado, não aparece mais (dá pra rever pelas Configurações).

**Identidade visual por torre**: além da paleta de cor, cada torre tem uma silhueta própria (não é só o mesmo boneco recolorido) — Hera usa um vestido que se alarga em camadas até a bainha, Ares tem um elmo fechado cobrindo quase o rosto todo (só a fresta dos olhos aparece, brilhando), Atena tem elmo coríntio com crista e escudo redondo, Ártemis usa túnica curta (pernas de fora) com aljava de flechas nas costas, Poseidon empunha um tridente grande de 3 pontas, Hermes tem sandálias aladas ecoando o capacete alado. Zeus, Thor, Hades e Deméter mantiveram a silhueta original (já distintas via arma/capuz/coroa).

**Menu lateral de torres** (estilo BloonsTD): cada torre aparece como um ícone (recorte da cabeça/cocar da própria sprite, não um emoji genérico — mais fácil de reconhecer) + nome + um botão de interrogação que mostra, ao passar o mouse, uma descrição em linguagem direta do que a torre faz (substituindo o jargão "linha/coluna" por frases tipo "acerta todos os inimigos na sua linha e coluna de uma vez"). Dividido por grupo em duas colunas: **Gregos · Ativo**, **Gregos · Passivo** (Hera/Hades/Hermes, que só emanam aura), **Nórdico** e **Egípcios · Direcionais**.

**Navegação durante a run**: um botão "☰ Menu" na barra superior pausa a simulação e volta pro menu principal sem perder o progresso em memória (só não fica persistido até clicar em Salvar) — complementa Salvar/Carregar pra quem só quer sair rápido.

- [x] **Confirmar ao sair pro menu (implementado)**: "☰ Menu" pausa a run e abre um diálogo — **Salvar e voltar**, **Voltar sem salvar** ou **Cancelar** (retoma a run de onde parou). Se nada mudou desde o último save (mesmo tempo de jogo), volta direto sem perguntar.

## Inimigos e Ondas

- Inimigos nascem nas bordas do grid, de múltiplas direções simultaneamente, aumentando em número e variedade com o tempo — estilo horda de survivor, não ondas numeradas rígidas.
- **Escalonamento por tempo decorrido**: a cada X segundos de run, mais inimigos spawnam; cada arquétipo passa a poder aparecer a partir de um certo tempo decorrido (seleção por peso aleatório entre os arquétipos já liberados), como na curva de dificuldade de Vampire Survivors.
- **Chefes** aparecem em marcos de tempo fixos como picos de dificuldade e fontes de recompensa maior, sempre com banner de aviso. Implementado: **Titã aos 5:00**, **dois Titãs aos 7:30** (entrando por bordas diferentes) e o **chefe final Tifão aos 9:00**.
- **Tifão, pai dos monstros (chefe final)**: 14.000 de vida, bem lento, invoca 2 monstros ao seu redor a cada 3s e, ao alcançar o núcleo, **não é consumido** — fica pisoteando (12 de dano a cada 2s) até ser derrotado. Barra de vida grande no topo do mapa enquanto vivo. **A run só é vencida ao derrotá-lo**: se os 10 minutos acabarem com ele vivo, a run entra em prorrogação ("DERROTE TIFÃO PARA VENCER") — spawns e música continuam no máximo. Derrotá-lo rende +150 de Ambrosia.
- **Fase final (a partir dos 5:00)**: até aqui a cadência de spawn travava por volta de 1min45 e a dificuldade só subia pela vida dos inimigos; agora, depois dos 5 minutos, o intervalo de spawn volta a cair (até -30% no fim), a vida cresce mais rápido (+0,002·s² além da curva linear) e surgem **elites** (a partir dos 6:00, de 8% a 22% de chance): 2x vida, 1,5x dano, 2x Favor, um pouco maiores e com anel dourado pulsante.

**Arquétipos de inimigo (elenco completo implementado):**

| Arquétipo | Comportamento | Libera a partir de |
| --- | --- | --- |
| Fraco em massa (grunt) | Pressiona pelo número, dano baixo individual | Início da run |
| Rápido | Pouco HP, atravessa defesas antes de serem reforçadas | 30s |
| Especial (curandeiro) | Pulsa a cada poucos segundos e restaura HP de aliados próximos — prioridade de abate | 60s |
| Tanque | Muito HP, avança bem devagar, dano alto se chegar ao núcleo | 90s |
| Chefe (titã) | HP muito alto, recompensa grande | 5:00 (1) e 7:30 (2) — marcos fixos |
| Elite | Variante reforçada de qualquer arquétipo comum (2x vida, 1,5x dano), anel dourado | 6:00 (8% → 22% de chance) |
| Tifão (chefe final) | 14.000 de vida, invoca monstros, pisoteia o núcleo até morrer — precisa ser derrotado pra vencer | 9:00 |

## Progressão na Run

- **Recursos de run**: ganhos ao derrotar inimigos, usados para construir novas torres e fazer upgrade das existentes (nível, dano, alcance).
- **Relíquias/bênçãos**: drops aleatórios ou escolhas periódicas (ao estilo "level up" de survivor) que concedem efeitos passivos globais — ex.: +10% de dano para todas as torres de um panteão.
- **Builds emergentes**: a combinação de torres + relíquias escolhidas numa run determina uma build diferente a cada tentativa, incentivando replay.
- **Evolução de torre**: ao atingir certo nível, ou com certa relíquia, uma torre pode evoluir para uma forma mitológica mais poderosa (ex.: Zeus evolui para uma forma com trovão do Olimpo).

**Implementado:**

- **Cartão da torre + câmera lenta**: clicar numa torre construída abre um cartão flutuante encostado nela (acima; embaixo se não couber; nunca sai pelas laterais do mapa) — nome (ou nome da forma mitológica), nível em bolinhas, status efetivos já com os bônus da run (dano e ataques/s; nas passivas, o efeito da aura) e os botões **Melhorar** (custo, U) e **Vender** (reembolso, V). Passar o mouse em Melhorar mostra os status do próximo nível ("Dano 39 → 50"), mesmo sem Favor suficiente. Enquanto uma torre está selecionada o jogo fica em **câmera lenta (0.5x)**, como na escolha de orientação, pra dar tempo de analisar. Esc, botão direito ou clicar fora fecham. (Substitui os botões de melhorar/vender que ficavam na barra superior, longe da torre.)
- **Upgrade de torre**: clicar numa torre construída abre o **cartão da torre** (ver abaixo), com o botão "⬆️ Melhorar" e o custo (atalhos: U melhora, V vende). 4 níveis: os níveis 2 e 3 são melhorias comuns (dano x1.3 / x1.65, cadência um pouco mais rápida), e o **nível 4 é a forma mitológica** (dano x2.2, cadência -28%), com nome próprio (ex.: Zeus Olímpico, Anúbis Juiz), brilho dourado e faíscas orbitando. Custos: 20 / 40 / 80 Favor. Passivas também sobem: Hera +5% de dano por nível, Hades +0.5 de raio e +5% de lentidão, Hermes +50% de regeneração. Bolinhas douradas sob a torre mostram o nível (estrela = evoluída). Vender devolve 50% de tudo que foi investido (construção + upgrades).
- **Bênçãos**: a cada marco de abates (10, 25, 45, 70, 100, 135... — o intervalo cresce 5 a cada bênção) o jogo **congela** e oferece 3 bênçãos; a escolhida vale até o fim da run e aparece numa lista na barra lateral. Cada carta sorteia primeiro a **raridade** — **comum 60%, incomum 30%, rara 10%** — e depois uma bênção dela (se a raridade não tiver mais nada disponível, cai pra outra). Cartas mostram a raridade (cinza / verde / dourado com brilho). Elenco (`src/game/blessings.ts`):
  - *Comuns*: Fúria do Olimpo / Ira do Deserto / Fúria de Asgard (+15% de dano por panteão — só se a equipe tiver aquele panteão), Mãos Ligeiras (+8% cadência), Golpe dos Deuses (+7% crítico), Ar Pesado (inimigos -7% velocidade), Fluxo Divino (+0.4 Favor/s), Oferenda (+40 Favor), Muralha Sagrada (cura 30 do núcleo, só se ferido).
  - *Incomuns*: Dízimo do Templo (-15% no custo de construir/melhorar), Núcleo Abençoado (+25 de vida máxima), Colheita de Almas (+50% de Favor por abate), Cajado de Asclépio (núcleo regenera 0.5/s), Golpe Esmagador (crítico x3 — só se já houver chance de crítico), Ira Crescente (+1,5% de dano por bênção possuída).
  - *Raras*: Projéteis Múltiplos (torres de alvo único acertam +1 inimigo), Ascensão (todas as torres sobem 1 nível de graça), Raio em Cadeia (15% de chance do acerto saltar pra um inimigo próximo com 40% do dano — desenhado em azul), Sentença de Thanatos (inimigos comuns abaixo de 10% de vida morrem na hora).
- **Painel "Bônus ativos"** (barra lateral, `src/game/bonuses.ts`): mostra os totais efetivos que o jogador está recebendo — dano geral (Hera × meta × Ira Crescente) e extra por panteão, velocidade de ataque, crítico, alvos extras, Raio em Cadeia, execução, lentidão dos inimigos, Favor/s, Favor por abate, desconto, regeneração e vida máxima do núcleo (dano, cadência, Favor/s e vida máx. sempre; o resto só quando ativo). É a mesma fonte de valores que o combate usa. **Cada carta de bênção mostra o novo total** ao escolhê-la (ex.: "Velocidade de ataque: +8% → +16%", "Favor: 20 → 60", "6 torres sobem 1 nível").
- **Balanceamento por simulação** (`npm run sim`, código em `tools/sim/`): roda o `Game` real em Node (DOM falso) com um bot que posiciona torres pelo "mapa de tráfego" (por onde os inimigos passam), constrói a equipe na ordem, melhora sempre a torre de menor nível e escolhe bênçãos por preferência. Grupos: `inicio` (economia da Loja), `times` (fim de run), `poderes` (com vs. sem poderes divinos, bot com política simples de uso) e `bencaos` (impacto de cada bênção não-comum). Use ≥30 runs (`npm run sim -- times 30`) pra decidir — com 12 a variação é grande.
  - Referência atual: só Zeus ~55s / ~58 Ambrosia; Zeus+Ártemis ~1:27 / ~145; gregos completos vencem ~60% (97% chegam ao Tifão); time misto grego/egípcio ~43%; egípcios + passivas gregas ~10%. Upgrades sozinhos ou bênçãos sozinhas não vencem.
  - Ajustes motivados pela simulação: Hades (-50% → -35%), evolução (x2.6 → x2.2), Ira Crescente (3% → 1,5%), Raio em Cadeia (25%/50% → 15%/40%), Sentença de Thanatos (15% → 10%), dois buffs nos egípcios e toda a curva da fase final.
  - *Achado estrutural*: por volta dos 6min todas as torres já estão no nível máximo — a partir daí o jogador só cresce por bênçãos. Um destino de Favor pro fim da run (ex.: níveis além da evolução, consumíveis) ajudaria. Egípcios seguem abaixo dos gregos no fim de run.

**Destino do Favor no fim da run (favor sink) — implementado.** Antes, times completos terminavam a run com 10–16 mil de Favor sobrando, sem onde gastar depois que todas as torres evoluíam (~6min). Duas adições resolvem isso (no simulador, o Favor sobrando cai pra ~1 mil):

- [x] **Poderes divinos** (`src/game/powers.ts`): liberados na coluna **Poderes** da árvore de Melhorias (ver Meta-progressão). Na run, os liberados aparecem numa **barra abaixo do mapa** (teclas **1–4**; passar o mouse mostra o que fazem). Pagos em Favor: **cada uso na run multiplica o custo do próximo por 1.5**, e há uma recarga curta (faixa escura que esvazia no botão). Efeitos pensados pra continuar relevantes no fim da run:
  - ⚡ **Ira de Zeus** (100 Favor, recarga 15s) — entra em modo de mira (câmera lenta, círculo seguindo o mouse, Esc cancela); o raio tira **60% da vida máxima** de cada inimigo na área (chefes e Tifão: 8%).
  - 🛡️ **Égide** (150, 25s) — núcleo **invulnerável por 6s**, inclusive ao pisão de Tifão (domo dourado).
  - ⏳ **Cronos** (120, 20s) — todos os inimigos **65% mais lentos por 6s** (tela levemente azulada).
  - 🌊 **Maremoto** (150, 25s) — onda saindo do núcleo empurra os inimigos **3 casas** rumo às bordas (chefes: 1).
  - Na primeira run com algum poder liberado, uma dica única apresenta a barra.
  - Simulação (bot com política simples de uso): taxa de vitória sobe modestamente (misto 40% → 50%, egípcios 5% → 15%; gregos dentro da variação) — ajudam sem desequilibrar.
- [x] **Rerrolar bênçãos com Favor**: botão "🎲 Novas opções" na tela de bênção sorteia 3 cartas novas (mesma regra de raridade). Custo dobra a cada reroll na run (25, 50, 100...); o botão mostra o custo e o Favor atual.

## Meta-progressão

**Implementado.** Moeda permanente: **Ambrosia** (nome resolvido — substitui o antigo placeholder "Favor Divino", eliminando a colisão de nome com o Favor de run). Ganha ao final de cada run (vitória ou derrota), persistida em `localStorage` separado do save de run em andamento (ver Tecnologia), nunca perdida ao começar de novo.

**Fórmula de ganho** (base, antes de modificadores da própria árvore): `floor(tempo_sobrevivido / 10) + abates × 2`. Ou seja, 10s sobrevividos = 1 Ambrosia, cada abate = 2 Ambrosia. Modificada por Plantação de Ambrosia (%), Colheita do Chefe (+50% se o chefe for derrotado) e Favor em Ambrosia (converte Favor que sobrou no fim da run) — ver árvore abaixo.

**Tela de Melhorias**: acessível pelo menu principal, apresentada como uma árvore de habilidades com 6 ramos (colunas) — Favor, Dano, Velocidade, Mítico, Ambrosia, Poderes —, lado a lado (se a janela for estreita demais, as colunas quebram de linha em vez de rolar na horizontal), cada um partindo de um nó raiz. Os nós filhos têm pré-requisito de nível no nó pai (ex.: só aparecem compráveis depois que o pai atinge X níveis) — é assim que a árvore "ramifica" a partir dos nós raízes originais. **Velocidade de Ataque** começou como filha de Dano das Torres mas virou raiz do próprio ramo — empilhada, ela acabava escondida embaixo de Golpe Perfurante em vez de ficar lado a lado.

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
| Poderes | **Poder: Ira de Zeus** (raiz) | — | 1 | 250 | Libera a Ira de Zeus na run (tecla 1) |
| Poderes | Poder: Égide | Ira de Zeus | 1 | 400 | Libera a Égide (tecla 2) |
| Poderes | Poder: Cronos | Égide | 1 | 500 | Libera Cronos (tecla 3) |
| Poderes | Poder: Maremoto | Cronos | 1 | 650 | Libera o Maremoto (tecla 4) |

*Correção de design*: "Favor em Ambrosia" inicialmente dependia só de Plantação de Ambrosia nível 1, o que deixava ela disponível sem precisar de Colheita do Chefe — corrigido para depender de Colheita do Chefe nível 1, fazendo o ramo Ambrosia virar uma cadeia linear de verdade (raiz → Colheita → Favor em Ambrosia).

*Nota sobre os valores de Dano das Torres/Plantação de Ambrosia*: a especificação original só trazia nível e bônus percentual (5%/10%/15%/20%/25%), sem custo em Ambrosia explícito — os custos (40 × nível) foram uma decisão de design para preencher essa lacuna, seguindo o mesmo formato linear de Favor Inicial. Ajustável em playtest.

As torres passivas (Hera, Hades, Hermes) ficam de fora da lista de "Duplicata" — o efeito delas é por presença no mapa (um booleano), não por contagem, então uma 2ª cópia não faria nada a mais.

## Estrutura da Run

- **Duração alvo**: 10 a 20 minutos por run.
- **Condição de derrota**: a vida do núcleo chega a zero.
- **Condição de vitória**: sobreviver aos 10 minutos **e** derrotar o chefe final (Tifão, que surge aos 9:00). Com ele vivo no fim do tempo, a run entra em prorrogação.
- **Eventos especiais**: chefes aos 5:00, 7:30 e 9:00 e fase final com elites (implementados — ver Inimigos e Ondas); eventos de risco/recompensa (ex.: uma onda extra forte em troca de recompensa maior) ainda não implementados.
- **Ao fim** (vitória ou derrota): tela de resumo com estatísticas da run (tempo sobrevivido, inimigos derrotados, torres usadas) + recursos de meta-progressão ganhos.
- **Controle de velocidade**: botões 1x/2x/4x aceleram a simulação (tempo de jogo passa mais rápido, sem afetar a física/balanceamento — é o mesmo dt, só multiplicado). Pensado pra testar builds e pra quem já manja do jogo não esperar os minutos iniciais mais parados.
- **Menu principal**: tela inicial com os botões empilhados verticalmente (Novo Jogo, Carregar Jogo, Equipe, Loja, Melhorias, Configurações); Novo Jogo e Carregar vão direto pra tela do jogo. Durante a run dá pra Salvar a qualquer momento e voltar ao menu pelo botão "☰ Menu" (ver Navegação durante a run, em Torres Mitológicas).

## Economia

- **Recursos de run (Favor)**: regeneram sozinhos a 1/segundo (mesmo sem abater nenhum inimigo — garante que o jogador sempre tenha alguma ação disponível) e também são ganhos por inimigo derrotado. Usados para construir/upgradar torres. Zeram ao fim da run.
  - *Nomenclatura resolvida*: o recurso permanente entre runs chama-se **Ambrosia** (não mais "Favor Divino") — sem mais colisão de nome com o Favor de run.
- **Recursos permanentes** (Ambrosia): ganhos ao fim da run, usados fora da run na árvore de Melhorias.
- O **custo de uma torre aumenta** com a quantidade já construída daquele tipo no grid, incentivando diversificar a build em vez de concentrar tudo em uma única torre.
- **Vender torre (implementado)**: clicar numa torre já construída a seleciona (anel pulsante vermelho ao redor dela) e o cartão da torre mostra o botão "Vender" com o reembolso. Reembolso = 50% do Favor efetivamente pago por aquela torre (guardado por torre, não recalculado — uma torre ganha de graça pela melhoria "Primeira Torre Grátis" reembolsa 0). Libera a célula e o slot do tipo (relevante pra quem tem a melhoria Duplicata/Tríade).
- Curva de custo de upgrade, taxa de drop de relíquias e recompensa por chefe ainda precisam de validação em playtest.

## Arte e Áudio

- **Estilo visual**: pixel art (decidido — abandona a opção vetorial flat), com identidade visual distinta por panteão: paletas e iconografia próprias (ex.: dourado/branco para o panteão grego, azul/gelo para o nórdico, dourado/areia para o egípcio).
- **Legibilidade em primeiro lugar**: grid e núcleo precisam continuar claros mesmo com a tela cheia de efeitos — crítico no estilo survivor, onde muitos inimigos e projéteis ocupam a tela ao mesmo tempo.
- **Pré-visualização de alcance**: ao passar o mouse numa célula válida com uma torre selecionada, a área que ela cobriria ali (linha/coluna, cruz, losango ou raio circular, dependendo do padrão) aparece em laranja translúcido — mesma geometria usada pela torre de verdade, sem precisar construir pra descobrir. Junto, um sprite "fantasma" semitransparente da própria torre (na pose de descanso) mostra como ela vai ficar naquela célula.
- **Áudio (implementado)**: 100% procedural via Web Audio API, mesma filosofia das sprites — sem nenhum arquivo de áudio, gerado inteiramente por código no cliente (`src/game/audio.ts`).
  - **Efeitos sonoros**: bipes curtos (osciladores + envelope de volume) pra construir torre, vender, atirar, acertar, abater inimigo, chefe nascendo, núcleo tomando dano, vitória, derrota, compra de melhoria e cliques de UI.
  - **Trilhas de fundo**: composições de verdade tocadas por um sequenciador próprio (agenda notas no relógio do Web Audio com lookahead).
    - *Run*: progressão Am–G–F–E / Am–Dm–F–E com pad de dentes-de-serra filtradas, baixo, "lira" (triângulo + harmônico, com eco) e tambor de moldura (doum/tek). **Acelera conforme a run avança** — de 92 a 168 BPM — e vai adensando: estalos contínuos a partir de ~35% da run, baixo pulsando a partir de ~45%, melodia em toda volta da metade em diante, doum extra e semicolcheias no clímax (fim da run).
    - *Menu*: calma, 64 BPM, sem percussão, acordes abertos com sétima/nona (Am9 Fmaj7 Cmaj7 G6 | Dm9 Am9 Fmaj7 Esus4) e lira esparsa. Toca em todas as telas fora da run (menu, Loja, Equipe, Melhorias, Configurações).
  - **Volume**: controles separados de **Música** e **Efeitos sonoros** (0-100%) + "Silenciar tudo" na tela de Configurações; durante a run ainda há um botão 🔊/🔇 de atalho.
  - **Volume dos tiros**: o tiro é um "fwip" curto em senoide (não mais onda quadrada aguda) e tiros/acertos têm intervalo mínimo entre si, pra não virar metralhadora com muitas torres.
  - **Desbloqueio de áudio**: navegadores exigem um gesto do usuário antes de tocar qualquer som. Ao abrir o jogo aparece uma tela de entrada ("Clique para começar", ou Enter/Espaço) — esse clique cria o `AudioContext` e a trilha do menu já começa. (Antes o áudio só destravava no primeiro clique, que muitas vezes era "Novo Jogo", e o menu ficava mudo até voltar de uma partida.) Se o navegador suspender o contexto, o próximo gesto o retoma. Com a aba/janela escondida, o áudio é suspenso de propósito (o navegador estrangula os timers do sequenciador e a trilha picotava/chiava); ao voltar, a música continua do ponto exato.

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
- **Organização do código** (`src/game/`): `Game.ts` (estado, loop, economia, bênçãos, save/load, input), `difficulty.ts` (curva de spawn, inimigos, chefes, elites), `targeting.ts` (mira por padrão de alcance), `auras.ts` (passivas), `animation.ts` (ciclo de ataque), `renderer.ts` (desenho a partir de uma vista só de leitura), além de `entities`, `sprites`, `audio`, `blessings`, `meta`, `team`, `settings`, `backup`. Ferramenta de balanceamento em `tools/sim/` (`npm run sim`).
- **Persistência (implementado, parcial)**: `localStorage`, um slot único, salva manualmente pelo botão "Salvar" — serializa a run em andamento inteira (torres, inimigos, núcleo, Favor, tempo decorrido, chefe já apareceu ou não). "Carregar Jogo" no menu reconstrói a partir daí.
  - Meta-progressão, equipe e configurações também ficam no `localStorage`, cada um com sua chave.
  - **Export/import (implementado)**: em Configurações, "Exportar save" baixa um JSON (`myth-td-save-AAAA-MM-DD.json`, formato `{ format: "myth-td-save", version, exportedAt, data: { meta, team, run, settings } }`) com todo o progresso; "Importar save" valida o arquivo, pede confirmação, substitui tudo e recarrega a página (`src/game/backup.ts`).
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
- [x] Formato da meta-progressão — decidido: árvore de habilidades ramificada (6 ramos, Ambrosia como moeda). Implementado — ver Meta-progressão.
- [ ] Número de panteões e torres no MVP vs. reservados para conteúdo pós-lançamento.
- [ ] Risco de balanceamento: runs muito curtas podem não dar tempo de sentir a progressão das torres; runs muito longas quebram a promessa "curta e intensa".
- [ ] Risco técnico: performance de muitos inimigos simultâneos em Canvas 2D no navegador — validar cedo na Fase 0.
