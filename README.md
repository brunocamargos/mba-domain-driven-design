# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Prepare o banco (o projeto não tem migrações; o comando recria todas as tabelas a partir do `mikro-orm.config.ts`, inclusive a `stored_event`):

```bash
npx mikro-orm schema:fresh --run
```

Suba a API principal (porta 3000) e o app de e-mails (porta 3001), cada um em um terminal:

```bash
npm run start:dev
npx nest start emails
```

Rode a suíte de testes (os testes de aplicação e de repositório usam o MySQL do `docker-compose`):

```bash
npm test
```

> Os testes de infraestrutura recriam o schema só com as entidades de cada teste, o que derruba a tabela `stored_event`. Depois de rodar a suíte, execute `npx mikro-orm schema:fresh --run` de novo antes de subir a API; sem isso, a API responde 500 na primeira operação.

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Lista de espera

A feature de lista de espera adiciona o cancelamento de pedido, a liberação do lugar e a fila por seção, ligados por eventos de domínio. O roteiro de requisições está no `api.http`.

### A cadeia do cancelamento

Um único comando dispara toda a cadeia; nenhum elo conhece o próximo:

1. `POST /events/:event_id/orders/:order_id/cancel` chama o `OrderService.cancel`, dentro do `ApplicationService.run`. O comando só cancela o pedido: o `Order.cancel()` aplica a invariante (não cancela duas vezes) e registra o `OrderCancelled` com o `event_spot_id`.
2. O `ApplicationService` publica o `OrderCancelled`, e o `OrderCancelledHandler` reage: localiza o `Event` pelo `findByEventSpotId`, chama `markSpotAsAvailable` (o próprio `Event` descobre a seção do lugar e registra o `EventSpotReleased`), remove a `SpotReservation` e publica os eventos do `Event`.
3. O `EventSpotReleasedHandler` — a política da feature — reage ao `EventSpotReleased`: carrega a `WaitingList` da seção (sem fila, termina sem efeito), chama `notifyNextCustomer`, que promove a primeira entrada `PENDING` a `NOTIFIED` e registra o `SpotOfferedToWaitingCustomer`, e publica os eventos de domínio e de integração da fila.
4. O mapeamento do `EventsModule` converte o evento no `SpotOfferedToWaitingCustomerIntegrationEvent` (`customer_id`, `event_id`, `section_id`, `spot_id`) e o enfileira na fila Bull `integration-events`; o `IntegrationEventsPublisher` o publica no RabbitMQ (exchange `amq.direct`, routing key igual ao nome do evento).
5. O `ConsumerService` do `apps/emails` consome a mensagem na fila `emails-waiting-list` e registra no log o cliente e a seção notificados.

Os passos 1 a 3 rodam no mesmo processo e são gravados no mesmo commit; só o passo 5 é assíncrono. Todos os eventos de domínio da cadeia ficam na tabela `stored_event`.

### Por que `WaitingList` é um agregado separado do `Event`

Um agregado é uma fronteira de consistência: o que precisa ser verdadeiro ao final de uma única transação fica dentro dele, e o resto fica fora e se comunica por identidade e por eventos. As invariantes da fila (o mesmo cliente não entra duas vezes enquanto está pendente, a ordem de chegada, a promoção do primeiro pendente) não dizem respeito à disponibilidade dos lugares, e as invariantes do `Event` (publicação, reserva de lugar) não dizem respeito à fila. Colocar a fila dentro do `Event` faria o agregado, que já carrega todas as seções e todos os lugares em memória, crescer e ser bloqueado também a cada entrada na fila, violando a regra de que só um agregado é modificado por transação. Por isso a `WaitingList` referencia o evento e a seção por ID, e a ligação entre "um lugar foi liberado" e "o primeiro da fila é notificado" é feita por uma política reagindo ao `EventSpotReleased`, e não por um método do `Event`. É o caso em que a regra de um agregado por transação é mantida justamente por não se ceder à conveniência de um agregado único.

### Limitação do mecanismo de eventos

O `ApplicationService.finish()` captura a lista de agregados do Unit of Work uma única vez, antes de publicar os eventos de domínio. Um agregado que um handler carrega e altera durante essa publicação entra no Unit of Work depois do retrato, e por isso seus eventos não são publicados pelo `ApplicationService`: o próprio handler precisa chamar `publish` e `publishForIntegrationEvent`, como os comentários do `MyHandlerHandler` indicam e como os dois handlers desta feature fazem. A consequência é que os eventos de integração gerados dentro de um handler são enfileirados no Bull antes do commit do comando que os originou; se o commit falhar, a mensagem já terá sido enfileirada. O projeto não tem outbox, e o mecanismo foi mantido como está, conforme as restrições do desafio.

### Documentação

- [Event Storming (imagem)](docs/event-storming.png)
- [Event Storming (Excalidraw)](docs/event-storming.excalidraw): abra em [excalidraw.com](https://excalidraw.com)
- [Linguagem ubíqua](docs/linguagem-ubiqua.md)

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>
