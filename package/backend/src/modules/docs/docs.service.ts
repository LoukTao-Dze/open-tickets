import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { UpdateDocsDto } from './update-docs.dto';

const GUIDE_ID = 'user-guide';
const DOCS_TABLE = 'documentation';
const DOCS_COLUMNS = 'content, updated_at';

interface DocumentationRow {
  content: string;
  updated_at: string;
}

@Injectable()
export class DocsService {
  private readonly logger = new Logger(DocsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getGuide() {
    const { data: guide, error } = await this.supabase
      .getClient()
      .from(DOCS_TABLE)
      .select(DOCS_COLUMNS)
      .eq('id', GUIDE_ID)
      .maybeSingle<DocumentationRow>();
    if (error) this.failPersistence('load', error.code);
    if (!guide) throw new NotFoundException('User guide is not configured');
    return this.toResponse(guide);
  }

  async updateGuide(body: UpdateDocsDto) {
    // Compare-and-swap prevents one admin from overwriting another admin's edits.
    const { data: guide, error } = await this.supabase
      .getClient()
      .from(DOCS_TABLE)
      .update({ content: body.content })
      .eq('id', GUIDE_ID)
      .eq('updated_at', body.updatedAt)
      .select(DOCS_COLUMNS)
      .maybeSingle<DocumentationRow>();
    if (error) this.failPersistence('save', error.code);
    if (!guide) {
      throw new ConflictException('Guide changed; reload before saving');
    }
    return this.toResponse(guide);
  }

  private toResponse(guide: DocumentationRow) {
    return { data: { content: guide.content, updatedAt: guide.updated_at } };
  }

  private failPersistence(operation: string, code: string): never {
    this.logger.error(
      `Failed to ${operation} user guide (database code: ${code})`,
    );
    throw new InternalServerErrorException('Unable to access user guide');
  }
}
