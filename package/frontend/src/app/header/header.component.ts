import { Component, inject } from '@angular/core';
import { LayoutService } from '../services/layout.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  layout = inject(LayoutService);
  src = '';
  //'https://lh3.googleusercontent.com/aida-public/AB6AXuBVgfOzMV3fpDh3uhW0PqjyR7BeJWGrSSC92egleKVb9teQiAzXOTK28YvNHftQV19_f7vj0GdM7vKVX7KhOF7MQX6yEhcw9YYi9-RMcaeLSme6X-x7WMUo08ZPW5hJ6rXu_-OAVckmxljFaB0S679Rh4d5yzFPh1hv4lsaKtWwSioxgmMGs5kGz3hh7V7N5WmMqrkTAGKqc2GqNDHY6SfNIh70WfBig3RRR_iqt5uJbCnC3WZdBtAT9VjmEAjumbntP9mM-0g1CGVn';
}
