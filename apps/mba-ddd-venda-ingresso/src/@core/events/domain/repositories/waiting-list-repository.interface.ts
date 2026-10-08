import { IRepository } from '../../../common/domain/repository-interface';
import { EventSectionId } from '../entities/event-section';
import { EventId } from '../entities/event.entity';
import { WaitingList } from '../entities/waiting-list.entity';

export interface IWaitingListRepository extends IRepository<WaitingList> {
  findByEventAndSection(
    event_id: EventId,
    section_id: EventSectionId,
  ): Promise<WaitingList | null>;
}
