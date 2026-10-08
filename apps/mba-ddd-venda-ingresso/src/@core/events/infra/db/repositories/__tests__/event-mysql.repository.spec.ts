import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
} from '../../schemas';
import { Event } from '../../../../domain/entities/event.entity';
import { EventSpotId } from '../../../../domain/entities/event-spot';
import { EventMysqlRepository } from '../event-mysql.repository';
import { Partner } from '../../../../domain/entities/partner.entity';
import { PartnerMysqlRepository } from '../partner-mysql.repository';

test('Event repository', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
    debug: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);

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
    total_spots: 1000,
  });

  await eventRepo.add(event);
  await em.flush();
  await em.clear();

  const eventFound = await eventRepo.findById(event.id);
  console.log(eventFound);

  await orm.close();
});

test('deve buscar o evento pelo id de um dos seus lugares', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
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

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event1 = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });
  event1.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 2,
  });
  const event2 = partner.initEvent({
    name: 'Event 2',
    date: new Date(),
    description: 'Event 2 description',
  });
  event2.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 2,
  });
  event2.addSection({
    name: 'Section 2',
    description: 'Section 2 description',
    price: 100,
    total_spots: 2,
  });

  await eventRepo.add(event1);
  await eventRepo.add(event2);
  await em.flush();
  await em.clear();

  const spotId = event2.sections[1].spots[1].id;
  const eventFound = await eventRepo.findByEventSpotId(spotId);
  expect(eventFound.id.equals(event2.id)).toBeTruthy();
  expect(eventFound.sections.size).toBe(2);

  await orm.close();
});

test('deve retornar null quando nenhum evento tem o lugar', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
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
  const eventRepo = new EventMysqlRepository(em);

  const eventFound = await eventRepo.findByEventSpotId(new EventSpotId());
  expect(eventFound).toBeNull();

  await orm.close();
});
