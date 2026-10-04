import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { FileStorageController } from './file-storage.controller';
import { FileStorageService } from './file-storage.service';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveQuotaService } from './google-drive-quota.service';

@Module({
  imports: [SupabaseModule],
  controllers: [FileStorageController],
  providers: [FileStorageService, GoogleDriveService, GoogleDriveQuotaService],
})
export class FileStorageModule {}
