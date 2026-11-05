import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
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

  @Put('permissions')
  updatePermissions(@Body() body: UpdateRolePermissionsDto) {
    return this.rolesService.updatePermissions(body);
  }
}
