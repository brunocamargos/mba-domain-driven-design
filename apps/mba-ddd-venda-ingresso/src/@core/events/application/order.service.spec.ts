import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../infra/db/schemas';
import { CustomerMysqlRepository } from '../infra/db/repositories/customer-mysql.repository';
import { Customer } from '../domain/entities/customer.entity';
import { UnitOfWorkMikroOrm } from '../../common/infra/unit-of-work-mikro-orm';
import { PartnerMysqlRepository } from '../infra/db/repositories/partner-mysql.repository';
import { Partner } from '../domain/entities/partner.entity';
import { EventMysqlRepository } from '../infra/db/repositories/event-mysql.repository';
import { OrderService } from './order.service';
import { OrderMysqlRepository } from '../infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../infra/db/repositories/spot-reservation-mysql.repository';
import { PaymentGateway } from './payment.gateway';
import { ApplicationService } from '../../common/application/application.service';
import { DomainEventManager } from '../../common/domain/domain-event-manager';
import { OrderCancelledHandler } from './handlers/order-cancelled.handler';
import { OrderStatus } from '../domain/entities/order.entity';
import { EventSpotReleasedHandler } from './handlers/event-spot-released.handler';
import { WaitingListMysqlRepository } from '../infra/db/repositories/waiting-list-mysql.repository';
import { WaitingListService } from './waiting-list.service';
import { WaitingListEntryStatus } from '../domain/entities/waiting-list-entry.entity';

test('deve criar uma order', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const unitOfWork = new UnitOfWorkMikroOrm(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const customer = Customer.create({
    name: 'Customer 1',
    cpf: '70375887091',
  });
  await customerRepo.add(customer);

  const partner = Partner.create({
    name: 'Partner 1',
  });
  await partnerRepo.add(partner);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });

  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1000,
  });

  event.publishAll();

  await eventRepo.add(event);

  await unitOfWork.commit();
  await em.clear();

  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);
  const orderService = new OrderService(
    orderRepo,
    customerRepo,
    eventRepo,
    spotReservationRepo,
    unitOfWork,
    new PaymentGateway(),
    new ApplicationService(unitOfWork, new DomainEventManager()),
  );

  const op1 = orderService.create({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customer.id.value,
    spot_id: event.sections[0].spots[0].id.value,
    card_token: 'tok_visa',
  });

  const op2 = orderService.create({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customer.id.value,
    spot_id: event.sections[0].spots[0].id.value,
    card_token: 'tok_visa',
  });

  try {
    await Promise.all([op1, op2]);
  } catch (e) {
    console.log(e);
    console.log(await orderRepo.findAll());
    console.log(await spotReservationRepo.findAll());
  }

  await orm.close();
});

test('deve cancelar uma order e liberar o lugar', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const unitOfWork = new UnitOfWorkMikroOrm(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const customer = Customer.create({
    name: 'Customer 1',
    cpf: '70375887091',
  });
  await customerRepo.add(customer);

  const partner = Partner.create({
    name: 'Partner 1',
  });
  await partnerRepo.add(partner);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });

  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1,
  });

  event.publishAll();

  await eventRepo.add(event);

  await unitOfWork.commit();
  await em.clear();

  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);

  // registra o handler do mesmo jeito que o EventsModule faz
  const domainEventManager = new DomainEventManager();
  OrderCancelledHandler.listensTo().forEach((eventName: string) => {
    domainEventManager.register(eventName, async (domainEvent) =>
      new OrderCancelledHandler(
        eventRepo,
        spotReservationRepo,
        domainEventManager,
      ).handle(domainEvent),
    );
  });

  const orderService = new OrderService(
    orderRepo,
    customerRepo,
    eventRepo,
    spotReservationRepo,
    unitOfWork,
    new PaymentGateway(),
    new ApplicationService(unitOfWork, domainEventManager),
  );

  const order = await orderService.create({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customer.id.value,
    spot_id: event.sections[0].spots[0].id.value,
    card_token: 'tok_visa',
  });

  await orderService.cancel({ order_id: order.id.value });

  em.clear();

  const orderFound = await orderRepo.findById(order.id);
  expect(orderFound.status).toBe(OrderStatus.CANCELLED);

  const eventFound = await eventRepo.findById(event.id);
  expect(eventFound.sections[0].spots[0].is_reserved).toBe(false);

  expect(
    await spotReservationRepo.findById(event.sections[0].spots[0].id),
  ).toBeNull();

  await orm.close();
});

