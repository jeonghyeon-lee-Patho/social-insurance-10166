import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InsuranceStandard, InsuranceStandardView, InsuranceExceptionType } from '../../../../models/insurance-standard.model';
import { SalaryStandard, SalaryStandardView } from '../../../../models/salary-standard.model';
import { BonusHistory, BonusHistoryView } from '../../../../models/bonus-history.model';
import { InsuranceRateMaster } from '../../../../models/insurance-rate.model';
import { EditInsuranceStandardModalComponent } from '../edit-insurance-standard-modal/edit-insurance-standard-modal.component';
import { EditSalaryStandardModalComponent } from '../edit-salary-standard-modal/edit-salary-standard-modal.component';
import { EditBonusHistoryModalComponent } from '../edit-bonus-history-modal/edit-bonus-history-modal.component';
import { SalarySimulatorRegularComponent } from '../salary-simulator-regular/salary-simulator-regular.component';
import { SalarySimulatorChangedComponent } from '../salary-simulator-changed/salary-simulator-changed.component';
import { RegularDecisionResult, VarChangedDecisionResult, getVarChangedApplicationPeriod } from '../../../../utils/salary-simulator.util';
import { calculateInsuranceEndYearMonth } from '../../../../utils/insurance-calculator.util';

@Component({
  selector: 'app-edit-employee-step2',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, EditInsuranceStandardModalComponent, EditSalaryStandardModalComponent, EditBonusHistoryModalComponent, SalarySimulatorRegularComponent, SalarySimulatorChangedComponent],
  templateUrl: './edit-employee-step2.component.html',
  styleUrl: './edit-employee-step2.component.css'
})
export class EditEmployeeStep2Component {
  // 親コンポーネントからの入力
  @Input() employeeNumber: string = '';
  @Input() displayName: string = '';
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';
  @Input() insuranceRateMasters: InsuranceRateMaster[] = [];

  // Step2のデータ状態（フォーム非保存時）
  @Input() insuranceStandardList: InsuranceStandardView[] = [];
  @Input() salaryStandardList: SalaryStandardView[] = [];
  @Input() bonusHistoryList: BonusHistoryView[] = [];
  @Input() hasPreviousInsurance = false;
  @Input() previousInsuranceAmount = 0;
  
  // Step2から親コンポーネントへの出力
  @Output() insuranceStandardsChange = new EventEmitter<InsuranceStandardView[]>();
  @Output() salaryStandardsChange = new EventEmitter<SalaryStandardView[]>();
  @Output() bonusHistoryChange = new EventEmitter<BonusHistoryView[]>();
  @Output() previousInsuranceChange = new EventEmitter<{ hasPreviousInsurance: boolean; previousInsuranceAmount: number }>();

  // Step2内のモーダル管理（社会保険適用基準）
  isEditingFirstRecord = false;
  isInsuranceStandardModalOpen = false;
  selectedInsuranceStandard: InsuranceStandardView | null = null;
  
  // Step2内のモーダル管理（報酬月額）
  isSalaryStandardModalOpen = false;
  selectedSalaryStandard: SalaryStandard | null = null;

  // Step2内のモーダル管理（賞与額支給実績）
  isBonusHistoryModalOpen = false;
  selectedBonusHistory: BonusHistory | null = null;

  private cdr = inject(ChangeDetectorRef);

  /**
   * ======================================================================
   * 社会保険適用基準および資格・免除履歴 の管理
   * ======================================================================
   */
  isHireDateRecord(record: InsuranceStandardView): boolean {
    if (!this.hireDate) return false;
    const [hY, hM] = this.hireDate.split('-').map(Number);
    return record.effectiveStartYear === hY && record.effectiveStartMonth === hM;
  }

  openInsuranceStandardModal(record?: InsuranceStandardView) {
    this.selectedInsuranceStandard = record ? { ...record } : null;
    this.isEditingFirstRecord = record ? this.isHireDateRecord(record) : false;
    this.isInsuranceStandardModalOpen = true;
    this.cdr.detectChanges();
  }

  closeInsuranceStandardModal() {
    this.isInsuranceStandardModalOpen = false;
    this.selectedInsuranceStandard = null;
    this.cdr.detectChanges();
  }

