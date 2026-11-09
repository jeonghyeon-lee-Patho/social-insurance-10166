import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  simulateVarChangedDecisionNormal,
  simulateVarChangedDecisionMaternityReturn,
  VarChangedDecisionResult,
  hasPreviousDataAtMonth,
  getPreviousAmountAtMonth,
  getPreviousGradeAtMonth,
  getPreviousYearMonth,
  detectOverwriteTargets
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
export class SalarySimulatorChangedComponent implements OnInit, OnDestroy, OnChanges {
  @Input() salaryHistories: (SalaryStandard | SalaryStandardView)[] = [];
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';

  @Output() applied = new EventEmitter<VarChangedDecisionResult>();
  @Output() closed = new EventEmitter<void>();

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
  overwriteTargets: Array<{ id: string; currentPeriod: string }> = [];

  constructor(private cdr: ChangeDetectorRef) {
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth() + 1;
    this.initializeMonthInputs();
  }

  ngOnInit() {}
  ngOnDestroy() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['salaryHistories'] && this.isExpanded) {
      this.validateChangeMonth();
      this.simulate();
    }
  }

  private initializeMonthInputs() {
    this.months = [];
    for (let i = 0; i < 3; i++) {
      let month = this.currentMonth + i;
      let year = this.currentYear;
      if (month > 12) {
        month = month - 12;
        year++;
      }
      this.months.push({
        month,
        year,
        amount: 0,
        daysSufficient: true
      });
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.validateChangeMonth();
      this.simulate();
    }
    this.cdr.detectChanges();
  }

  onChangeMonthChange() {
    this.initializeMonthInputs();
    this.validateChangeMonth();
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

  onDaysCheckChange(monthIndex?: number) {
    this.simulate();
  }

  /**
   * 変動開始月の直前月（従前データ）の妥当性を検証
   */
  private validateChangeMonth(): boolean {
    // 変動開始月の「直前月」（前月）を算出
    const prev = getPreviousYearMonth(Number(this.currentYear), Number(this.currentMonth));

    const historyItems = this.salaryHistories.map(h => ({
      effectiveStartYear: h.effectiveStartYear,
      effectiveStartMonth: h.effectiveStartMonth,
      effectiveEndYear: h.effectiveEndYear,
      effectiveEndMonth: h.effectiveEndMonth,
      monthlyAmount: h.monthlyAmount,
      salaryGrade: h.salaryGrade
    }));

    // 前月に適用中のデータが存在するか確認
    this.hasPreviousData = hasPreviousDataAtMonth(historyItems, prev.year, prev.month);

    if (!this.hasPreviousData) {
      this.previousAmount = 0;
      this.previousGrade = 0;
      this.simulationResult = {
        changeStartYear: this.currentYear,
        changeStartMonth: this.currentMonth,
        mode: this.judgmentMode,
        hasFixedWageChange: this.hasFixedWageChange,
        noRerequisitionIn3Months: this.noRerequisitionIn3Months,
        changeDirection: this.changeDirection,
        previousGrade: 0,
        previousAmount: 0,
        months: this.months,
        averageAmount: 0,
        calculatedGrade: 0,
        calculatedGradeDisplay: '',
        gradeDifference: 0,
        canApply: false,
        warningMessages: [
          `変動開始月の前月（${prev.year}年${prev.month}月）に適用中の給与履歴（従前報酬）が存在しないため判定および入力は行えません。（新規登録は [+ 履歴追加] をご利用ください）`
        ]
      };
      return false;
    }

    // 前月の従前額および従前等級を取得
    this.previousAmount = getPreviousAmountAtMonth(historyItems, prev.year, prev.month);
    this.previousGrade = getPreviousGradeAtMonth(historyItems, prev.year, prev.month);

    return true;
  }

  private simulate() {
    if (!this.isExpanded) return;

    const hasDecimal = this.months.some(m => m.amount !== null && !Number.isInteger(Number(m.amount)));
    if (hasDecimal) {
      this.simulationResult = {
        ...(this.simulationResult as any),
        canApply: false,
        warningMessages: ['各月の報酬額に小数は設定できません。整数で入力してください。']
      };
      this.cdr.detectChanges();
      return;
    }

    const hasZeroWithSufficientDays = this.months.some(
      m => m.daysSufficient && (!m.amount || m.amount <= 0)
    );
    if (hasZeroWithSufficientDays) {
      this.simulationResult = {
        ...(this.simulationResult as any),
        canApply: false,
        warningMessages: ['支払基礎日数が充足している月は、1円以上の報酬額を入力してください。']
      };
      this.cdr.detectChanges();
      return;
    }

    const valid = this.validateChangeMonth();
    if (!valid) {
      this.cdr.detectChanges();
      return;
    }

    const month1 = this.months[0];
    const month2 = this.months[1];
    const month3 = this.months[2];

    if (this.judgmentMode === 'normal') {
      this.simulationResult = simulateVarChangedDecisionNormal(
        this.currentYear,
        this.currentMonth,
        this.previousGrade,
        this.previousAmount,
        month1,
        month2,
        month3,
        this.hasFixedWageChange,
        this.noRerequisitionIn3Months,
        this.changeDirection
      );
    } else {
      this.simulationResult = simulateVarChangedDecisionMaternityReturn(
        this.currentYear,
        this.currentMonth,
        this.previousGrade,
        this.previousAmount,
        month1,
        month2,
        month3
      );
    }

    this.cdr.detectChanges();
  }

  applyOverwrite() {
    if (!this.simulationResult?.canApply) return;
  
    this.overwriteTargets = detectOverwriteTargets(
      this.salaryHistories.map(h => ({
        id: h.id,
        effectiveStartYear: h.effectiveStartYear,
        effectiveStartMonth: h.effectiveStartMonth,
        effectiveEndYear: h.effectiveEndYear,
        effectiveEndMonth: h.effectiveEndMonth
      })),
      this.currentYear,
      this.currentMonth,
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
    this.closed.emit();
  }

  getMonth4Display(): string {
    let month4Month = this.currentMonth + 3;
    let month4Year = this.currentYear;
    if (month4Month > 12) {
      month4Month = month4Month - 12;
      month4Year++;
    }
    return `${month4Year}/${String(month4Month).padStart(2, '0')}`;
  }
}