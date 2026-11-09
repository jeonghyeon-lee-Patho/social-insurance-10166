import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const firestore = inject(Firestore);

  const user = await firstValueFrom(authState(auth).pipe(take(1)));

  if (user && user.emailVerified) {
    try {
      const userDocRef = doc(firestore, 'social_users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        return true;
      }
    } catch (error) {
      console.error('ユーザー権限の確認に失敗しました:', error);
    }
  }

  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
}; 
