import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerId } from './customer.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import { EventId } from './event.entity';
import {
  WaitingListEntry,
  WaitingListEntryStatus,
} from './waiting-list-entry.entity';

export class WaitingListId extends Uuid {}

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId;
  section_id: EventSectionId;
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(command: { event_id: EventId; section_id: EventSectionId }) {
    return new WaitingList(command);
  }

  addEntry(customer_id: CustomerId) {
    const alreadyWaiting = this._entries.find(
      (entry) =>
        entry.customer_id.equals(customer_id) &&
        entry.status === WaitingListEntryStatus.PENDING,
    );

    if (alreadyWaiting) {
      throw new Error('Customer already in waiting list');
    }

    const entry = WaitingListEntry.create({ customer_id });
    this._entries.add(entry);
    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        this.event_id,
        this.section_id,
        customer_id,
      ),
    );
    return entry;
  }

  notifyNextCustomer(spot_id: EventSpotId) {
    const [nextEntry] = [...this._entries]
      .filter((entry) => entry.status === WaitingListEntryStatus.PENDING)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    if (!nextEntry) {
      return;
    }

    nextEntry.notify();
    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        this.event_id,
        this.section_id,
        spot_id,
        nextEntry.customer_id,
      ),
    );
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries as ICollection<WaitingListEntry>;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: [...this._entries]
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .map((entry) => entry.toJSON()),
    };
  }
}
