import { Routes } from '@angular/router';
import { EmployeesComponent } from './categories/employees/employees.component';
import { RatesComponent } from './categories/rates/rates.component';
import { LoginComponent } from './login/login.component';
import { authGuard } from './guards/auth.guard';
import { PremiumComponent } from './categories/premium/premium.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'employees', component: EmployeesComponent, canActivate: [authGuard] },
  { path: 'rates', component: RatesComponent, canActivate: [authGuard] },
  { path: 'premium', component: PremiumComponent, canActivate: [authGuard] },
];
