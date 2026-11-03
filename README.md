# Silêncio

Uma extensão pro Chrome que abre notícias **só com o texto**. Sem anúncio, sem popup, sem "assine agora", sem vídeo tocando sozinho. E com um resumo em português feito pela IA que já vem dentro do Chrome, rodando no seu computador.

Basicamente: você clica numa matéria, e em vez daquela confusão, aparece uma página limpa com o título, a foto, o texto e um resumo de 5 linhas do lado. Só isso.

## Pra que serve

- Ler sem distração. Nenhum script do site roda na matéria.
- Ler sem ser rastreado. Os domínios de anúncio e de rastreio são bloqueados.
- Entender rápido. O resumo aparece em segundos, em português, mesmo quando a matéria é em inglês.
- Nada sai do seu computador. A IA é a do próprio Chrome; o texto da matéria não vai pra nenhum servidor.

## Onde funciona

| Site | O que muda |
| --- | --- |
| **UOL** | Matérias e colunas viram leitura limpa. A home abre sem anúncio. |
| **Folha de S.Paulo** | Matérias e colunas viram leitura limpa. |
| **Globo** (g1, ge, O Globo, gshow, revistas) | Matérias e posts de blog viram leitura limpa. A home abre sem anúncio. |
| **New York Times** | Matérias e blogs ao vivo viram leitura limpa. A home abre sem anúncio. |

Nos outros sites, a extensão não faz nada.

## Como instalar

Leva uns dois minutos e não precisa saber nada de programação.

1. Baixe esta pasta: clique no botão verde **Code** aqui em cima, depois em **Download ZIP**. Abra o ZIP; vai aparecer uma pasta chamada `silencio`. Guarde ela num lugar fixo, tipo Documentos. Se você apagar ou mover essa pasta depois, a extensão para de funcionar.
2. No Chrome, digite na barra de endereço: `chrome://extensions` e aperte Enter.
3. No canto superior direito, ligue a chave **Modo do desenvolvedor**.
4. Arraste a pasta `silencio` pra dentro dessa página do Chrome e solte.
5. Pronto. Vai aparecer o card **Silêncio** na lista.

Dica: clique no ícone de quebra-cabeça do lado da barra de endereço e no alfinete ao lado de "Silêncio", pra deixar o ícone sempre visível.

## Como usar

Não tem botão pra ligar. Abra qualquer matéria de um dos sites acima e ela já vem limpa.

Na barra de cima da leitura você tem:

- **Início**: volta pra home do site.
- **A−** e **A+**: diminui ou aumenta a letra. Ele lembra a sua escolha.
- **Modo claro** / **Modo escuro**: troca o fundo. Sem mexer, ele segue o tema do seu sistema.
- **Ver original**: abre a página do jeito que o site mostra, com tudo. Use quando precisar de vídeo, comentários ou login.

O ícone da extensão fica **verde com um número** quando bloqueou algo na página. Passe o mouse em cima pra ver o total desde a instalação.

## O resumo

Do lado esquerdo do texto (ou em cima, no celular e em janela estreita) aparece o quadro **Resumo**, com 3 a 5 tópicos. Ele é feito pelo Gemini Nano, a IA embutida do Chrome, na sua máquina.

- Na primeira vez pode aparecer um botão **Baixar e resumir**. É o Chrome baixando o modelo de IA, uma vez só, alguns minutos. Depois disso é automático.
- Precisa de Chrome recente (138 ou mais novo), uns 22 GB livres no disco e 16 GB de memória. Se o seu computador não tiver, o quadro avisa e o resto da extensão funciona normal.
- A IA pode errar um detalhe. Use o resumo como mapa, não como fonte.

## Perguntas comuns

**A matéria abriu normal, com anúncio e tudo.**
Vá em `chrome://extensions` e veja se o card Silêncio está ligado. Se tiver mexido na pasta, clique na seta circular do card (recarregar).

**Quero ver o site do jeito normal.**
Clique em **Ver original** na barra de cima.

**Vídeo, comentário ou login não funciona.**
É esperado: na leitura nenhum script roda. Use **Ver original**.

**No New York Times a matéria veio curta.**
Sem assinatura, o NYT só manda o começo. A leitura mostra o que veio e avisa no fim. Isso não tem como mudar, nem é pra ter.

**Atualizei os arquivos e nada mudou.**
Toda vez que a pasta muda, clique na seta circular do card em `chrome://extensions`.

**Quero tirar a extensão.**
Em `chrome://extensions`, clique em **Remover** no card. Pode apagar a pasta depois.

## Aviso

É uma extensão de uso pessoal: ela muda o que **você** vê no **seu** navegador, igual ao modo leitura do Safari. Ela não pega nada que o site não tenha mandado pra você.

## Pra quem é técnico

Como funciona por dentro, regras de rede, seletores de cada site e a arquitetura do resumo: [TECNICO.md](TECNICO.md).
