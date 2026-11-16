import { Component, Input, Output, EventEmitter, ChangeDetectorRef, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  VarChangedDecisionResult,
  simulateVarChangedDecisionNormal,
  simulateVarChangedDecisionMaternityReturn,
  findSalaryHistoryAtMonth,
  getPreviousYearMonth,
  detectOverwriteTargets,
  getVarChangedApplicationPeriod
} from '../../../../utils/salary-simulator.util';
import { SalaryStandard, SalaryStandardView } from '../../../../models/salary-standard.model';

interface MonthInput {
  month: number;
  year: number;
  amount: number;
  daysSufficient: boolean;
}

@Component({
  selector: 'app-salary-simulator-changed',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './salary-simulator-changed.component.html',
  styleUrl: './salary-simulator-changed.component.css'
})
export class SalarySimulatorChangedComponent implements OnChanges {
  @Input() salaryHistories: (SalaryStandard | SalaryStandardView)[] = [];
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';
  @Output() applied = new EventEmitter<VarChangedDecisionResult>();

  isExpanded = false;
  currentYear: number;
  currentMonth: number;

  judgmentMode: 'normal' | 'maternity-return' = 'normal';
  hasFixedWageChange = true;
  noRerequisitionIn3Months = true;
  changeDirection: 'increase' | 'decrease' = 'increase';

  months: MonthInput[] = [];
  previousAmount: number = 0;
  previousGrade: number = 0;
  hasPreviousData: boolean = false;

  simulationResult: VarChangedDecisionResult | null = null;
  showOverwriteConfirm = false;
  overwriteTargets: SalaryStandard[] = [];

  private cdr = inject(ChangeDetectorRef);