  saveInsuranceStandard(insuranceStandard: InsuranceStandard) {
    const now = new Date().toISOString();
    const updatedList = [...this.insuranceStandardList];

    if (this.selectedInsuranceStandard && this.selectedInsuranceStandard.id) {
      // 編集時
      const index = updatedList.findIndex(r => r.id === this.selectedInsuranceStandard?.id);
      if (index >= 0) {
        insuranceStandard.updatedAt = now;
        updatedList[index] = this.toInsuranceStandardView(insuranceStandard);
      }
    } else {
      // 新規追加時
      insuranceStandard.id = `insurance_${Date.now()}`;
      insuranceStandard.createdAt = now;
      insuranceStandard.updatedAt = now;
      updatedList.push(this.toInsuranceStandardView(insuranceStandard));
    }

    // 期間の自動クローズロジック
    this.updateInsuranceStandardPeriods(updatedList);
    this.closeInsuranceStandardModal();
    this.cdr.detectChanges();
  }

  deleteInsuranceStandard(index: number) {
    if (confirm('この適用基準を削除してもよろしいですか？')) {
      const updatedList = this.insuranceStandardList.filter((_, i) => i !== index);
      this.updateInsuranceStandardPeriods(updatedList);
      this.cdr.detectChanges();
    }
  }

  /**
   * 保険適用基準の期間を自動更新（開始年月が新しい方の終了月を前の基準の終了月に設定）
   */
  private updateInsuranceStandardPeriods(list: InsuranceStandardView[]) {
    const sorted = [...list].sort((a, b) => {
      const aYM = Number(a.effectiveStartYear) * 100 + Number(a.effectiveStartMonth);
      const bYM = Number(b.effectiveStartYear) * 100 + Number(b.effectiveStartMonth);
      return aYM - bYM;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
    
      let endMonth = Number(next.effectiveStartMonth) - 1;
      let endYear = Number(next.effectiveStartYear);
      if (endMonth === 0) {
        endMonth = 12;
        endYear -= 1;
      }
      current.effectiveEndYear = endYear;
      current.effectiveEndMonth = endMonth;
    }

    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      const endYM = calculateInsuranceEndYearMonth(this.retirementDate, this.hireDate);
      if (endYM) {
        last.effectiveEndYear = endYM.year;
        last.effectiveEndMonth = endYM.month;
      } else {
        last.effectiveEndYear = undefined;
        last.effectiveEndMonth = undefined;
      }
    }

    const descSorted = sorted.sort((a, b) => {
      const aYM = Number(a.effectiveStartYear) * 100 + Number(a.effectiveStartMonth);
      const bYM = Number(b.effectiveStartYear) * 100 + Number(b.effectiveStartMonth);
      return bYM - aYM;
    });

    const updatedViews = descSorted.map(item => this.toInsuranceStandardView(item));
    this.insuranceStandardList = updatedViews;
    this.insuranceStandardsChange.emit(updatedViews);
  }

  /**
   * InsuranceStandard を InsuranceStandardView に変換
   */
  private toInsuranceStandardView(standard: InsuranceStandard): InsuranceStandardView {
    let effectivePeriod = `${standard.effectiveStartYear}/${String(standard.effectiveStartMonth).padStart(2, '0')}`;
    if (standard.effectiveEndYear && standard.effectiveEndMonth) {
      effectivePeriod += ` ~ ${standard.effectiveEndYear}/${String(standard.effectiveEndMonth).padStart(2, '0')}`;
    } else {
      effectivePeriod += ' ~';
    }

    const exceptionTypeLabel = this.getExceptionTypeLabel(standard);

    return {
      ...standard,
      effectivePeriod,
      exceptionTypeLabel
    };
  }

  /**
   * 特例種別のラベルを取得
   */
  private getExceptionTypeLabel(standard: InsuranceStandard): string {
    if (standard.exceptionType === InsuranceExceptionType.NORMAL) return '-';
    if (standard.exceptionType === InsuranceExceptionType.CHILDCARE_LEAVE_EXEMPTION) return '休業免除';

    const isForeign =
      standard.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION ||
      standard.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH ||
      standard.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH;

    if (isForeign) {
      const settings = standard.foreignAgreementSettings;
      const pension = settings ? settings.pensionExempt : standard.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH;
      const health = settings ? settings.healthExempt : standard.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION;

      if (pension && health) return '協定(年・医)';
      if (pension) return '協定(年金)';
      if (health) return '協定(医療)';
      return '協定免除';
    }

    return '-';
  }

  /**
   * ======================================================================
   * 報酬月額（給与）等級履歴 の管理
   * ======================================================================
   */
  openSalaryStandardModal(record?: SalaryStandardView) {
    this.selectedSalaryStandard = record ? { ...record } : null;
    this.isSalaryStandardModalOpen = true;
    this.cdr.detectChanges();
  }

  closeSalaryStandardModal() {
    this.isSalaryStandardModalOpen = false;
    this.selectedSalaryStandard = null;
    this.cdr.detectChanges();
  }

