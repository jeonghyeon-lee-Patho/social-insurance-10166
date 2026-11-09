import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnInit,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  simulateRegularDecision,
  RegularDecisionResult,
  getEligibleMonthsForRegularDecision
} from '../../../../utils/salary-simulator.util';
import { SalaryStandard, SalaryStandardView } from '../../../../models/salary-standard.model';

interface MonthInput {
  month: number;
  amount: number;
  daysSufficient: boolean;
}

@Component({
  selector: 'app-salary-simulator-regular',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './salary-simulator-regular.component.html',
  styleUrl: './salary-simulator-regular.component.css'
})
export class SalarySimulatorRegularComponent implements OnInit, OnChanges {
  @Input() salaryHistories: (SalaryStandard | SalaryStandardView)[] = [];
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';
  @Output() applied = new EventEmitter<RegularDecisionResult>();
  @Output() closed = new EventEmitter<void>();

  isExpanded = false;
  currentYear: number;

  months: MonthInput[] = [
    { month: 4, amount: 0, daysSufficient: true },
    { month: 5, amount: 0, daysSufficient: true },
    { month: 6, amount: 0, daysSufficient: true }
  ];

  simulationResult: RegularDecisionResult | null = null;

  constructor(private cdr: ChangeDetectorRef) {
    this.currentYear = new Date().getFullYear();
  }

  ngOnInit() {
    this.syncEligibleMonths();
    this.simulate();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['salaryHistories'] || changes['retirementDate'] || changes['hireDate']) {
      this.syncEligibleMonths();
      this.simulate();
    }
  }
  
  /**
   * 特定の月が定時決定の対象月か判定
   */
  isMonthEligible(month: number): boolean {
    const eligibleMonths = getEligibleMonthsForRegularDecision(this.currentYear, this.hireDate);
    return eligibleMonths.includes(month);
  }

  /**
   * 対象外の月の入力値とチェック状態を無効化・初期化
   */
  private syncEligibleMonths() {
    for (const m of this.months) {
      if (!this.isMonthEligible(m.month)) {
        m.daysSufficient = false;
        m.amount = 0;
      }
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.syncEligibleMonths();
      this.simulate();
    }
    this.cdr.detectChanges();
  }

  onYearChange() {
    this.syncEligibleMonths();
    this.simulate();
  }

  onDaysCheckChange(monthIndex?: number) {
    this.simulate();
  }

  onAmountChange() {
    this.simulate();
  }

  private simulate() {
    if (!this.isExpanded) return;

    const hasDecimal = this.months.some(m => m.amount !== null && !Number.isInteger(Number(m.amount)));
    if (hasDecimal) {
      this.simulationResult = {
        ... (this.simulationResult as any),
        canApply: false,
        warningMessages: ['各月の報酬額に小数は設定できません。整数で入力してください。']
      };
      this.cdr.detectChanges();
      return;
    }

    const hasZeroWithSufficientDays = this.months.some(
      m => this.isMonthEligible(m.month) && m.daysSufficient && (!m.amount || m.amount <= 0)
    );
    if (hasZeroWithSufficientDays) {
      this.simulationResult = {
        ...(this.simulationResult as any),
        canApply: false,
        warningMessages: ['支払基礎日数が充足している月は、1円以上の報酬額を入力してください。（対象外の月は日数のチェックを外してください）']
      };
      this.cdr.detectChanges();
      return;
    }

    this.simulationResult = simulateRegularDecision(
      this.currentYear,
      this.months[0],
      this.months[1],
      this.months[2],
      this.salaryHistories,
      this.retirementDate,
      this.hireDate
    );
    this.cdr.detectChanges();
  }

  applyToSeptember() {
    if (this.simulationResult?.canApply) {
      this.applied.emit(this.simulationResult);
      this.closePanel();
    }
  }

  clearInputs() {
    this.months = [
      { month: 4, amount: 0, daysSufficient: true },
      { month: 5, amount: 0, daysSufficient: true },
      { month: 6, amount: 0, daysSufficient: true }
    ];
    this.syncEligibleMonths();
    this.simulate();
  }

  closePanel() {
    this.isExpanded = false;
    this.closed.emit();
  }
}