test('deve, a partir de um único cancelamento, liberar o lugar, remover a trava de reserva e notificar o primeiro da fila', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
      WaitingListSchema,
      WaitingListEntrySchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const unitOfWork = new UnitOfWorkMikroOrm(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const customer = Customer.create({
    name: 'Customer 1',
    cpf: '70375887091',
  });
  await customerRepo.add(customer);
  const customerB = Customer.create({
    name: 'Customer B',
    cpf: '99346413050',
  });
  await customerRepo.add(customerB);
  const customerC = Customer.create({
    name: 'Customer C',
    cpf: '52998224725',
  });
  await customerRepo.add(customerC);

  const partner = Partner.create({
    name: 'Partner 1',
  });
  await partnerRepo.add(partner);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });

  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1,
  });

  event.publishAll();

  await eventRepo.add(event);

  await unitOfWork.commit();
  await em.clear();

  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  // registra os handlers do mesmo jeito que o EventsModule.onModuleInit faz
  const domainEventManager = new DomainEventManager();
  OrderCancelledHandler.listensTo().forEach((eventName: string) => {
    domainEventManager.register(eventName, async (domainEvent) =>
      new OrderCancelledHandler(
        eventRepo,
        spotReservationRepo,
        domainEventManager,
      ).handle(domainEvent),
    );
  });
  EventSpotReleasedHandler.listensTo().forEach((eventName: string) => {
    domainEventManager.register(eventName, async (domainEvent) =>
      new EventSpotReleasedHandler(waitingListRepo, domainEventManager).handle(
        domainEvent,
      ),
    );
  });

  const publishedEvents: string[] = [];
  domainEventManager.register('*', async (domainEvent) => {
    publishedEvents.push(domainEvent.constructor.name);
  });

  const applicationService = new ApplicationService(
    unitOfWork,
    domainEventManager,
  );
  const orderService = new OrderService(
    orderRepo,
    customerRepo,
    eventRepo,
    spotReservationRepo,
    unitOfWork,
    new PaymentGateway(),
    applicationService,
  );

  const order = await orderService.create({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customer.id.value,
    spot_id: event.sections[0].spots[0].id.value,
    card_token: 'tok_visa',
  });

  const waitingListService = new WaitingListService(
    waitingListRepo,
    customerRepo,
    eventRepo,
    applicationService,
  );

  // a seção esgotou: B e C entram na fila, nessa ordem
  const entryB = await waitingListService.join({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customerB.id.value,
  });
  const entryC = await waitingListService.join({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customerC.id.value,
  });
  publishedEvents.length = 0;

  await orderService.cancel({ order_id: order.id.value });

  em.clear();

  const eventFound = await eventRepo.findById(event.id);
  expect(eventFound.sections[0].spots[0].is_reserved).toBe(false);

  expect(
    await spotReservationRepo.findById(event.sections[0].spots[0].id),
  ).toBeNull();

  const waitingList = await waitingListRepo.findByEventAndSection(
    event.id,
    event.sections[0].id,
  );
  const statusByEntry = new Map(
    [...waitingList.entries].map((entry) => [entry.id.value, entry.status]),
  );
  expect(statusByEntry.get(entryB.id.value)).toBe(
    WaitingListEntryStatus.NOTIFIED,
  );
  expect(statusByEntry.get(entryC.id.value)).toBe(
    WaitingListEntryStatus.PENDING,
  );

  expect(publishedEvents).toEqual(
    expect.arrayContaining([
      'OrderCancelled',
      'EventSpotReleased',
      'SpotOfferedToWaitingCustomer',
    ]),
  );

  await orm.close();
});

test('deve cancelar e liberar o lugar sem efeito na fila quando a seção não tem lista de espera', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
      WaitingListSchema,
      WaitingListEntrySchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const unitOfWork = new UnitOfWorkMikroOrm(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const customer = Customer.create({
    name: 'Customer 1',
    cpf: '70375887091',
  });
  await customerRepo.add(customer);

  const partner = Partner.create({
    name: 'Partner 1',
  });
  await partnerRepo.add(partner);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });

  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1,
  });

  event.publishAll();

  await eventRepo.add(event);

  await unitOfWork.commit();
  await em.clear();

  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  // registra os handlers do mesmo jeito que o EventsModule.onModuleInit faz
  const domainEventManager = new DomainEventManager();
  OrderCancelledHandler.listensTo().forEach((eventName: string) => {
    domainEventManager.register(eventName, async (domainEvent) =>
      new OrderCancelledHandler(
        eventRepo,
        spotReservationRepo,
        domainEventManager,
      ).handle(domainEvent),
    );
  });
  EventSpotReleasedHandler.listensTo().forEach((eventName: string) => {
    domainEventManager.register(eventName, async (domainEvent) =>
      new EventSpotReleasedHandler(waitingListRepo, domainEventManager).handle(
        domainEvent,
      ),
    );
  });

  const applicationService = new ApplicationService(
    unitOfWork,
    domainEventManager,
  );
  const orderService = new OrderService(
    orderRepo,
    customerRepo,
    eventRepo,
    spotReservationRepo,
    unitOfWork,
    new PaymentGateway(),
    applicationService,
  );

  const order = await orderService.create({
    event_id: event.id.value,
    section_id: event.sections[0].id.value,
    customer_id: customer.id.value,
    spot_id: event.sections[0].spots[0].id.value,
    card_token: 'tok_visa',
  });

  await orderService.cancel({ order_id: order.id.value });

  em.clear();

  const eventFound = await eventRepo.findById(event.id);
  expect(eventFound.sections[0].spots[0].is_reserved).toBe(false);

  expect(
    await spotReservationRepo.findById(event.sections[0].spots[0].id),
  ).toBeNull();

  expect(
    await waitingListRepo.findByEventAndSection(event.id, event.sections[0].id),
  ).toBeNull();

  await orm.close();
});