  saveSalaryStandard(salaryStandard: SalaryStandard) {
    const now = new Date().toISOString();
    const updatedList = [...this.salaryStandardList];

    if (this.selectedSalaryStandard && this.selectedSalaryStandard.id) {
      // 編集時
      const index = updatedList.findIndex(r => r.id === this.selectedSalaryStandard?.id);
      if (index >= 0) {
        salaryStandard.updatedAt = now;
        updatedList[index] = this.toSalaryStandardView(salaryStandard);
      }
    } else {
      // 新規追加時
      if (!salaryStandard.id) {
        salaryStandard.id = `salary_${Date.now()}`;
      }
      salaryStandard.createdAt = now;
      salaryStandard.updatedAt = now;
      updatedList.push(this.toSalaryStandardView(salaryStandard));
    }

    this.updateSalaryStandardPeriods(updatedList);
    this.closeSalaryStandardModal();
    this.cdr.detectChanges();
  }

  deleteSalaryStandard(index: number) {
    if (confirm('この報酬月額を削除してもよろしいですか？')) {
      const updatedList = this.salaryStandardList.filter((_, i) => i !== index);
      this.updateSalaryStandardPeriods(updatedList);
      this.cdr.detectChanges();
    }
  }

  /**
   * 報酬月額の期間を自動更新（開始年月が新しい方の終了月を前の基準の終了月に設定）
   */
  private updateSalaryStandardPeriods(list: SalaryStandardView[]) {
    const sorted = [...list].sort((a, b) => {
      const aYM = Number(a.effectiveStartYear) * 100 + Number(a.effectiveStartMonth);
      const bYM = Number(b.effectiveStartYear) * 100 + Number(b.effectiveStartMonth);
      return bYM - aYM;
    });

    const updatedViews = sorted.map(item => this.toSalaryStandardView(item));
    this.salaryStandardList = updatedViews;
    this.salaryStandardsChange.emit(updatedViews);
  }

  /**
   * SalaryStandard を SalaryStandardView に変換
   */
  private toSalaryStandardView(salary: SalaryStandard): SalaryStandardView {
    let effectivePeriod = `${salary.effectiveStartYear}/${String(salary.effectiveStartMonth).padStart(2, '0')}`;
    if (salary.effectiveEndYear && salary.effectiveEndMonth) {
      effectivePeriod += ` ~ ${salary.effectiveEndYear}/${String(salary.effectiveEndMonth).padStart(2, '0')}`;
    } else {
      effectivePeriod += ' ~';
    }

    const monthlyAmountDisplay = `${(salary.monthlyAmount ?? 0).toLocaleString('ja-JP')} 円`;

    return {
      ...salary,
      effectivePeriod,
      monthlyAmountDisplay
    };
  }

  /**
   * ======================================================================
   * 賞与額支給実績の管理
   * ======================================================================
   */

