import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BonusHistory, BonusHistoryView } from '../../../../models/bonus-history.model';
import { calculateInsuranceEndYearMonth } from '../../../../utils/employee.util';

@Component({
  selector: 'app-edit-bonus-history-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-bonus-history-modal.component.html',
  styleUrl: './edit-bonus-history-modal.component.css'
})
export class EditBonusHistoryModalComponent implements OnInit {
  @Input() selectedRecord: BonusHistory | null = null;
  @Input() hireDate: string = '';
  @Input() retirementDate: string = '';
  @Input() existingRecords: BonusHistoryView[] = [];
  @Input() previousInsuranceAmount: number = 0;

  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<BonusHistory>();

  paymentYear: number | null = null;
  paymentMonth: number | null = null;
  actualPaymentAmount: number | null = null;
  healthStandardBonusAmount: number | null = null;
  pensionStandardBonusAmount: number | null = null;

  healthInsuranceTotal: number = 0;
  futureBonusCapError: string = '';
  bonusCountWarning = '';
  errors: string[] = [];

  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    if (this.selectedRecord) {
      this.paymentYear = this.selectedRecord.paymentYear;
      this.paymentMonth = this.selectedRecord.paymentMonth;
      this.actualPaymentAmount = this.selectedRecord.actualPaymentAmount;
      this.healthStandardBonusAmount = this.selectedRecord.healthStandardBonusAmount ?? null;
      this.pensionStandardBonusAmount = this.selectedRecord.pensionStandardBonusAmount ?? null;
      this.recalculateBonusState(false);
    } else {
      if (this.hireDate) {
        const [hY, hM] = this.hireDate.split('-').map(Number);
        this.paymentYear = hY;
        this.paymentMonth = hM;
      } else {
        const now = new Date();
        this.paymentYear = now.getFullYear();
        this.paymentMonth = now.getMonth() + 1;
      }
      this.recalculateBonusState(true);
    }
    this.cdr.detectChanges();
  }

  onDateOrAmountChange() {
    this.recalculateBonusState(true);
  }

  /**
   * 既存履歴を1回のみ走査し、年度累計・未来実績の有無・支給回数を一括算出
   */
  private recalculateBonusState(overwriteInputs: boolean) {
    const targetFiscalYear = this.fiscalYear;
    const currentYM = (Number(this.paymentYear) || 0) * 100 + (Number(this.paymentMonth) || 0);

    let fiscalTotal = (this.hireFiscalYear !== null && targetFiscalYear === this.hireFiscalYear)
      ? (Number(this.previousInsuranceAmount) || 0)
      : 0;
    let sameFiscalYearCount = 0;
    let hasFutureBonusInSameFY = false;

    for (const record of this.existingRecords || []) {
      if (this.selectedRecord?.id && record.id === this.selectedRecord.id) continue;

      const rYear = Number(record.paymentYear);
      const rMonth = Number(record.paymentMonth);
      if (!rYear || !rMonth) continue;

      if (this.toFiscalYear(rYear, rMonth) === targetFiscalYear) {
        sameFiscalYearCount++;
        if (currentYM > 0 && (rYear * 100 + rMonth) > currentYM) {
          hasFutureBonusInSameFY = true;
        }

        const stdAmount = record.healthStandardBonusAmount ?? record.standardBonusAmount
          ?? Math.floor((Number(record.actualPaymentAmount) || 0) / 1000) * 1000;
        fiscalTotal += stdAmount;
      }
    }

    this.healthInsuranceTotal = fiscalTotal;

    // 1. 標準賞与額の自動計算
    const amount = this.actualPaymentAmount !== null && this.actualPaymentAmount !== undefined
      ? Number(this.actualPaymentAmount)
      : null;
    let healthCapExceeded = false;

    if (amount !== null && !isNaN(amount) && amount >= 1000) {
      const roundedAmount = Math.floor(amount / 1000) * 1000;
      const remainingHealthCap = Math.max(0, 5730000 - fiscalTotal);

      healthCapExceeded = roundedAmount > remainingHealthCap;

      if (overwriteInputs) {
        this.healthStandardBonusAmount = Math.min(roundedAmount, remainingHealthCap);
        this.pensionStandardBonusAmount = Math.min(roundedAmount, 1500000);
      }
    } else if (overwriteInputs) {
      this.healthStandardBonusAmount = null;
      this.pensionStandardBonusAmount = null;
    }

    // 2. 未来実績との上限コンフリクト警告
    this.futureBonusCapError = (hasFutureBonusInSameFY && healthCapExceeded)
      ? `同一年度（${targetFiscalYear}年度）内に、本支給年月より未来の賞与実績が既に登録されています。過去の賞与に上限キャップ（573万円）を適用することはできません。未来の賞与実績を一度削除または調整した上で、時系列順（過去から未来）に登録してください。`
      : '';

    // 3. 年4回以上支給警告
    const totalCount = sameFiscalYearCount + 1;
    this.bonusCountWarning = (this.paymentYear && totalCount >= 4)
      ? `※ ${targetFiscalYear}年度に計${totalCount}回目の支給となります。就業規則等で年間4回以上の支給が定められている賞与は標準賞与額の対象外となり、毎月の報酬月額（標準報酬月額）への算入対象となります。一時的な決算賞与等でないかご確認ください。`
      : '';
  }

  private toFiscalYear(year: number, month: number): number {
    return month >= 4 ? year : year - 1;
  }

  get fiscalYear(): number {
    const year = Number(this.paymentYear) || new Date().getFullYear();
    const month = Number(this.paymentMonth) || 4;
    return this.toFiscalYear(year, month);
  }

  get hireFiscalYear(): number | null {
    if (!this.hireDate) return null;
    const [hY, hM] = this.hireDate.split('-').map(Number);
    if (!hY || !hM) return null;
    return this.toFiscalYear(hY, hM);
  }

  onSaveClick() {
    if (!this.validate()) {
      this.cdr.detectChanges();
      return;
    }

    const healthStandardAmount = Number(this.healthStandardBonusAmount);
    const pensionStandardAmount = Number(this.pensionStandardBonusAmount);

    const record: BonusHistory = {
      id: this.selectedRecord?.id || `bonus_${Date.now()}`,
      employeeId: this.selectedRecord?.employeeId || '',
      paymentYear: Number(this.paymentYear),
      paymentMonth: Number(this.paymentMonth),
      actualPaymentAmount: Number(this.actualPaymentAmount),
      healthStandardBonusAmount: healthStandardAmount,
      pensionStandardBonusAmount: pensionStandardAmount,
      standardBonusAmount: healthStandardAmount,
      notes: this.selectedRecord?.notes || '',
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

  private validate(): boolean {
    this.errors = [];

    const pY = this.paymentYear ? Number(this.paymentYear) : null;
    const pM = this.paymentMonth ? Number(this.paymentMonth) : null;
    const amount = this.actualPaymentAmount !== null && this.actualPaymentAmount !== undefined ? Number(this.actualPaymentAmount) : null;
    const health = this.healthStandardBonusAmount !== null && this.healthStandardBonusAmount !== undefined ? Number(this.healthStandardBonusAmount) : null;
    const pension = this.pensionStandardBonusAmount !== null && this.pensionStandardBonusAmount !== undefined ? Number(this.pensionStandardBonusAmount) : null;

    // 1. 実支給額の検証
    if (!pY || !pM || pM < 1 || pM > 12 || !Number.isInteger(pY) || !Number.isInteger(pM)) {
      this.errors.push('支給年月が正しく入力されていません。(1〜12月)');
    } else {
      const paymentYM = pY * 100 + pM;

      if (this.hireDate) {
        const [hY, hM] = this.hireDate.split('-').map(Number);
        if (paymentYM < (hY * 100 + hM)) {
          this.errors.push(`支給年月は入社年月（${hY}年${hM}月）以降で設定してください。`);
        }
      }

      if (this.retirementDate) {
        const endYM = calculateInsuranceEndYearMonth(this.retirementDate, this.hireDate);
        if (endYM && paymentYM > (endYM.year * 100 + endYM.month)) {
          this.errors.push(
            `資格喪失月（退職月・月末退職の場合は翌月）以降に支給された賞与は保険料算定対象外のため登録できません。（算定対象上限: ${endYM.year}年${endYM.month}月）`
          );
        }
      }

      const duplicate = (this.existingRecords || []).find(
        record => !(this.selectedRecord?.id && record.id === this.selectedRecord.id) && 
          (Number(record.paymentYear) * 100 + Number(record.paymentMonth)) === paymentYM
      );
      if (duplicate) {
        this.errors.push(
          `同月（${duplicate.paymentPeriod}）に複数回賞与が支給された場合は、個別に登録せず既存の支給データを [編集] して合算額を入力してください。`
        );
      }
    }
    
    // 2. 実支給額の検証
    if (amount === null || isNaN(amount)) {
      this.errors.push('実支給額を入力してください。');
    } else if (amount <= 0) {
      this.errors.push('実支給額は1,000円以上の整数で入力してください。（0円やマイナス値は設定できません）');
    } else if (amount < 1000) {
      this.errors.push('実支給額は1,000円以上で入力してください。（1,000円未満の賞与は保険料算定対象外です）');
    } else if (!Number.isInteger(amount)) {
      this.errors.push('実支給額に小数は設定できません。整数で入力してください。');
    }

    // 3. 健保 標準賞与額の検証
    if (health !== null) {
      if (amount !== null && health > amount) {
        this.errors.push('健保標準賞与額は実支給額以下の金額を設定してください。');
      }
      if (health % 1000 !== 0 || !Number.isInteger(health) || health < 0) {
        this.errors.push('健保標準賞与額は千円単位（小数不可・0円以上）で入力してください。');
      }
      if (this.healthInsuranceTotal + health > 5730000) {
        this.errors.push(`健保標準賞与額の年度累計が法定上限（573万円）を超えています。（現在の累計: ${(this.healthInsuranceTotal + health).toLocaleString()}円）`);
      }
    } else {
      this.errors.push('健保標準賞与額を入力してください。');
    }

    // 4. 厚生 標準賞与額の検証
    if (pension !== null) {
      if (amount !== null && pension > amount) {
        this.errors.push('厚生標準賞与額は実支給額以下の金額を設定してください。');
      }
      if (pension % 1000 !== 0 || !Number.isInteger(pension) || pension < 0) {
        this.errors.push('厚生標準賞与額は千円単位（小数不可・0円以上）で入力してください。');
      }
      if (pension > 1500000) {
        this.errors.push('厚生標準賞与額は1回あたり上限（150万円）以下の金額を設定してください。');
      }
    } else {
      this.errors.push('厚生標準賞与額を入力してください。');
    }

    // 4. 未来実績との上限コンフリクト
    if (this.futureBonusCapError) {
      this.errors.push('未来の賞与実績が存在するため、上限キャップを適用した過去賞与は登録できません。');
    }

    return this.errors.length === 0;
  }
}
