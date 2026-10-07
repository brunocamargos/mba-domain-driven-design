# Linguagem Ubíqua - Lista de Espera de Ingressos

Termos da feature de lista de espera. Cada termo indica o papel tático em DDD e o nome usado no código.

- **Lista de Espera** (`WaitingList`) — Agregado com a fila de clientes aguardando lugar em uma seção esgotada de um evento. Existe no máximo uma por `event_id` + `section_id`.
- **Entrada** (`WaitingListEntry`) — Entidade filha da `WaitingList` que representa um cliente na fila, com status `PENDING` ou `NOTIFIED` e ordem de chegada por `created_at`.
- **Entrar na Lista** (`WaitingList.addEntry`, evento `CustomerJoinedWaitingList`) — Inscrição de um cliente na fila. O mesmo cliente não pode ter duas entradas `PENDING` na mesma lista.
- **Esgotamento** (`Event.allowReserveSpot`) — Estado de uma seção em que nenhum lugar pode ser reservado (todos reservados ou não publicados). É a condição para entrar na lista.
- **Cancelamento de Pedido** (`Order.cancel`, evento `OrderCancelled`) — Evento de domínio do agregado `Order`, carregando o `event_spot_id`; inicia a cadeia de liberação. Pedido já cancelado não pode ser cancelado de novo.
- **Trava de Reserva** (`SpotReservation`) — Agregado que garante que um lugar pertence a um único cliente durante a compra. É removida na liberação do lugar.
- **Liberação de Lugar** (`Event.markSpotAsAvailable`, evento `EventSpotReleased`) — Evento de domínio do agregado `Event` quando um lugar reservado volta a ficar disponível após o cancelamento do pedido.
- **Política de Liberação** (`OrderCancelledHandler`) — Reage ao `OrderCancelled`: libera o lugar no `Event` e remove a `SpotReservation`.
- **Política de Lista de Espera** (`EventSpotReleasedHandler`) — Reage ao `EventSpotReleased`: localiza a fila da seção e notifica o primeiro cliente pendente.
- **Notificação** (`WaitingList.notifyNextCustomer`, evento `SpotOfferedToWaitingCustomer`) — Promoção da primeira entrada `PENDING` (por ordem de chegada) para `NOTIFIED` quando um lugar é liberado.
- **Oferta de Lugar** (`SpotOfferedToWaitingCustomerIntegrationEvent`) — Evento de integração que leva a notificação ao bounded context de Emails, de forma assíncrona via RabbitMQ.
