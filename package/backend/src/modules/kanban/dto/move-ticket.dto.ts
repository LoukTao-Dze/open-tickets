import { IsIn } from 'class-validator';
import { KANBAN_COLUMN_IDS } from './create-ticket.dto';

export class MoveTicketDto {
  @IsIn(KANBAN_COLUMN_IDS)
  columnId: string;
}
