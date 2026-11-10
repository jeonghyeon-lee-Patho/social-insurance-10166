import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { Auth, authState, User } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, doc, deleteDoc, setDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { InsuranceRateMaster, InsuranceRegion, InsuranceType } from '../../models/insurance-rate.model';
import { getKyokaiRateByPrefecture, REGION_DISPLAY_MAP } from '../../data/insurance-rates.data';
import { EditInsuranceRateModalComponent } from './edit-insurance-rate-modal/edit-insurance-rate-modal.component';

@Component({
  selector: 'app-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, EditInsuranceRateModalComponent],
  templateUrl: './rates.component.html',
  styleUrl: './rates.component.css'
})
export class RatesComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  insuranceRates: InsuranceRateMaster[] = [];
  showEditModal = false;
  selectedRate: InsuranceRateMaster | null = null;
  isLoading = false;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private authSubscription?: Subscription;

  // 定数
  InsuranceType = InsuranceType;
  REGION_DISPLAY_MAP = REGION_DISPLAY_MAP;

  ngOnInit() {
    this.authSubscription = authState(this.auth).subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.loadInsuranceRates();
      } else {
        this.currentUser = null;
        this.insuranceRates = [];
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  /**
   * 保険基準一覧をFirestoreから読み込む
   */
  async loadInsuranceRates() {
    if (!this.currentUser) return;

    this.isLoading = true;
    try {
      const orgId = this.currentUser.uid;

      const insuranceRatesRef = collection(this.firestore, 'insurance_rates');
      const qRates = query(insuranceRatesRef, where('organizationId', '==', orgId));
      const ratesSnapshot = await getDocs(qRates);

      if (ratesSnapshot.empty) {
        await this.createDefaultRate();
        return;
      }

      const standardsRef = collection(this.firestore, 'insurance_standards');
      const qStandards = query(standardsRef, where('organizationId', '==', orgId));
      const standardsSnapshot = await getDocs(qStandards);

      const rateEmployeeMap = new Map<string, Set<string>>();

      standardsSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const rateId = data['insuranceRateMasterId'];
        const employeeId = data['employeeId'];

        if (rateId && employeeId && rateId !== 'N/A') {
          if (!rateEmployeeMap.has(rateId)) {
            rateEmployeeMap.set(rateId, new Set<string>());
          }
          rateEmployeeMap.get(rateId)!.add(employeeId);
        }
      });

      this.insuranceRates = ratesSnapshot.docs
        .map(d => {
          const data = d.data() as InsuranceRateMaster;
          const employeeCount = rateEmployeeMap.get(d.id)?.size || 0;
          return {
            ...data,
            id: d.id,
            applicableEmployeeCount: employeeCount
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('保険基準の読み込みに失敗しました:', error);
      alert('保険基準の読み込みに失敗しました。');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * デフォルトの保険基準（協会けんぽ_東京都）を新規作成
   */
  private async createDefaultRate() {
    if (!this.currentUser) return;
    try {
      const tokyoRate = getKyokaiRateByPrefecture('東京都');
      const collectionRef = collection(this.firestore, 'insurance_rates');
      const newDocRef = doc(collectionRef);
      const now = new Date().toISOString();

      const defaultRate: Omit<InsuranceRateMaster, 'id'> = {
        name: '協会けんぽ_東京都_2026',
        type: InsuranceType.KYOKAI,
        region: InsuranceRegion.KANTO,
        prefecture: '東京都',
        rates: {
          healthInsurance: tokyoRate ? tokyoRate.healthInsuranceRate : 9.98,
          careInsurance: tokyoRate ? tokyoRate.careInsuranceRate : 1.60,
          pensionInsurance: tokyoRate ? tokyoRate.pensionInsuranceRate : 18.30
        },
        burdenRatio: {
          employee: 50,
          employer: 50
        },
        applicableEmployeeCount: 0,

        createdAt: now,
        updatedAt: now,
        createdBy: this.currentUser.uid,
        organizationId: this.currentUser.uid,
        isActive: true
      };

      await setDoc(newDocRef, defaultRate);
      this.insuranceRates = [{ id: newDocRef.id, ...defaultRate }];
    } catch (error) {
      console.error('デフォルト保険基準の作成に失敗しました:', error);
    }
  }

  /**
   * 新規保険基準追加モーダルを開く
   */
  openAddModal() {
    this.selectedRate = null;
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  /**
   * 既存保険基準編集モーダルを開く
   */
  openEditModal(rate: InsuranceRateMaster) {
    this.selectedRate = rate;
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  /**
   * 編集モーダルを閉じる
   */
  closeEditModal() {
    this.showEditModal = false;
    this.selectedRate = null;
    this.cdr.detectChanges();
  }

  /**
   * 保険基準が保存された時の処理
   */
  onRateSaved() {
    this.closeEditModal();
    this.loadInsuranceRates();
  }

  /**
   * 保険基準を削除する
   */
  async deleteRate(rate: InsuranceRateMaster) {
    if (rate.applicableEmployeeCount > 0) {
      alert('適用中の社員がいるため、削除できません。');
      return;
    }

    if (this.insuranceRates.length === 1) {
      alert('少なくとも1つの保険基準は必ず存在する必要があります。唯一の基準は削除できません。');
      return;
    }

    if (!confirm(`「${rate.name}」を削除してもよろしいですか？`)) {
      return;
    }

    try {
      const rateDocRef = doc(this.firestore, 'insurance_rates', rate.id);
      await deleteDoc(rateDocRef);
      this.insuranceRates = this.insuranceRates.filter(r => r.id !== rate.id);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('保険基準の削除に失敗しました:', error);
      alert('削除に失敗しました。');
    }
  }

  /**
   * 地域の表示名を取得
   */
  getRegionLabel(region?: string): string {
    if (!region) return '全国共通';
    return REGION_DISPLAY_MAP[region as InsuranceRegion] || region;
  }
}
