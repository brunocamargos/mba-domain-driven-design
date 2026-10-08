import { IRepository } from '../../../common/domain/repository-interface';
import { EventSpotId } from '../entities/event-spot';
import { Event } from '../entities/event.entity';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IEventRepository extends IRepository<Event> {
  findByEventSpotId(spot_id: EventSpotId): Promise<Event | null>;
}
