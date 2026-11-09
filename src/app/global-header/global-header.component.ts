import { Component, OnInit, ChangeDetectorRef, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, signOut, authState, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-global-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './global-header.component.html',
  styleUrl: './global-header.component.css'
})
export class GlobalHeaderComponent implements OnInit, OnDestroy {
  @ViewChild('orgNameInput') orgNameInput?: ElementRef<HTMLInputElement>;

  currentUser: User | null = null;
  userEmail: string = '';
  organizationName: string = '未設定の事業所';
  isEditingOrganization: boolean = false;
  editedOrgName: string = '';
  activeTab: string = 'premium';

  private authSubscription?: Subscription;
  private routerSubscription?: Subscription;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    // ログイン中のユーザー情報を取得
    this.authSubscription = authState(this.auth).subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.userEmail = user.email || '';
        this.loadOrganizationName();
      } else {
        this.currentUser = null;
        this.userEmail = '';
        this.organizationName = '未設定の事業所';
      }
      this.cdr.detectChanges();
    });

    // 現在のルートを監視してアクティブタブを判定
    this.routerSubscription = this.router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => {
      this.updateActiveTab();
      this.cdr.detectChanges(); 
    });
    
    this.updateActiveTab();
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }

  updateActiveTab() {
    if (this.router.url.includes('/rates')) {
      this.activeTab = 'rates';
    } else if (this.router.url.includes('/employees')) {
      this.activeTab = 'employees';
    } else {
      this.activeTab = 'premium';
    }
  }

  async loadOrganizationName() {
    if (!this.currentUser) return;

    try {
      const userDocRef = doc(this.firestore, 'social_users', this.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data()['organizationName']) {
        this.organizationName = userDocSnap.data()['organizationName'];
      }
      this.cdr.detectChanges();
    } catch (error) {
      console.error('組織名の読み込みに失敗しました:', error);
    }
  }

  startEditingOrganization() {
    this.isEditingOrganization = true;
    this.editedOrgName = this.organizationName;
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.orgNameInput) {
        this.orgNameInput.nativeElement.focus();
      }
    }, 0);
  }


  async saveOrganizationName() {
    if (!this.isEditingOrganization || !this.currentUser || !this.editedOrgName.trim()) {
      return;
    }
  
    const previousName = this.organizationName;
    const newName = this.editedOrgName.trim();
    this.organizationName = newName;
    this.isEditingOrganization = false;
    this.cdr.detectChanges();
  
    try {
      const userDocRef = doc(this.firestore, 'social_users', this.currentUser.uid);
      await setDoc(userDocRef, { organizationName: newName }, { merge: true });
    } catch (error) {
      console.error('組織名の保存に失敗しました:', error);
      this.organizationName = previousName;
      this.cdr.detectChanges();
      alert('組織名の保存に失敗しました。');
    }
  }

  cancelEditingOrganization() {
    this.isEditingOrganization = false;
    this.editedOrgName = '';
    this.cdr.detectChanges();
  }

  async logout() {
    try {
      await signOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      alert('ログアウトに失敗しました。');
    }
  }

  navigateToTab(tab: string) {
    this.activeTab = tab;
    
    if (tab === 'employees') { 
      this.router.navigate(['/employees']);
    } else if (tab === 'rates') {
      this.router.navigate(['/rates']);
    } else if (tab === 'premium') {
      this.router.navigate(['/premium']);
    }
  }

  navigateToHome() {
    this.activeTab = 'premium';
    this.router.navigate(['/premium']);
  }
}
