import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleParamsDto } from './dto/role-params.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(AdminGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  getPermissions() {
    return this.rolesService.getPermissions();
  }

  @Post()
  @HttpCode(201)
  createRole(@Body() body: CreateRoleDto) {
    return this.rolesService.createRole(body);
  }

  @Delete(':role')
  deleteRole(@Param() params: RoleParamsDto) {
    return this.rolesService.deleteRole(params.role);
  }

  @Put('permissions')
  updatePermissions(@Body() body: UpdateRolePermissionsDto) {
    return this.rolesService.updatePermissions(body);
  }
}