  constructor() {
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;
    this.initializeMonthInputs();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['salaryHistories'] || changes['retirementDate'] || changes['hireDate']) && this.isExpanded) {
      this.simulate();
    }
  }

  private initializeMonthInputs() {
    const baseYear = this.isValidYearMonth() ? Number(this.currentYear) : new Date().getFullYear();
    const baseMonth = this.isValidYearMonth() ? Number(this.currentMonth) : new Date().getMonth() + 1;

    this.months = [0, 1, 2].map(offset => {
      const target = this.addMonths(baseYear, baseMonth, offset);
      return {
        month: target.month,
        year: target.year,
        amount: 0,
        daysSufficient: true
      };
    });
  }

  private isValidYearMonth(): boolean {
    const year = Number(this.currentYear);
    const month = Number(this.currentMonth);
    return (
      Number.isInteger(year) &&
      year >= 1950 &&
      year <= 2099 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    );
  }

  private addMonths(year: number, month: number, offset: number): { year: number; month: number } {
    const totalMonths = year * 12 + (month - 1) + offset;
    return {
      year: Math.floor(totalMonths / 12),
      month: (totalMonths % 12) + 1
    };
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.simulate();
    }
    this.cdr.detectChanges();
  }

  onChangeMonthChange() {
    this.initializeMonthInputs();
    this.simulate();
  }

  onModeChange() {
    this.simulate();
  }

  onRequirementChange() {
    this.simulate();
  }

  onAmountChange() {
    this.simulate();
  }

  onDaysCheckChange() {
    this.simulate();
  }

  private simulate() {
    if (!this.isExpanded) return;

    if (!this.validateChangeMonth()) {
      this.cdr.detectChanges();
      return;
    }

    const hasDecimal = this.months.some(m => m.amount !== null && !Number.isInteger(Number(m.amount)));
    if (hasDecimal) {
      this.simulationResult = this.createErrorResult('各月の報酬額に小数は設定できません。整数で入力してください。');
      this.cdr.detectChanges();
      return;
    }

    const hasZeroWithSufficientDays = this.months.some(
      m => m.daysSufficient && (!m.amount || m.amount <= 0)
    );
    if (hasZeroWithSufficientDays) {
      this.simulationResult = this.createErrorResult('支払基礎日数が充足している月は、1円以上の報酬額を入力してください。');
      this.cdr.detectChanges();
      return;
    }

    const [month1, month2, month3] = this.months;
    const year = Number(this.currentYear);
    const month = Number(this.currentMonth);

    if (this.judgmentMode === 'normal') {
      this.simulationResult = simulateVarChangedDecisionNormal(
        year,
        month,
        this.previousGrade,
        this.previousAmount,
        month1,
        month2,
        month3,
        this.hasFixedWageChange,
        this.noRerequisitionIn3Months,
        this.changeDirection,
        this.retirementDate,
        this.hireDate
      );
    } else {
      this.simulationResult = simulateVarChangedDecisionMaternityReturn(
        year,
        month,
        this.previousGrade,
        this.previousAmount,
        month1,
        month2,
        month3,
        this.retirementDate,
        this.hireDate
      );
    }
    this.cdr.detectChanges();
  }

  /**
   * 変動開始月の直前月（従前データ）の妥当性を検証
   */
  private validateChangeMonth(): boolean {
    if (!this.isValidYearMonth()) {
      this.hasPreviousData = false;
      this.previousAmount = 0;
      this.previousGrade = 0;
      this.simulationResult = this.createErrorResult('変動開始年月は1950〜2099年、1〜12月の整数で入力してください。');
      return false;
    }
    // 変動開始月の「直前月」（前月）を算出
    const prev = getPreviousYearMonth(Number(this.currentYear), Number(this.currentMonth));
    const prevHistory = findSalaryHistoryAtMonth(this.salaryHistories, prev.year, prev.month);

    this.hasPreviousData = Boolean(prevHistory);

    if (!prevHistory) {
      this.previousAmount = 0;
      this.previousGrade = 0;
      this.simulationResult = this.createErrorResult(
        `変動開始月の前月（${prev.year}年${prev.month}月）に適用中の給与履歴（従前報酬）が存在しないため判定および入力は行えません。（新規登録は [+ 履歴追加] をご利用ください）`
      );
      return false;
    }

    this.previousAmount = prevHistory.monthlyAmount;
    this.previousGrade = prevHistory.salaryGrade;
    return true;
  }

  private createErrorResult(warningMessage: string): VarChangedDecisionResult {
    return {
      changeStartYear: Number(this.currentYear) || 0,
      changeStartMonth: Number(this.currentMonth) || 0,
      mode: this.judgmentMode,
      hasFixedWageChange: this.hasFixedWageChange,
      noRerequisitionIn3Months: this.noRerequisitionIn3Months,
      changeDirection: this.changeDirection,
      previousGrade: this.previousGrade,
      previousAmount: this.previousAmount,
      months: this.months.map(m => ({ ...m })),
      averageAmount: 0,
      calculatedGrade: 0,
      calculatedGradeDisplay: '',
      gradeDifference: 0,
      canApply: false,
      warningMessages: [warningMessage]
    };
  }

  applyOverwrite() {
    if (!this.simulationResult?.canApply) return;

    this.overwriteTargets = detectOverwriteTargets(
      this.salaryHistories,
      Number(this.currentYear),
      Number(this.currentMonth),
      this.retirementDate,
      this.hireDate
    );

    if (this.overwriteTargets.length > 0) {
      this.showOverwriteConfirm = true;
    } else {
      this.confirmOverwrite();
    }

    this.cdr.detectChanges();
  }

  confirmOverwrite() {
    this.showOverwriteConfirm = false;
    if (this.simulationResult) {
      this.applied.emit(this.simulationResult);
    }
    this.closePanel();
  }

  cancelOverwrite() {
    this.showOverwriteConfirm = false;
    this.overwriteTargets = [];
  }

  clearInputs() {
    this.initializeMonthInputs();
    this.simulate();
  }

  closePanel() {
    this.isExpanded = false;
  }

  getMonth4Display(): string {
    if (!this.isValidYearMonth()) return '--/--';
    const target = this.addMonths(Number(this.currentYear), Number(this.currentMonth), 3);
    return `${target.year}/${String(target.month).padStart(2, '0')}`;
  }

  get applicationPeriodDisplay(): string {
    if (!this.isValidYearMonth()) return '';
    const period = getVarChangedApplicationPeriod(
      Number(this.currentYear),
      Number(this.currentMonth),
      this.retirementDate,
      this.hireDate
    );
    const startStr = `${period.startYear}/${String(period.startMonth).padStart(2, '0')}`;
    const endStr = `${period.endYear}/${String(period.endMonth).padStart(2, '0')}`;
    return `${startStr} 〜 ${endStr}`;
  }
}