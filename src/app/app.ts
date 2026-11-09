import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GlobalHeaderComponent } from './global-header/global-header.component';
import { filter } from 'rxjs/operators';


@Component({
  standalone: true,
  imports: [RouterOutlet, CommonModule, GlobalHeaderComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('SociCal');

  private router = inject(Router);
  showHeader: boolean = true;

  ngOnInit() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.showHeader = !event.urlAfterRedirects.includes('/login');
      });
  }
}
