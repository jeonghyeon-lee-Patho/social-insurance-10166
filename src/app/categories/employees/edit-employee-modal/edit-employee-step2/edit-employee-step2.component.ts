import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InsuranceStandard, InsuranceStandardView, InsuranceExceptionType } from '../../../../models/insurance-standard.model';
import { SalaryStandard, SalaryStandardView } from '../../../../models/salary-standard.model';
import { BonusHistory, BonusHistoryView } from '../../../../models/bonus-history.model';
import { InsuranceRateMaster } from '../../../../models/insurance-rate.model';
import { EditInsuranceStandardModalComponent } from '../edit-insurance-standard-modal/edit-insurance-standard-modal.component';
import { EditSalaryStandardModalComponent } from '../edit-salary-standard-modal/edit-salary-standard-modal.component';
import { EditBonusHistoryModalComponent } from '../edit-bonus-history-modal/edit-bonus-history-modal.component';
import { SalarySimulatorRegularComponent } from '../salary-simulator-regular/salary-simulator-regular.component';
import { SalarySimulatorChangedComponent } from '../salary-simulator-changed/salary-simulator-changed.component';
import { RegularDecisionResult, VarChangedDecisionResult, getVarChangedApplicationPeriod, getPreviousYearMonth } from '../../../../utils/salary-simulator.util';
import { calculateInsuranceEndYearMonth, formatEffectivePeriod } from '../../../../utils/employee.util';

