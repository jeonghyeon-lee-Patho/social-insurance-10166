import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Auth, authState, User } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
// データモデル
import { Employee, EmployeeView } from '../../models/employee.model';
import { InsuranceRateMaster } from '../../models/insurance-rate.model';
import { PremiumEmployeeView } from '../../models/premium.model';
import { toEmployeeViews, filterBySearch } from '../../utils/employee.util';

import {
  getAttributionYearMonth,
  checkEmployeeEligibility,
  resolveRatesAndExemptions,
  resolveInsuranceMultipliers,
  calculateMonthlyPremiums,
  calculateAnnualPremiums,
  resolveAlertMetadata,
  TabType,
  SegmentType,
  CollectionBasisType,
  isSameMonthHireAndRetire
} from '../../utils/insurance-calculator.util';

export type SortKey = 'employeeNumber' | 'name' | 'age' | 'hireDate' | 'totalPremium';
export type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-premium',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './premium.component.html',
  styleUrl: './premium.component.css'
})
export class PremiumComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  allEmployees: EmployeeView[] = [];
  activeTargetEmployees: PremiumEmployeeView[] = [];
  filteredEmployees: PremiumEmployeeView[] = [];

  // キャッシュ用プロパティ（過剰なFirestore通信を防止しUIフリーズを防ぐ）
  private cachedInsMap: Record<string, any[]> = {};
  private cachedSalMap: Record<string, any[]> = {};
  private cachedBonusMap: Record<string, any[]> = {};
  private isDataLoaded = false;

  // タブ・セグメント・徴収基準の選択状態
  activeTab: TabType = 'monthly';
  activeSegment: SegmentType = 'total';
  collectionBasis: CollectionBasisType = 'nextMonth';

  // 照会年月
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  selectedAnnualFiscalYear: number = this.getCurrentFiscalYear();

  availableYears: number[] = [];
  currentEligibleCount = 0;

  // ツールバー条件
  searchText = '';
  sortKey: SortKey = 'employeeNumber';
  sortDirection: SortDirection = 'asc';
  selectedInsuranceStandard: string = '';
  availableInsuranceStandards: string[] = [];
  insuranceRateMastersMap: Record<string, InsuranceRateMaster> = {};

  isLoading = false;
  expandedEmployeeId: string | null = null;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private authSubscription?: Subscription;

  ngOnInit() {
    this.authSubscription = authState(this.auth).subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.loadData();
      } else {
        this.currentUser = null;
        this.allEmployees = [];
        this.activeTargetEmployees = [];
        this.filteredEmployees = [];
        this.isDataLoaded = false;
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  private getCurrentFiscalYear(): number {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month < 4 ? year - 1 : year;
  }

  /**
   * 社員の最古入社年月から現在年+1年までの選択肢を動的生成
   */
  private updateAvailableYears() {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear - 3;

    if (this.allEmployees.length > 0) {
      const hireYears = this.allEmployees
        .map(e => e.hireDate ? parseInt(e.hireDate.split('-')[0], 10) : null)
        .filter((y): y is number => y !== null && !isNaN(y) && y >= 1950);

      if (hireYears.length > 0) {
        minYear = Math.min(...hireYears);
      }
    }

    const maxYear = currentYear + 1;
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push(y);
    }
    this.availableYears = years;

    if (!this.availableYears.includes(this.selectedYear)) {
      this.selectedYear = currentYear;
    }
    if (!this.availableYears.includes(this.selectedAnnualFiscalYear)) {
      this.selectedAnnualFiscalYear = this.getCurrentFiscalYear();
    }
  }

  /**
   * Firestoreから事業所の関連データを一括読み込み
   */
  async loadData() {
    if (!this.currentUser) return;
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const orgId = this.currentUser.uid;
      await this.loadInsuranceRateMasters(orgId);

      const empQuery = query(collection(this.firestore, 'employees'), where('organizationId', '==', orgId));
      const empSnapshot = await getDocs(empQuery);
      this.allEmployees = toEmployeeViews(
        empSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Employee)
      );

      // 社員データに基づく年度選択肢の更新
      this.updateAvailableYears();

      this.cachedInsMap = await this.loadRecordsMap('insurance_standards', orgId);
      this.cachedSalMap = await this.loadRecordsMap('salary_standards', orgId);
      this.cachedBonusMap = await this.loadRecordsMap('bonus_histories', orgId);
      this.isDataLoaded = true;

      // 取得したキャッシュを使って計算・描画
      this.recalculateDisplay();
    } catch (error) {
      console.error('保険料データの読み込みに失敗しました:', error);
      alert('保険料データの読み込みに失敗しました。');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadInsuranceRateMasters(orgId: string) {
    try {
      const ratesQuery = query(collection(this.firestore, 'insurance_rates'), where('organizationId', '==', orgId));
      const snapshot = await getDocs(ratesQuery);
      const standards = new Set<string>();
      this.insuranceRateMastersMap = {};

      snapshot.docs.forEach(d => {
        const data = { id: d.id, ...d.data() } as InsuranceRateMaster;
        if (data.name) {
          standards.add(data.name);
          this.insuranceRateMastersMap[data.id] = data;
          this.insuranceRateMastersMap[data.name] = data;
        }
      });
      this.availableInsuranceStandards = Array.from(standards).sort();
    } catch (e) {
      console.error('保険基準マスタ読み込みエラー:', e);
    }
  }

  private async loadRecordsMap(collectionName: string, orgId: string): Promise<Record<string, any[]>> {
    const q = query(collection(this.firestore, collectionName), where('organizationId', '==', orgId));
    const snap = await getDocs(q);
    const result: Record<string, any[]> = {};

    snap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      const empId = data['employeeId'] as string;
      if (empId) {
        if (!result[empId]) {
          result[empId] = [];
        }
        result[empId].push({ id: d.id, ...data });
      }
    });
    return result;
  }


  /**
   * UI条件（年月・タブ・徴収基準）が変更された際に、キャッシュから即座に再計算する
   */
  private recalculateDisplay() {
    if (!this.isDataLoaded) return;
    this.buildTargetEmployees(this.cachedInsMap, this.cachedSalMap, this.cachedBonusMap);
    this.applyFiltersAndSort();
  }

  private buildTargetEmployees(
    insMap: Record<string, any[]>,
    salMap: Record<string, any[]>,
    bonusMap: Record<string, any[]>
  ) {
    const targetYear = Number(this.selectedYear);
    const targetMonth = Number(this.selectedMonth);
    const targetYM = targetYear * 100 + targetMonth;

    const effectiveBasis: CollectionBasisType = (this.activeTab === 'annual' || this.activeSegment === 'bonus')
      ? 'currentMonth'
      : this.collectionBasis;

    const fiscalYearNum = Number(this.selectedAnnualFiscalYear);
    const fiscalStartYM = fiscalYearNum * 100 + 4;
    const fiscalEndYM = (fiscalYearNum + 1) * 100 + 3;

    let eligibleCount = 0;
    const result: PremiumEmployeeView[] = [];

    for (const emp of this.allEmployees) {
      const isSameMonth = isSameMonthHireAndRetire(emp.hireDate, emp.retirementDate);
      const empBasis: CollectionBasisType = isSameMonth ? 'currentMonth' : effectiveBasis;

      const { attrYear: empAttrYear, attrMonth: empAttrMonth, attrYM: empAttrYM } = getAttributionYearMonth(
        targetYear,
        targetMonth,
        empBasis
      );

      const eligibility = checkEmployeeEligibility(
        emp, targetYear, targetMonth, targetYM, empAttrYM, fiscalStartYM, fiscalEndYM,
        salMap, bonusMap, empBasis, this.activeTab, this.activeSegment
      );

      if (eligibility.isEligibleForDenominator) eligibleCount++;
      if (!eligibility.shouldDisplayInTable) continue;

      if (this.activeTab === 'annual') {
        const resolvedRates = resolveRatesAndExemptions(
          emp, empAttrYM, empAttrYear, empAttrMonth, insMap, this.insuranceRateMastersMap
        );

        const annualCalc = calculateAnnualPremiums(
          emp, fiscalYearNum, salMap, bonusMap, insMap, this.insuranceRateMastersMap, 'currentMonth'
        );

        result.push({
          ...emp,
          insuranceStandardName: resolvedRates.masterName,
          totalRemuneration: 0,
          monthlySalary: 0,
          salaryGrade: '-',
          bonusAmount: 0,
          annualHealth: annualCalc.annualHealth,
          annualCare: annualCalc.annualCare,
          annualPension: annualCalc.annualPension,
          employeeShare: annualCalc.employeeShare,
          companyShare: annualCalc.companyShare,
          totalPremium: annualCalc.totalPremium,
          isNewHire: false,
          isRetiredThisMonth: false,
          isAgeTransition: false,
          breakdown: {} as any,
          annualBreakdown: annualCalc.annualBreakdown
        });
      } else {
        const resolvedSalaryRates = resolveRatesAndExemptions(
          emp, empAttrYM, empAttrYear, empAttrMonth, insMap, this.insuranceRateMastersMap
        );
        const resolvedBonusRates = resolveRatesAndExemptions(
          emp, targetYM, targetYear, targetMonth, insMap, this.insuranceRateMastersMap
        );

        const isTwoMonthsCollection = (!isSameMonth && empBasis === 'nextMonth' && targetYM === eligibility.collEndYM && eligibility.isEndOfMonthRetirement && !resolvedSalaryRates.isExemptStandard && (eligibility.currentSal?.monthlyAmount ?? 0) > 0);

        const targetRates = isTwoMonthsCollection
          ? resolveRatesAndExemptions(emp, targetYM, targetYear, targetMonth, insMap, this.insuranceRateMastersMap)
          : resolvedSalaryRates;

        const multipliers = resolveInsuranceMultipliers(resolvedSalaryRates, targetRates, isTwoMonthsCollection);

        const calculation = calculateMonthlyPremiums(
          eligibility.currentSal,
          eligibility.currentBonus,
          resolvedSalaryRates,
          resolvedBonusRates,
          multipliers,
          isTwoMonthsCollection,
          this.activeSegment
        );

        const hasBonusThisMonth = !!eligibility.currentBonus;

        const alertMeta = resolveAlertMetadata(
          emp, targetYM, eligibility.collStartYM, eligibility.collEndYM,
          eligibility.isEndOfMonthRetirement, resolvedSalaryRates.currentIns,
          empAttrYear, empAttrMonth, empBasis, this.activeSegment, hasBonusThisMonth
        );

        result.push({
          ...emp,
          insuranceStandardName: resolvedSalaryRates.masterName,
          totalRemuneration: calculation.totalRemuneration,
          monthlySalary: calculation.monthlySalary,
          salaryGrade: calculation.salaryGrade,
          bonusAmount: calculation.bonusAmount,
          annualHealth: calculation.annualHealth,
          annualCare: calculation.annualCare,
          annualPension: calculation.annualPension,
          employeeShare: calculation.finalEmpShare,
          companyShare: calculation.finalCompShare,
          totalPremium: calculation.finalTotal,
          isNewHire: alertMeta.isNewHire,
          isRetiredThisMonth: alertMeta.isRetiredThisMonth,
          isAgeTransition: alertMeta.isAgeTransition,
          noticeMessage: alertMeta.noticeMessage,
          breakdown: calculation.breakdown
        });
      }
    }

    this.currentEligibleCount = eligibleCount;
    this.activeTargetEmployees = result;
  }

  /**
   * フィルターおよびソートの適用
   */
  applyFiltersAndSort() {
    let filtered = filterBySearch(this.activeTargetEmployees, this.searchText) as PremiumEmployeeView[];

    if (this.activeTab === 'monthly' && this.selectedInsuranceStandard) {
      filtered = filtered.filter(e => e.insuranceStandardName === this.selectedInsuranceStandard);
    }

    filtered = this.sortEmployeeList(filtered, this.sortKey, this.sortDirection);
    this.filteredEmployees = filtered;
    this.cdr.detectChanges();
  }

  /**
   * 社員リストのソート処理（社員番号、氏名、年齢、入社日、総保険料）
   */
  private sortEmployeeList(list: PremiumEmployeeView[], key: SortKey, direction: SortDirection): PremiumEmployeeView[] {
    const factor = direction === 'asc' ? 1 : -1;

    return [...list].sort((a, b) => {
      switch (key) {
        case 'employeeNumber':
          return (a.employeeNumber ?? '').localeCompare(b.employeeNumber ?? '', 'ja', { numeric: true }) * factor;
        case 'name':
          return (a.nameKana ?? '').localeCompare(b.nameKana ?? '', 'ja') * factor;
        case 'age': {
          const ageDiff = (a.age ?? 0) - (b.age ?? 0);
          if (ageDiff !== 0) return ageDiff * factor;
          return (new Date(a.dateOfBirth).getTime() - new Date(b.dateOfBirth).getTime()) * factor;
        }
        case 'hireDate':
          return (new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime()) * factor;
        case 'totalPremium':
          return ((a.totalPremium ?? 0) - (b.totalPremium ?? 0)) * factor;
        default:
          return 0;
      }
    });
  }

  get totalSegmentSum() {
    return this.filteredEmployees.reduce((acc, emp) => {
      const remun = this.activeSegment === 'bonus' ? (emp.bonusAmount || 0) : (emp.totalRemuneration || 0);
      acc.remuneration += remun;
      acc.employee += (emp.employeeShare || 0);
      acc.company += (emp.companyShare || 0);
      acc.premium += (emp.totalPremium || 0);
      return acc;
    }, { remuneration: 0, employee: 0, company: 0, premium: 0 });
  }

  get salarySegmentSum() {
    return this.filteredEmployees.reduce((acc, emp) => {
      acc.salary += (emp.monthlySalary || 0);
      acc.employee += (emp.employeeShare || 0);
      acc.company += (emp.companyShare || 0);
      acc.premium += (emp.totalPremium || 0);
      return acc;
    }, { salary: 0, employee: 0, company: 0, premium: 0 });
  }

  get annualSegmentSum() {
    return this.filteredEmployees.reduce((acc, emp) => {
      acc.health += (emp.annualHealth || 0);
      acc.care += (emp.annualCare || 0);
      acc.pension += (emp.annualPension || 0);
      acc.employee += (emp.employeeShare || 0);
      acc.company += (emp.companyShare || 0);
      acc.premium += (emp.totalPremium || 0);
      return acc;
    }, { health: 0, care: 0, pension: 0, employee: 0, company: 0, premium: 0 });
  }

  /* ========== 変更イベント（都度フェッチせずキャッシュから即座に再計算） ========== */

  selectTab(tab: TabType) {
    this.activeTab = tab;
    this.recalculateDisplay();
  }

  selectSegment(segment: SegmentType) {
    this.activeSegment = segment;
    this.recalculateDisplay();
  }

  onCollectionBasisChange() {
    this.recalculateDisplay();
  }

  onSearchInput(event: Event) {
    this.searchText = (event.target as HTMLInputElement).value;
    this.applyFiltersAndSort();
  }

  onSortChange() {
    this.applyFiltersAndSort();
  }

  onInsuranceStandardFilterChange() {
    this.applyFiltersAndSort();
  }

  onMonthlyDateChange() {
    this.selectedYear = Number(this.selectedYear);
    this.selectedMonth = Number(this.selectedMonth);
    this.recalculateDisplay();
  }

  onAnnualDateChange() {
    this.selectedAnnualFiscalYear = Number(this.selectedAnnualFiscalYear);
    this.recalculateDisplay();
  }

  toggleDetailExpand(employeeId: string, event: Event) {
    event.stopPropagation();
    this.expandedEmployeeId = this.expandedEmployeeId === employeeId ? null : employeeId;
    this.cdr.detectChanges();
  }

  getRowClass(employee: PremiumEmployeeView): string {
    if (this.activeTab === 'annual') return '';

    if (employee.isRetiredThisMonth) return 'highlight-retired';
    if (employee.isNewHire) return 'highlight-new-hire';
    if (employee.isAgeTransition) return 'highlight-age-transition';
    return '';
  }

  getFiscalYearRange(): string {
    const startYear = this.selectedAnnualFiscalYear;
    return `${startYear}年04月〜${startYear + 1}年03月`;
  }
}
