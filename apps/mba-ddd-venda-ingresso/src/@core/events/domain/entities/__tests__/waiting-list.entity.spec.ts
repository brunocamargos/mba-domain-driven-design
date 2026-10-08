import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerId } from '../customer.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { EventId } from '../event.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry.entity';
import { WaitingList } from '../waiting-list.entity';
import { initOrm } from './helpers';

describe('WaitingList Entity Unit Tests', () => {
  initOrm();

  test('deve criar uma lista de espera vazia para um evento e uma seção', () => {
    const event_id = new EventId();
    const section_id = new EventSectionId();

    const waitingList = WaitingList.create({ event_id, section_id });

    expect(waitingList.event_id.equals(event_id)).toBeTruthy();
    expect(waitingList.section_id.equals(section_id)).toBeTruthy();
    expect(waitingList.entries.size).toBe(0);
    expect(waitingList.events.size).toBe(0);
  });

  test('deve adicionar uma entrada PENDING na ordem de chegada e registrar o CustomerJoinedWaitingList', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
    const customerA = new CustomerId();
    const customerB = new CustomerId();

    waitingList.addEntry(customerA);
    waitingList.addEntry(customerB);

    const entries = waitingList.toJSON().entries;
    expect(entries.map((entry) => entry.customer_id)).toEqual([
      customerA.value,
      customerB.value,
    ]);
    expect(entries.map((entry) => entry.status)).toEqual([
      WaitingListEntryStatus.PENDING,
      WaitingListEntryStatus.PENDING,
    ]);

    const joined = [...waitingList.events].filter(
      (event) => event instanceof CustomerJoinedWaitingList,
    ) as CustomerJoinedWaitingList[];
    expect(joined).toHaveLength(2);
    expect(joined[0].aggregate_id.equals(waitingList.id)).toBeTruthy();
    expect(joined[0].event_id.equals(waitingList.event_id)).toBeTruthy();
    expect(joined[0].section_id.equals(waitingList.section_id)).toBeTruthy();
    expect(joined[0].customer_id.equals(customerA)).toBeTruthy();
    expect(joined[1].customer_id.equals(customerB)).toBeTruthy();
  });

  test('não deve adicionar o mesmo cliente enquanto ele tem entrada PENDING', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
    const customer = new CustomerId();
    waitingList.addEntry(customer);

    expect(() => waitingList.addEntry(customer)).toThrow(
      'Customer already in waiting list',
    );
    expect(waitingList.entries.size).toBe(1);
    expect(waitingList.events.size).toBe(1);
  });

  test('deve permitir que um cliente já notificado entre de novo na fila', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
    const customer = new CustomerId();
    waitingList.addEntry(customer);
    waitingList.notifyNextCustomer(new EventSpotId());

    waitingList.addEntry(customer);

    const entries = waitingList.toJSON().entries;
    expect(entries.map((entry) => entry.status)).toEqual([
      WaitingListEntryStatus.NOTIFIED,
      WaitingListEntryStatus.PENDING,
    ]);
  });

  test('deve notificar a primeira entrada PENDING, promovendo-a a NOTIFIED e registrando o SpotOfferedToWaitingCustomer', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
    const customerA = new CustomerId();
    const customerB = new CustomerId();
    const entryA = waitingList.addEntry(customerA);
    const entryB = waitingList.addEntry(customerB);
    waitingList.clearEvents();
    const spot_id = new EventSpotId();

    waitingList.notifyNextCustomer(spot_id);

    expect(entryA.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(entryB.status).toBe(WaitingListEntryStatus.PENDING);

    const [offered] = [...waitingList.events] as SpotOfferedToWaitingCustomer[];
    expect(waitingList.events.size).toBe(1);
    expect(offered).toBeInstanceOf(SpotOfferedToWaitingCustomer);
    expect(offered.aggregate_id.equals(waitingList.id)).toBeTruthy();
    expect(offered.event_id.equals(waitingList.event_id)).toBeTruthy();
    expect(offered.section_id.equals(waitingList.section_id)).toBeTruthy();
    expect(offered.spot_id.equals(spot_id)).toBeTruthy();
    expect(offered.customer_id.equals(customerA)).toBeTruthy();
  });

  test('não deve fazer nada ao notificar uma fila sem entradas pendentes', () => {
    const emptyList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });

    expect(() => emptyList.notifyNextCustomer(new EventSpotId())).not.toThrow();
    expect(emptyList.events.size).toBe(0);

    const notifiedList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
    const entry = notifiedList.addEntry(new CustomerId());
    notifiedList.notifyNextCustomer(new EventSpotId());
    notifiedList.clearEvents();

    notifiedList.notifyNextCustomer(new EventSpotId());

    expect(entry.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(notifiedList.events.size).toBe(0);
  });
});
