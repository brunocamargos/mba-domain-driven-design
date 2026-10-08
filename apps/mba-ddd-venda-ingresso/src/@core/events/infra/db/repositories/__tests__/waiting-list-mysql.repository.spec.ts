import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../schemas';
import { Customer } from '../../../../domain/entities/customer.entity';
import { Partner } from '../../../../domain/entities/partner.entity';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryStatus } from '../../../../domain/entities/waiting-list-entry.entity';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { EventMysqlRepository } from '../event-mysql.repository';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';

test('deve persistir a lista de espera com suas entradas e recarregá-la na ordem de chegada', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
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
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  const customerA = Customer.create({
    name: 'Customer A',
    cpf: '70375887091',
  });
  await customerRepo.add(customerA);
  const customerB = Customer.create({
    name: 'Customer B',
    cpf: '99346413050',
  });
  await customerRepo.add(customerB);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 1,
  });
  await eventRepo.add(event);

  const waitingList = WaitingList.create({
    event_id: event.id,
    section_id: event.sections[0].id,
  });
  const entryA = waitingList.addEntry(customerA.id);
  // created_at é gravado com milissegundos; a espera garante ordens de chegada distintas
  await new Promise((resolve) => setTimeout(resolve, 5));
  const entryB = waitingList.addEntry(customerB.id);
  await waitingListRepo.add(waitingList);
  await em.flush();
  await em.clear(); // limpa o cache do entity manager (unit of work)

  const waitingListFound = await waitingListRepo.findById(waitingList.id);
  expect(waitingListFound.id.equals(waitingList.id)).toBeTruthy();
  expect(waitingListFound.event_id.equals(event.id)).toBeTruthy();
  expect(waitingListFound.section_id.equals(event.sections[0].id)).toBeTruthy();
  expect(waitingListFound.toJSON().entries).toEqual([
    {
      id: entryA.id.value,
      customer_id: customerA.id.value,
      status: WaitingListEntryStatus.PENDING,
      created_at: entryA.created_at,
    },
    {
      id: entryB.id.value,
      customer_id: customerB.id.value,
      status: WaitingListEntryStatus.PENDING,
      created_at: entryB.created_at,
    },
  ]);

  await orm.close();
});

test('deve buscar a lista de espera por evento e seção', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
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
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  const customerA = Customer.create({
    name: 'Customer A',
    cpf: '70375887091',
  });
  await customerRepo.add(customerA);
  const customerB = Customer.create({
    name: 'Customer B',
    cpf: '99346413050',
  });
  await customerRepo.add(customerB);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 1,
  });
  event.addSection({
    name: 'Section 2',
    description: 'Section 2 description',
    price: 100,
    total_spots: 1,
  });
  await eventRepo.add(event);

  const waitingList1 = WaitingList.create({
    event_id: event.id,
    section_id: event.sections[0].id,
  });
  waitingList1.addEntry(customerA.id);
  await waitingListRepo.add(waitingList1);
  const waitingList2 = WaitingList.create({
    event_id: event.id,
    section_id: event.sections[1].id,
  });
  waitingList2.addEntry(customerB.id);
  await waitingListRepo.add(waitingList2);
  await em.flush();
  await em.clear(); // limpa o cache do entity manager (unit of work)

  const waitingListFound1 = await waitingListRepo.findByEventAndSection(
    event.id,
    event.sections[0].id,
  );
  expect(waitingListFound1.id.equals(waitingList1.id)).toBeTruthy();
  expect(
    waitingListFound1.entries[0].customer_id.equals(customerA.id),
  ).toBeTruthy();

  const waitingListFound2 = await waitingListRepo.findByEventAndSection(
    event.id,
    event.sections[1].id,
  );
  expect(waitingListFound2.id.equals(waitingList2.id)).toBeTruthy();
  expect(waitingListFound2.entries.size).toBe(1);
  expect(
    waitingListFound2.entries[0].customer_id.equals(customerB.id),
  ).toBeTruthy();

  await orm.close();
});

test('deve retornar null quando não há lista de espera para o evento e a seção', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      CustomerSchema,
      PartnerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
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
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 1,
  });
  await eventRepo.add(event);
  await em.flush();
  await em.clear(); // limpa o cache do entity manager (unit of work)

  const waitingListFound = await waitingListRepo.findByEventAndSection(
    event.id,
    event.sections[0].id,
  );
  expect(waitingListFound).toBeNull();

  await orm.close();
});
