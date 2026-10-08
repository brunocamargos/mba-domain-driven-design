import { ApplicationService } from '../../common/application/application.service';
import { EventSectionId } from '../domain/entities/event-section';
import { EventId } from '../domain/entities/event.entity';
import { WaitingList } from '../domain/entities/waiting-list.entity';
import { ICustomerRepository } from '../domain/repositories/customer-repository.interface';
import { IEventRepository } from '../domain/repositories/event-repository.interface';
import { IWaitingListRepository } from '../domain/repositories/waiting-list-repository.interface';

export class WaitingListService {
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private customerRepo: ICustomerRepository,
    private eventRepo: IEventRepository,
    private applicationService: ApplicationService,
  ) {}

  list(input: { event_id: string; section_id: string }) {
    return this.waitingListRepo.findByEventAndSection(
      new EventId(input.event_id),
      new EventSectionId(input.section_id),
    );
  }

  async join(input: {
    event_id: string;
    section_id: string;
    customer_id: string;
  }) {
    const customer = await this.customerRepo.findById(input.customer_id);

    if (!customer) {
      throw new Error('Customer not found');
    }

    const event = await this.eventRepo.findById(input.event_id);

    if (!event) {
      throw new Error('Event not found');
    }

    const sectionId = new EventSectionId(input.section_id);
    const section = event.sections.find((s) => s.id.equals(sectionId));

    if (!section) {
      throw new Error('Section not found');
    }

    const availableSpot = section.spots.find((spot) =>
      event.allowReserveSpot({ section_id: section.id, spot_id: spot.id }),
    );

    if (availableSpot) {
      throw new Error('Section is not sold out');
    }

    let waitingList = await this.waitingListRepo.findByEventAndSection(
      event.id,
      section.id,
    );

    if (!waitingList) {
      waitingList = WaitingList.create({
        event_id: event.id,
        section_id: section.id,
      });
    }

    return this.applicationService.run(async () => {
      const entry = waitingList.addEntry(customer.id);

      await this.waitingListRepo.add(waitingList);

      return entry;
    });
  }
}