  /**
   * 賞与履歴編集モーダルを開く（新規追加または編集）
   */
  openBonusHistoryModal(record?: BonusHistoryView) {
    this.selectedBonusHistory = record ? { ...record } : null;
    this.isBonusHistoryModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * 賞与履歴編集モーダルを閉じる
   */
  closeBonusHistoryModal() {
    this.isBonusHistoryModalOpen = false;
    this.selectedBonusHistory = null;
    this.cdr.detectChanges();
  }

  get hireFiscalYear(): string {
    if (!this.hireDate) return '';
    const [y, m] = this.hireDate.split('-').map(Number);
    const fiscalYear = m >= 4 ? y : y - 1;
    return `［${fiscalYear}年度］`;
  }
  
  onPreviousInsuranceToggle() {
    if (!this.hasPreviousInsurance) {
      this.previousInsuranceAmount = 0;
    }
    this.emitPreviousInsurance();
  }
  
  onPreviousAmountChange() {
    if (this.previousInsuranceAmount < 0) {
      this.previousInsuranceAmount = 0;
    }
    this.emitPreviousInsurance();
  }
  
  private emitPreviousInsurance() {
    this.previousInsuranceChange.emit({
      hasPreviousInsurance: this.hasPreviousInsurance,
      previousInsuranceAmount: Number(this.previousInsuranceAmount) || 0
    });
  }

  /**
   * 賞与履歴を保存
   */
  saveBonusHistory(bonusHistory: BonusHistory) {
    const now = new Date().toISOString();
    const updatedList = [...this.bonusHistoryList];

    if (this.selectedBonusHistory && this.selectedBonusHistory.id) {
      // 編集時
      const index = updatedList.findIndex(r => r.id === this.selectedBonusHistory?.id);
      if (index >= 0) {
        bonusHistory.updatedAt = now;
        updatedList[index] = this.toBonusHistoryView(bonusHistory);
      }
    } else {
      // 新規追加時
      bonusHistory.id = `bonus_${Date.now()}`;
      bonusHistory.createdAt = now;
      bonusHistory.updatedAt = now;
      updatedList.push(this.toBonusHistoryView(bonusHistory));
    }

    // 支給年月でソート
    const descSorted = [...updatedList].sort((a, b) => {
      const aYM = Number(a.paymentYear) * 100 + Number(a.paymentMonth);
      const bYM = Number(b.paymentYear) * 100 + Number(b.paymentMonth);
      return bYM - aYM;
    });
    
    this.bonusHistoryList = descSorted;
    this.bonusHistoryChange.emit(descSorted);
    this.closeBonusHistoryModal();
    this.cdr.detectChanges();
  }

  /**
   * 賞与履歴を削除
   */
  deleteBonusHistory(index: number) {
    if (confirm('この賞与支給実績を削除してもよろしいですか？')) {
      const updatedList = this.bonusHistoryList.filter((_, i) => i !== index);
      this.bonusHistoryList = updatedList;
      this.bonusHistoryChange.emit(updatedList);
      this.cdr.detectChanges();
    }
  }

  /**
   * BonusHistory を BonusHistoryView に変換
   */
  private toBonusHistoryView(bonus: BonusHistory): BonusHistoryView {
    const paymentPeriod = `${bonus.paymentYear}/${String(bonus.paymentMonth).padStart(2, '0')}`;
    const actualPaymentAmountDisplay = `${(bonus.actualPaymentAmount ?? 0).toLocaleString('ja-JP')} 円`;
    const healthStandardBonusAmountDisplay = `${(bonus.healthStandardBonusAmount ?? bonus.standardBonusAmount ?? 0).toLocaleString('ja-JP')} 円`;
    const pensionStandardBonusAmountDisplay = `${(bonus.pensionStandardBonusAmount ?? bonus.standardBonusAmount ?? 0).toLocaleString('ja-JP')} 円`;
  
    return {
      ...bonus,
      paymentPeriod,
      actualPaymentAmountDisplay,
      healthStandardBonusAmountDisplay,
      pensionStandardBonusAmountDisplay
    };
  }

  /**
   * ======================================================================
   * シミュレーター機能の反映ハンドラー
   * ======================================================================
   */

  /**
   * 定時決定を9月履歴に反映
   */
  onRegularDecisionApplied(result: RegularDecisionResult) {
    if (!result || !result.canApply) return;

    // 1. 直前の有効履歴（8月以前にまたがるもの）を判定年度の08月に自動クローズ
    const prevYM = result.targetStartYear * 100 + 8; // simulationYear/08
    const updatedList: SalaryStandard[] = this.salaryStandardList.map(item => {
      const copy = { ...item };
      const startYM = Number(copy.effectiveStartYear) * 100 + Number(copy.effectiveStartMonth);
      const endYM = (copy.effectiveEndYear && copy.effectiveEndMonth)
        ? Number(copy.effectiveEndYear) * 100 + Number(copy.effectiveEndMonth)
        : 999999;

      if (startYM <= prevYM && endYM > prevYM) {
        copy.effectiveEndYear = result.targetStartYear;
        copy.effectiveEndMonth = 8;
      }
      return copy;
    });

    // 2. 定時決定の新履歴（9月〜退職月または翌年8月）を作成
    const now = new Date().toISOString();
    const existingRef = this.salaryStandardList[0]; // 組織IDや作成者情報を既存レコードから継承

    const newRecord: SalaryStandard = {
      id: `salary_${Date.now()}`,
      employeeId: existingRef?.employeeId || '',
      organizationId: existingRef?.organizationId || '',
      createdBy: existingRef?.createdBy || '',
      effectiveStartYear: result.targetStartYear,
      effectiveStartMonth: result.targetStartMonth,
      effectiveEndYear: result.targetEndYear,
      effectiveEndMonth: result.targetEndMonth,
      monthlyAmount: result.averageAmount,
      salaryGradeId: `grade_${result.calculatedGrade}`,
      salaryGrade: result.calculatedGrade,
      salaryGradeDisplay: result.calculatedGradeDisplay,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    updatedList.push(newRecord);

    // 3. 全体期間更新・自動降順ソート・View変換および親コンポーネント通知
    this.updateSalaryStandardPeriods(updatedList.map(item => this.toSalaryStandardView(item)));
    alert(
      `${result.simulationYear}年度 定時決定を給与履歴に反映しました。\n` +
      `（適用期間: ${result.targetStartYear}/09 〜 ${result.targetEndYear}/${String(result.targetEndMonth).padStart(2, '0')}）`
    );
  }

  /**
   * 随時改定を4ヶ月目から上書き反映
   */
  onVarChangedDecisionApplied(result: VarChangedDecisionResult) {
    if (!result || !result.canApply) return;
  
    // 1. 改定適用期間の算出（4ヶ月目 〜 8月）
    const period = getVarChangedApplicationPeriod(
      result.changeStartYear,
      result.changeStartMonth,
      this.retirementDate,
      this.hireDate
    );
  
    const newStartYM = period.startYear * 100 + period.startMonth;
    const newEndYM = period.endYear * 100 + period.endMonth;
  
    // 改定開始月の直前月（YYYY, MM）
    let prevMonth = period.startMonth - 1;
    let prevYear = period.startYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
  
    // 改定終了月の翌月（YYYY, MM）
    let nextMonth = period.endMonth + 1;
    let nextYear = period.endYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
  
    const updatedList: SalaryStandard[] = [];
  
    // 2. 既存履歴の期間調整・分割処理
    for (const item of this.salaryStandardList) {
      const startYM = Number(item.effectiveStartYear) * 100 + Number(item.effectiveStartMonth);
      const endYM = (item.effectiveEndYear && item.effectiveEndMonth)
        ? Number(item.effectiveEndYear) * 100 + Number(item.effectiveEndMonth)
        : 999999;
  
      // A. 完全に改定期間外（前または後）の履歴 -> そのまま残す
      if (endYM < newStartYM || startYM > newEndYM) {
        updatedList.push({ ...item });
        continue;
      }
  
      // B. 改定期間内に完全にすっぽり収まる履歴 -> 上書きされるため破棄（追加しない）
      if (startYM >= newStartYM && endYM <= newEndYM) {
        continue;
      }
  
      // C. 改定期間をまたいで前後両方に突き抜けている履歴 -> 前と後ろの2つに分割
      if (startYM < newStartYM && endYM > newEndYM) {
        // 前半部分
        updatedList.push({
          ...item,
          effectiveEndYear: prevYear,
          effectiveEndMonth: prevMonth,
          updatedAt: new Date().toISOString()
        });
        // 後半部分
        updatedList.push({
          ...item,
          id: `salary_${Date.now()}_split`,
          effectiveStartYear: nextYear,
          effectiveStartMonth: nextMonth,
          updatedAt: new Date().toISOString()
        });
        continue;
      }
  
      // D. 前からまたがっている履歴 -> 終了月を改定直前月に短縮
      if (startYM < newStartYM && endYM >= newStartYM) {
        updatedList.push({
          ...item,
          effectiveEndYear: prevYear,
          effectiveEndMonth: prevMonth,
          updatedAt: new Date().toISOString()
        });
        continue;
      }
  
      // E. 後ろへまたがっている履歴 -> 開始月を改定終了翌月に繰り下げ
      if (startYM <= newEndYM && endYM > newEndYM) {
        updatedList.push({
          ...item,
          effectiveStartYear: nextYear,
          effectiveStartMonth: nextMonth,
          updatedAt: new Date().toISOString()
        });
        continue;
      }
    }
  
    // 3. 随時改定の新規レコードを作成して追加
    const now = new Date().toISOString();
    const existingRef = this.salaryStandardList[0];
  
    const newRecord: SalaryStandard = {
      id: `salary_${Date.now()}`,
      employeeId: existingRef?.employeeId || '',
      organizationId: existingRef?.organizationId || '',
      createdBy: existingRef?.createdBy || '',
      effectiveStartYear: period.startYear,
      effectiveStartMonth: period.startMonth,
      effectiveEndYear: period.endYear,
      effectiveEndMonth: period.endMonth,
      monthlyAmount: result.averageAmount,
      salaryGradeId: `grade_${result.calculatedGrade}`,
      salaryGrade: result.calculatedGrade,
      salaryGradeDisplay: result.calculatedGradeDisplay,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
  
    updatedList.push(newRecord);
  
    // 4. ソートおよび親への変更通知
    this.updateSalaryStandardPeriods(updatedList.map(item => this.toSalaryStandardView(item)));
  
    alert(
      `随時改定を給与履歴に反映しました。\n` +
      `（適用期間: ${period.startYear}/${String(period.startMonth).padStart(2, '0')} 〜 ` +
      `${period.endYear}/${String(period.endMonth).padStart(2, '0')} / ${result.calculatedGradeDisplay}）`
    );
  }
}

