import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SceneDto, SceneStatus } from './dto/scene.dto';
import { TestSuiteDto } from './dto/test-suite.dto';

interface TestSuiteRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: string;
  last_scene_update_at: string | null;
  kanban_ticket_ids: string[];
}

interface SceneRow {
  id: string;
  project_id: string;
  suite_id: string | null;
  scene_no: string;
  test: string;
  status: SceneStatus;
  details_issue: string | null;
  expected_result: string | null;
  action: string | null;
  data_test: string | null;
  remark: string | null;
  created_at: string;
}

const SCENE_COLUMNS =
  'id, project_id, suite_id, scene_no, test, status, details_issue, expected_result, action, data_test, remark, created_at';
const SUITE_COLUMNS =
  'id, project_id, name, description, created_at, last_scene_update_at, kanban_ticket_ids';
const FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class ScenesService {
  private readonly logger = new Logger(ScenesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async listSuites(projectId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('test_suites')
      .select(SUITE_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .returns<TestSuiteRow[]>();
    if (error) this.fail('load test suites', error.message);
    return (data ?? []).map((suite: TestSuiteRow) => this.mapSuite(suite));
  }

  async createSuite(projectId: string, suite: TestSuiteDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('test_suites')
      .insert({
        project_id: projectId,
        name: suite.name,
        description: suite.description ?? '',
        ...(suite.kanbanTicketIds !== undefined && {
          kanban_ticket_ids: suite.kanbanTicketIds,
        }),
      })
      .select(SUITE_COLUMNS)
      .single<TestSuiteRow>();
    if (error) this.failSuiteWrite('create test suite', error);
    return this.mapSuite(data);
  }

  async updateSuite(projectId: string, suiteId: string, suite: TestSuiteDto) {
    const destinationProjectId = suite.projectId ?? projectId;
    if (destinationProjectId !== projectId) {
      const { data, error } = await this.supabase
        .getClient()
        .rpc('move_test_suite', {
          source_project_id: projectId,
          suite_id: suiteId,
          destination_project_id: destinationProjectId,
          suite_name: suite.name,
          suite_description: suite.description ?? null,
          suite_kanban_ticket_ids: suite.kanbanTicketIds,
        })
        .maybeSingle<TestSuiteRow>();
      if (error) this.failSuiteWrite('move test suite', error);
      if (!data) throw new NotFoundException('Test suite not found');
      return this.mapSuite(data);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('test_suites')
      .update({
        name: suite.name,
        description: suite.description,
        ...(suite.kanbanTicketIds !== undefined && {
          kanban_ticket_ids: suite.kanbanTicketIds,
        }),
      })
      .eq('project_id', projectId)
      .eq('id', suiteId)
      .select(SUITE_COLUMNS)
      .maybeSingle<TestSuiteRow>();
    if (error) this.failSuiteWrite('update test suite', error);
    if (!data) throw new NotFoundException('Test suite not found');
    return this.mapSuite(data);
  }

  async deleteSuite(projectId: string, suiteId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('test_suites')
      .delete()
      .eq('project_id', projectId)
      .eq('id', suiteId)
      .select('id')
      .maybeSingle();
    if (error?.code === FOREIGN_KEY_VIOLATION)
      throw new ConflictException(
        'Move or delete all scenes before deleting this suite',
      );
    if (error) this.fail('delete test suite', error.message);
    if (!data) throw new NotFoundException('Test suite not found');
    return { id: suiteId };
  }

  private mapSuite(suite: TestSuiteRow) {
    return {
      id: suite.id,
      projectId: suite.project_id,
      name: suite.name,
      description: suite.description,
      createdAt: suite.created_at,
      lastSceneUpdateAt: suite.last_scene_update_at,
      kanbanTicketIds: suite.kanban_ticket_ids ?? [],
    };
  }

  async list(projectId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('scenes')
      .select(SCENE_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .returns<SceneRow[]>();
    if (error) this.fail('load scenes', error.message);
    return (data ?? []).map((scene: SceneRow) => this.mapScene(scene));
  }

  async create(projectId: string, scene: SceneDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('scenes')
      .insert({ project_id: projectId, ...this.toRow(scene) })
      .select(SCENE_COLUMNS)
      .single<SceneRow>();
    if (error) this.failSceneWrite('create scene', error);
    return this.mapScene(data);
  }

  update(projectId: string, sceneId: string, scene: SceneDto) {
    return this.updateRow(projectId, sceneId, this.toRow(scene));
  }

  updateStatus(projectId: string, sceneId: string, status: SceneStatus) {
    return this.updateRow(projectId, sceneId, { status });
  }

  async delete(projectId: string, sceneId: string) {
    // Scope deletion to the authorized project to prevent cross-project access.
    const { data, error } = await this.supabase
      .getClient()
      .from('scenes')
      .delete()
      .eq('project_id', projectId)
      .eq('id', sceneId)
      .select('id')
      .maybeSingle();
    if (error) this.fail('delete scene', error.message);
    if (!data) throw new NotFoundException('Scene not found');
    return { id: sceneId };
  }

  private async updateRow(
    projectId: string,
    sceneId: string,
    row: Partial<ReturnType<ScenesService['toRow']>>,
  ) {
    const { data, error } = await this.supabase
      .getClient()
      .from('scenes')
      .update(row)
      .eq('project_id', projectId)
      .eq('id', sceneId)
      .select(SCENE_COLUMNS)
      .maybeSingle<SceneRow>();
    if (error) this.failSceneWrite('update scene', error);
    if (!data) throw new NotFoundException('Scene not found');
    return this.mapScene(data);
  }

  private toRow(scene: SceneDto) {
    return {
      suite_id: scene.suiteId,
      scene_no: scene.sceneNo,
      test: scene.test,
      status: scene.status,
      details_issue: scene.detailsIssue,
      expected_result: scene.expectedResult,
      action: scene.action,
      data_test: scene.dataTest,
      remark: scene.remark,
    };
  }

  private mapScene(scene: SceneRow) {
    return {
      id: scene.id,
      projectId: scene.project_id,
      suiteId: scene.suite_id,
      sceneNo: scene.scene_no,
      test: scene.test,
      status: scene.status,
      detailsIssue: scene.details_issue ?? '',
      expectedResult: scene.expected_result ?? '',
      action: scene.action ?? '',
      dataTest: scene.data_test ?? '',
      remark: scene.remark ?? '',
      createdAt: scene.created_at,
    };
  }

  private failSceneWrite(
    operation: string,
    error: { code: string; message: string },
  ): never {
    if (error.code === FOREIGN_KEY_VIOLATION)
      throw new BadRequestException('Choose a test suite from this project');
    this.fail(operation, error.message);
  }

  private failSuiteWrite(
    operation: string,
    error: { code: string; message: string },
  ): never {
    if (error.code === FOREIGN_KEY_VIOLATION)
      throw new BadRequestException('Choose Kanban cards from this project');
    this.fail(operation, error.message);
  }

  private fail(operation: string, message: string): never {
    this.logger.error(`Failed to ${operation}: ${message}`);
    throw new InternalServerErrorException(`Failed to ${operation}`);
  }
}
