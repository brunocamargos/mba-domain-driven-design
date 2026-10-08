import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';
import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';

test('deve cancelar um pedido pago e registrar o OrderCancelled com o event_spot_id', () => {
  const order = Order.create({
    customer_id: new CustomerId(),
    amount: 100,
    event_spot_id: new EventSpotId(),
  });
  order.pay();

  order.cancel();

  expect(order.status).toBe(OrderStatus.CANCELLED);
  const cancelled = [...order.events].find(
    (event) => event instanceof OrderCancelled,
  ) as OrderCancelled;
  expect(cancelled.aggregate_id.equals(order.id)).toBeTruthy();
  expect(cancelled.status).toBe(OrderStatus.CANCELLED);
  expect(cancelled.event_spot_id.equals(order.event_spot_id)).toBeTruthy();
});

test('deve cancelar um pedido pendente', () => {
  const order = Order.create({
    customer_id: new CustomerId(),
    amount: 100,
    event_spot_id: new EventSpotId(),
  });

  order.cancel();

  expect(order.status).toBe(OrderStatus.CANCELLED);
  expect(
    [...order.events].some((event) => event instanceof OrderCancelled),
  ).toBeTruthy();
});

test('não deve cancelar um pedido já cancelado', () => {
  const order = Order.create({
    customer_id: new CustomerId(),
    amount: 100,
    event_spot_id: new EventSpotId(),
  });
  order.cancel();
  const eventsCount = order.events.size;

  expect(() => order.cancel()).toThrow('Order already cancelled');
  expect(order.events.size).toBe(eventsCount);
});
