import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const DRIVE_SERVICE = 'drive.googleapis.com';

const QUOTA_USAGE_METRIC = 'serviceruntime.googleapis.com/quota/rate/net_usage';

const QUOTA_LIMIT_METRIC = 'serviceruntime.googleapis.com/quota/limit';

export interface QuotaMetric {
  quotaMetric: string;
  limitName?: string;
  usage: number;
  limit: number;
}

@Injectable()
export class GoogleDriveQuotaService {
  private monitoringClient?: ReturnType<typeof google.monitoring>;

  constructor(private readonly configService: ConfigService) {}

  private getMonitoringClient() {
    if (this.monitoringClient) {
      return this.monitoringClient;
    }

    const clientId = this.configService.get<string>('GOOGLE_DRIVE_CLIENT_ID');

    const clientSecret = this.configService.get<string>(
      'GOOGLE_DRIVE_CLIENT_SECRET',
    );

    const refreshToken = this.configService.get<string>(
      'GOOGLE_DRIVE_REFRESH_TOKEN',
    );

    if (!clientId || !clientSecret || !refreshToken) {
      throw new ServiceUnavailableException(
        'Google Drive OAuth is not configured',
      );
    }

    const auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.configService.get<string>('GOOGLE_DRIVE_REDIRECT_URI'),
    );

    auth.setCredentials({
      refresh_token: refreshToken,
    });

    this.monitoringClient = google.monitoring({
      version: 'v3',
      auth,
    });

    return this.monitoringClient;
  }

  async getQuota() {
    const projectId = this.configService.get<string>('GOOGLE_CLOUD_PROJECT_ID');

    if (!projectId) {
      throw new ServiceUnavailableException(
        'GOOGLE_CLOUD_PROJECT_ID is not configured',
      );
    }

    const projectName = `projects/${projectId}`;

    const [usageResponse, limitResponse] = await Promise.all([
      this.getQuotaUsage(projectName),
      this.getQuotaLimits(projectName),
    ]);

    return {
      service: DRIVE_SERVICE,
      projectId,
      usage: usageResponse,
      limits: limitResponse,
    };
  }

  private async getQuotaUsage(projectName: string): Promise<QuotaMetric[]> {
    const monitoring = this.getMonitoringClient();

    const now = new Date();

    const start = new Date(now.getTime() - 5 * 60 * 1000);

    const response = await monitoring.projects.timeSeries.list({
      name: projectName,
      filter: [
        `metric.type="${QUOTA_USAGE_METRIC}"`,
        `resource.type="consumer_quota"`,
        `resource.labels.service="${DRIVE_SERVICE}"`,
      ].join(' AND '),
      'interval.startTime': start.toISOString(),
      'interval.endTime': now.toISOString(),
    });

    return (response.data.timeSeries ?? []).map((series) => {
      const quotaMetric = series.metric?.labels?.quota_metric ?? '';

      const limitName = series.metric?.labels?.limit_name;

      const point = series.points?.[0];

      const usage = Number(point?.value?.int64Value ?? 0);

      return {
        quotaMetric,
        limitName,
        usage,
        limit: 0,
      };
    });
  }

  private async getQuotaLimits(projectName: string): Promise<QuotaMetric[]> {
    const monitoring = this.getMonitoringClient();

    const now = new Date();

    const start = new Date(now.getTime() - 5 * 60 * 1000);

    const response = await monitoring.projects.timeSeries.list({
      name: projectName,
      filter: [
        `metric.type="${QUOTA_LIMIT_METRIC}"`,
        `resource.type="consumer_quota"`,
        `resource.labels.service="${DRIVE_SERVICE}"`,
      ].join(' AND '),
      'interval.startTime': start.toISOString(),
      'interval.endTime': now.toISOString(),
    });

    return (response.data.timeSeries ?? []).map((series) => {
      const quotaMetric = series.metric?.labels?.quota_metric ?? '';

      const limitName = series.metric?.labels?.limit_name;

      const point = series.points?.[0];

      const limit = Number(point?.value?.int64Value ?? 0);

      return {
        quotaMetric,
        limitName,
        usage: 0,
        limit,
      };
    });
  }
}
