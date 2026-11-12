import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalaryStandard, SalaryStandardView } from '../../../../models/salary-standard.model';
import { determineSalaryGrade, getSalaryGradeByNumber } from '../../../../data/salary-grade-master.data';
import { calculateInsuranceEndYearMonth } from '../../../../utils/employee.util';

@Component({
  selector: 'app-edit-salary-standard-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-salary-standard-modal.component.html',
  styleUrl: './edit-salary-standard-modal.component.css'
})
export class EditSalaryStandardModalComponent implements OnInit {
  @Input() selectedRecord: SalaryStandard | null = null;
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';
  @Input() existingRecords: SalaryStandardView[] = [];

  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<SalaryStandard>();

  // フォームデータ
  startYear: number | null = null;
  startMonth: number | null = null;
  endYear: number | null = null;
  endMonth: number | null = null;
  monthlyAmount: number | null = null;

  // 計算結果表示
  calculatedGradeDisplay = '';
  calculatedGradeNumber = 0;
  calculatedStandardAmount: number | null = null;
  errors: string[] = [];

  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    if (this.selectedRecord) {
      this.startYear = this.selectedRecord.effectiveStartYear;
      this.startMonth = this.selectedRecord.effectiveStartMonth;
      this.endYear = this.selectedRecord.effectiveEndYear || null;
      this.endMonth = this.selectedRecord.effectiveEndMonth || null;
      this.monthlyAmount = this.selectedRecord.monthlyAmount ?? 0;
      this.updateGradeDisplay();
      this.cdr.detectChanges();
    }
  }

  /**
   * 等級表示を更新
   */
  private updateGradeDisplay() {
    const amount = this.monthlyAmount !== null && this.monthlyAmount !== undefined
      ? Number(this.monthlyAmount)
      : NaN;

    if (Number.isInteger(amount) && amount > 0) {
      const gradeData = determineSalaryGrade(amount);
      if (gradeData) {
        this.calculatedGradeNumber = gradeData.grade;
        this.calculatedGradeDisplay = gradeData.displayName;
        this.calculatedStandardAmount = gradeData.baseAmount;
      }
    } else {
      this.calculatedGradeDisplay = '';
      this.calculatedGradeNumber = 0;
      this.calculatedStandardAmount = null;
    }
  }

  /**
   * 月額を入力した際に等級を自動計算
   */
  onMonthlyAmountChange() {
    this.updateGradeDisplay();
  }

  /**
   * バリデーション実行
   */
  private validate(): boolean {
    this.errors = [];

    const sY = this.startYear ? Number(this.startYear) : null;
    const sM = this.startMonth ? Number(this.startMonth) : null;
    const eY = this.endYear ? Number(this.endYear) : null;
    const eM = this.endMonth ? Number(this.endMonth) : null;
    const amount = this.monthlyAmount !== null && this.monthlyAmount !== undefined ? Number(this.monthlyAmount) : null;

    // 報酬月額の検証
    if (amount === null || isNaN(amount) || amount <= 0) {
      this.errors.push('報酬月額に正しい金額（1円以上）を入力してください。0円やマイナス値は設定できません。');
    } else if (!Number.isInteger(amount)) {
      this.errors.push('報酬月額に小数は設定できません。整数で入力してください。');
    }

    // 開始年月の検証
    if (!sY || !sM || sM < 1 || sM > 12 || !Number.isInteger(sY) || !Number.isInteger(sM)) {
      this.errors.push('適用開始年月が正しく入力されていません。(1〜12月)');
    }

    // 終了年月の検証
    if (!eY || !eM || eM < 1 || eM > 12 || !Number.isInteger(eY) || !Number.isInteger(eM)) {
      this.errors.push('適用終了年月が正しく入力されていません。(1〜12月)');
    }

    if (sY && sM && eY && eM) {
      const startYM = sY * 100 + sM;
      const endYM = eY * 100 + eM;

      if (endYM < startYM) {
        this.errors.push('適用終了年月は適用開始年月以降の日付を設定してください。');
      }

      if (this.hireDate) {
        const [hY, hM] = this.hireDate.split('-').map(Number);
        if (startYM < (hY * 100 + hM)) {
          this.errors.push(`適用開始年月は入社年月（${hY}年${hM}月）以降で設定してください。`);
        }
      }

      if (this.retirementDate) {
        const maxValid = calculateInsuranceEndYearMonth(this.retirementDate, this.hireDate);
        if (maxValid && endYM > (maxValid.year * 100 + maxValid.month)) {
          this.errors.push(`適用終了年月は資格喪失に伴う最終適用年月（${maxValid.year}年${maxValid.month}月）以前で設定してください。`);
        }
      }
    }

    // 期間重複チェック
    this.checkPeriodOverlap();
    return this.errors.length === 0;
  }

  /**
   * 既存の履歴と期間が重複していないか確認
   */
  private checkPeriodOverlap() {
    if (!this.existingRecords || this.existingRecords.length === 0 || !this.startYear || !this.startMonth || !this.endYear || !this.endMonth) {
      return;
    }

    const newStartYM = Number(this.startYear) * 100 + Number(this.startMonth);
    const newEndYM = Number(this.endYear) * 100 + Number(this.endMonth);

    for (const record of this.existingRecords) {
      // 編集中の自分自身との比較はスキップ
      if (this.selectedRecord && this.selectedRecord.id && this.selectedRecord.id === record.id) {
        continue;
      }

      const existStartYM = Number(record.effectiveStartYear) * 100 + Number(record.effectiveStartMonth);
      const existEndYM = record.effectiveEndYear && record.effectiveEndMonth
        ? Number(record.effectiveEndYear) * 100 + Number(record.effectiveEndMonth)
        : 999999;

      if (newStartYM <= existEndYM && newEndYM >= existStartYM) {
        this.errors.push(`適用期間が既存の履歴（${record.effectivePeriod}）と重複しています。`);
        break;
      }
    }
  }

  onSaveClick() {
    if (!this.validate()) {
      this.cdr.detectChanges();
      return;
    }

    const gradeData = getSalaryGradeByNumber(this.calculatedGradeNumber);
    if (!gradeData) {
      this.errors.push('等級の取得に失敗しました。');
      this.cdr.detectChanges();
      return;
    }

    const record: SalaryStandard = {
      id: this.selectedRecord?.id || `salary_${Date.now()}`,
      employeeId: this.selectedRecord?.employeeId || '',
      effectiveStartYear: Number(this.startYear),
      effectiveStartMonth: Number(this.startMonth),
      effectiveEndYear: this.endYear ? Number(this.endYear) : undefined,
      effectiveEndMonth: this.endMonth ? Number(this.endMonth) : undefined,
      monthlyAmount: Number(this.monthlyAmount),
      salaryGradeId: `grade_${this.calculatedGradeNumber}`,
      salaryGrade: this.calculatedGradeNumber,
      salaryGradeDisplay: gradeData.displayName,
      createdAt: this.selectedRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: this.selectedRecord?.createdBy || '',
      organizationId: this.selectedRecord?.organizationId || '',
      isActive: this.selectedRecord?.isActive ?? true
    };

    this.onSave.emit(record);
  }

  onCancel() {
    this.onClose.emit();
  }
}