@Component({
  selector: 'app-edit-employee-step2',
  standalone: true,
  imports: [CommonModule, FormsModule, EditInsuranceStandardModalComponent, EditSalaryStandardModalComponent, EditBonusHistoryModalComponent, SalarySimulatorRegularComponent, SalarySimulatorChangedComponent],
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

    if (this.selectedInsuranceStandard?.id) {
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
      const prevEnd = getPreviousYearMonth(
        Number(sorted[i + 1].effectiveStartYear),
        Number(sorted[i + 1].effectiveStartMonth)
      );
      sorted[i].effectiveEndYear = prevEnd.year;
      sorted[i].effectiveEndMonth = prevEnd.month;
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

    const updatedViews = sorted.reverse().map(item => this.toInsuranceStandardView(item));
    this.insuranceStandardList = updatedViews;
    this.insuranceStandardsChange.emit(updatedViews);
  }

  /**
   * InsuranceStandard を InsuranceStandardView に変換
   */
  private toInsuranceStandardView(standard: InsuranceStandard): InsuranceStandardView {
    let effectivePeriod = formatEffectivePeriod(
      standard.effectiveStartYear,
      standard.effectiveStartMonth,
      standard.effectiveEndYear,
      standard.effectiveEndMonth
    );
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

    if (this.selectedSalaryStandard?.id) {
      // 編集時
      const index = updatedList.findIndex(r => r.id === this.selectedSalaryStandard?.id);
      if (index >= 0) {
        salaryStandard.updatedAt = now;
        updatedList[index] = this.toSalaryStandardView(salaryStandard);
      }
    } else {
      // 新規追加時
      salaryStandard.id = `salary_${Date.now()}`;
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
  private updateSalaryStandardPeriods(list: SalaryStandard[]) {
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
    let effectivePeriod = formatEffectivePeriod(
      salary.effectiveStartYear,
      salary.effectiveStartMonth,
      salary.effectiveEndYear,
      salary.effectiveEndMonth
    );
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
  openBonusHistoryModal(record?: BonusHistoryView) {
    this.selectedBonusHistory = record ? { ...record } : null;
    this.isBonusHistoryModalOpen = true;
    this.cdr.detectChanges();
  }

  closeBonusHistoryModal() {
    this.isBonusHistoryModalOpen = false;
    this.selectedBonusHistory = null;
    this.cdr.detectChanges();
  }

  saveBonusHistory(bonusHistory: BonusHistory) {
    const now = new Date().toISOString();
    const updatedList = [...this.bonusHistoryList];

    if (this.selectedBonusHistory?.id) {
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
    const descSorted = updatedList.sort((a, b) => {
      const aYM = Number(a.paymentYear) * 100 + Number(a.paymentMonth);
      const bYM = Number(b.paymentYear) * 100 + Number(b.paymentMonth);
      return bYM - aYM;
    });

    this.bonusHistoryList = descSorted;
    this.bonusHistoryChange.emit(descSorted);
    this.closeBonusHistoryModal();
    this.cdr.detectChanges();
  }

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

  onPreviousAmountChange(event?: Event) {
    const sanitized = Math.max(0, Math.floor(Number(this.previousInsuranceAmount) || 0));
    const capped = Math.min(5730000, sanitized);
    this.previousInsuranceAmount = capped;

    if (event) {
      (event.target as HTMLInputElement).value = String(capped);
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
   * ======================================================================
   * シミュレーター機能の反映ハンドラー
   * ======================================================================
   */
  private getNextYearMonth(year: number, month: number): { year: number; month: number } {
    return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  }

  /**
   * 定時決定を9月履歴に反映
   */
  onRegularDecisionApplied(result: RegularDecisionResult) {
    if (!result || !result.canApply) return;

    const newStartYM = result.targetStartYear * 100 + result.targetStartMonth; // simulationYear/09
    const newEndYM = result.targetEndYear * 100 + result.targetEndMonth;
    const prevYM = getPreviousYearMonth(result.targetStartYear, result.targetStartMonth); // simulationYear/08
    const nextYM = this.getNextYearMonth(result.targetEndYear, result.targetEndMonth);
    const now = new Date().toISOString();

    const updatedList: SalaryStandard[] = [];

    for (const item of this.salaryStandardList) {
      const startYM = Number(item.effectiveStartYear) * 100 + Number(item.effectiveStartMonth);
      const endYM = (item.effectiveEndYear && item.effectiveEndMonth)
        ? Number(item.effectiveEndYear) * 100 + Number(item.effectiveEndMonth)
        : 999999;

      // A. 完全に定時決定期間外 -> そのまま維持
      if (endYM < newStartYM || startYM > newEndYM) {
        updatedList.push({ ...item });
        continue;
      }

      // B. 定時決定期間内に完全に包含される履歴 -> 上書き破棄
      if (startYM >= newStartYM && endYM <= newEndYM) {
        continue;
      }

      // C. 9月前からまたがっている履歴 -> 終了月を8月に自動クローズ
      if (startYM < newStartYM && endYM >= newStartYM) {
        updatedList.push({
          ...item,
          effectiveEndYear: prevYM.year,
          effectiveEndMonth: prevYM.month,
          updatedAt: now
        });
        continue;
      }

      // D. 9月以降から始まり定時決定終了月より後ろへ続く履歴 -> 開始月を翌月に繰り下げ
      if (startYM <= newEndYM && endYM > newEndYM) {
        updatedList.push({
          ...item,
          effectiveStartYear: nextYM.year,
          effectiveStartMonth: nextYM.month,
          updatedAt: now
        });
      }
    }

    const existingRef = this.salaryStandardList[0];

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
    this.updateSalaryStandardPeriods(updatedList);
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
    const prevYM = getPreviousYearMonth(period.startYear, period.startMonth);
    const nextYM = this.getNextYearMonth(period.endYear, period.endMonth);
    const now = new Date().toISOString();

    const updatedList: SalaryStandard[] = [];

    // 2. 既存履歴の期間調整・分割処理
    for (const item of this.salaryStandardList) {
      const startYM = Number(item.effectiveStartYear) * 100 + Number(item.effectiveStartMonth);
      const endYM = (item.effectiveEndYear && item.effectiveEndMonth)
        ? Number(item.effectiveEndYear) * 100 + Number(item.effectiveEndMonth)
        : 999999;

      // A. 完全に改定期間外 -> そのまま残す
      if (endYM < newStartYM || startYM > newEndYM) {
        updatedList.push({ ...item });
        continue;
      }

      // B. 改定期間内に完全にすっぽり収まる履歴 -> 上書き破棄
      if (startYM >= newStartYM && endYM <= newEndYM) {
        continue;
      }

      // C. 前からまたがっている履歴 -> 終了月を改定直前月に短縮（後ろへの分割・復帰は行わない）
      if (startYM < newStartYM && endYM >= newStartYM) {
        updatedList.push({
          ...item,
          effectiveEndYear: prevYM.year,
          effectiveEndMonth: prevYM.month,
          updatedAt: now
        });
        continue;
      }

      // D. 後ろへまたがっている履歴 -> 開始月を改定終了翌月に繰り下げ
      if (startYM <= newEndYM && endYM > newEndYM) {
        updatedList.push({
          ...item,
          effectiveStartYear: nextYM.year,
          effectiveStartMonth: nextYM.month,
          updatedAt: now
        });
      }
    }

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
    this.updateSalaryStandardPeriods(updatedList);

    alert(
      `随時改定を給与履歴に反映しました。\n` +
      `（適用期間: ${period.startYear}/${String(period.startMonth).padStart(2, '0')} 〜 ` +
      `${period.endYear}/${String(period.endMonth).padStart(2, '0')} / ${result.calculatedGradeDisplay}）`
    );
  }
}

