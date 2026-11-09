import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BonusHistory, BonusHistoryView } from '../../../../models/bonus-history.model';


@Component({
  selector: 'app-edit-bonus-history-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './edit-bonus-history-modal.component.html',
  styleUrl: './edit-bonus-history-modal.component.css'
})
export class EditBonusHistoryModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
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
  futureBonusCapError: string = '';

  healthStandardBonusAmount: number | null = null;
  pensionStandardBonusAmount: number | null = null;

  calculatedHealthStandardAmount: number | null = null;
  calculatedPensionStandardAmount: number | null = null;
  healthInsuranceTotal: number = 0;
  pensionCapExceeded = false;
  healthCapExceeded = false;
  bonusCountWarning = '';

  errors: string[] = [];
  isEditing = false;

  private cdr = inject(ChangeDetectorRef);

  private toFiscalYear(year: number, month: number): number {
    return month >= 4 ? year : year - 1;
  }

  get fiscalYear(): number {
    const year = Number(this.paymentYear) || new Date().getFullYear();
    const month = Number(this.paymentMonth) || 1;
    return this.toFiscalYear(year, month);
  }

  get hireFiscalYear(): number | null {
    if (!this.hireDate) return null;
    const [hY, hM] = this.hireDate.split('-').map(Number);
    if (!hY || !hM) return null;
    return this.toFiscalYear(hY, hM);
  }

  ngOnInit() {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen'] && this.isOpen) {
      this.initializeForm();
    }
  }

  private initializeForm() {
    this.errors = [];
    this.futureBonusCapError = '';

    if (this.selectedRecord) {
      this.isEditing = true;
      this.paymentYear = this.selectedRecord.paymentYear;
      this.paymentMonth = this.selectedRecord.paymentMonth;
      this.actualPaymentAmount = this.selectedRecord.actualPaymentAmount;
      this.healthStandardBonusAmount = this.selectedRecord.healthStandardBonusAmount || null;
      this.pensionStandardBonusAmount = this.selectedRecord.pensionStandardBonusAmount || null;
      this.updateStandardBonusAmount(false);
    } else {
      this.isEditing = false;
      if (this.hireDate) {
        const [hY, hM] = this.hireDate.split('-').map(Number);
        this.paymentYear = hY;
        this.paymentMonth = hM;
      } else {
        const now = new Date();
        this.paymentYear = now.getFullYear();
        this.paymentMonth = now.getMonth() + 1;
      }
      this.actualPaymentAmount = null;
      this.healthStandardBonusAmount = null;
      this.pensionStandardBonusAmount = null;
      this.updateStandardBonusAmount(true);
    }

    this.cdr.detectChanges();
  }

  onDateOrAmountChange() {
    this.updateStandardBonusAmount(true);
  }

  onStandardBonusAmountChange() {
    this.cdr.detectChanges();
  }

  private calculateHealthInsuranceTotal(targetFiscalYear: number): number {
    let total = 0;

    if (this.hireFiscalYear !== null && targetFiscalYear === this.hireFiscalYear) {
      total += Number(this.previousInsuranceAmount) || 0;
    }

    if (this.existingRecords && this.existingRecords.length > 0) {
      for (const record of this.existingRecords) {
        if (this.selectedRecord && record.id === this.selectedRecord.id) {
          continue;
        }

        const rYear = Number(record.paymentYear);
        const rMonth = Number(record.paymentMonth);
        if (!rYear || !rMonth) continue;

        if (this.toFiscalYear(rYear, rMonth) === targetFiscalYear) {
          const standardAmount = record.healthStandardBonusAmount !== undefined && record.healthStandardBonusAmount !== null
            ? Number(record.healthStandardBonusAmount)
            : (record.standardBonusAmount !== undefined && record.standardBonusAmount !== null
              ? Number(record.standardBonusAmount)
              : Math.floor((Number(record.actualPaymentAmount) || 0) / 1000) * 1000);

          total += standardAmount;
        }
      }
    }

    return total;
  }

  private updateStandardBonusAmount(overwriteInputs: boolean = false) {
    const pY = Number(this.paymentYear) || 0;
    const pM = Number(this.paymentMonth) || 0;
    const amount = this.actualPaymentAmount !== null && this.actualPaymentAmount !== undefined ? Number(this.actualPaymentAmount) : null;

    const targetFiscalYear = pM >= 4 ? pY : pY - 1;
    this.healthInsuranceTotal = this.calculateHealthInsuranceTotal(targetFiscalYear);

    if (amount !== null && !isNaN(amount) && amount >= 1000) {
      const roundedAmount = Math.floor(amount / 1000) * 1000;

      this.calculatedPensionStandardAmount = Math.min(roundedAmount, 1500000);
      this.pensionCapExceeded = roundedAmount > 1500000;

      const remainingHealthCap = Math.max(0, 5730000 - this.healthInsuranceTotal);
      this.calculatedHealthStandardAmount = Math.min(roundedAmount, remainingHealthCap);
      this.healthCapExceeded = roundedAmount > remainingHealthCap;

      if (overwriteInputs) {
        this.healthStandardBonusAmount = this.calculatedHealthStandardAmount;
        this.pensionStandardBonusAmount = this.calculatedPensionStandardAmount;
      }
    } else {
      this.calculatedHealthStandardAmount = null;
      this.calculatedPensionStandardAmount = null;
      this.pensionCapExceeded = false;
      this.healthCapExceeded = false;

      if (overwriteInputs) {
        this.healthStandardBonusAmount = null;
        this.pensionStandardBonusAmount = null;
      }
    }

    this.checkFutureBonusCapConflict();
    this.updateBonusCountWarning();
  }

  private checkFutureBonusCapConflict() {
    this.futureBonusCapError = '';

    if (!this.paymentYear || !this.paymentMonth || !this.existingRecords) return;

    const currentYM = Number(this.paymentYear) * 100 + Number(this.paymentMonth);
    const targetFiscalYear = this.fiscalYear;

    const futureBonuses = this.existingRecords.filter(record => {
      if (this.selectedRecord && record.id === this.selectedRecord.id) return false;

      const rYear = Number(record.paymentYear);
      const rMonth = Number(record.paymentMonth);
      if (!rYear || !rMonth) return false;

      const rFY = this.toFiscalYear(rYear, rMonth);
      const rYM = rYear * 100 + rMonth;

      return rFY === targetFiscalYear && rYM > currentYM;
    });

    if (futureBonuses.length === 0) return;

    if (this.healthCapExceeded) {
      this.futureBonusCapError = `同一年度（${targetFiscalYear}年度）内に、本支給年月より未来の賞与実績が既に登録されています。過去の賞与に上限キャップ（573万円）を適用することはできません。未来の賞与実績を一度削除または調整した上で、時系列順（過去から未来）に登録してください。`;
    }
  }

  private updateBonusCountWarning() {
    if (!this.paymentYear || !this.existingRecords) {
      this.bonusCountWarning = '';
      return;
    }

    const targetFiscalYear = this.fiscalYear;

    const countInSameFiscalYear = this.existingRecords.filter(record => {
      if (this.selectedRecord && record.id === this.selectedRecord.id) {
        return false;
      }

      const rYear = Number(record.paymentYear);
      const rMonth = Number(record.paymentMonth);
      if (!rYear || !rMonth) return false;

      const recordFiscalYear = rMonth >= 4 ? rYear : rYear - 1;
      return recordFiscalYear === targetFiscalYear;
    }).length;

    const totalCount = countInSameFiscalYear + 1;

    if (totalCount >= 4) {
      this.bonusCountWarning = `※ ${targetFiscalYear}年度に計${totalCount}回目の支給となります。就業規則等で年間4回以上の支給が定められている賞与は標準賞与額の対象外となり、毎月の報酬月額（標準報酬月額）への算入対象となります。一時的な決算賞与等でないかご確認ください。`;
    } else {
      this.bonusCountWarning = '';
    }
  }

  private validate(): boolean {
    this.errors = [];

    const pY = this.paymentYear ? Number(this.paymentYear) : null;
    const pM = this.paymentMonth ? Number(this.paymentMonth) : null;
    const amount = this.actualPaymentAmount !== null && this.actualPaymentAmount !== undefined ? Number(this.actualPaymentAmount) : null;
    const health = this.healthStandardBonusAmount !== null && this.healthStandardBonusAmount !== undefined ? Number(this.healthStandardBonusAmount) : null;
    const pension = this.pensionStandardBonusAmount !== null && this.pensionStandardBonusAmount !== undefined ? Number(this.pensionStandardBonusAmount) : null;

    // 1. 実支給額の検証
    if (amount === null || isNaN(amount)) {
      this.errors.push('実支給額を入力してください。');
    } else if (amount <= 0) {
      this.errors.push('実支給額は1,000円以上の整数で入力してください。（0円やマイナス値は設定できません）');
    } else if (amount < 1000) {
      this.errors.push('実支給額は1,000円以上で入力してください。（1,000円未満の賞与は保険料算定対象外です）');
    } else if (!Number.isInteger(amount)) {
      this.errors.push('実支給額に小数は設定できません。整数で入力してください。');
    }

    // 2. 健保 標準賞与額の検証
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

    // 3. 厚生 標準賞与額の検証
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
      this.errors.push(this.futureBonusCapError);
    }

    // 5. 支給年月の検証
    if (!pY || !pM || pM < 1 || pM > 12 || !Number.isInteger(pY) || !Number.isInteger(pM)) {
      this.errors.push('支給年月が正しく入力されていません。(1〜12月の整数)');
    }

    if (pY && pM) {
      const paymentYM = pY * 100 + pM;

      if (this.hireDate) {
        const [hY, hM] = this.hireDate.split('-').map(Number);
        if (paymentYM < (hY * 100 + hM)) {
          this.errors.push(`支給年月は入社年月（${hY}年${hM}月）以降で設定してください。`);
        }
      }

      if (this.retirementDate) {
        const [rY, rM] = this.retirementDate.split('-').map(Number);
        if (paymentYM > (rY * 100 + rM)) {
          this.errors.push(`支給年月は退職年月（${rY}年${rM}月）以前で設定してください。`);
        }
      }
    }

    this.checkDuplicateMonth();
    return this.errors.length === 0;
  }

  private checkDuplicateMonth() {
    if (!this.paymentYear || !this.paymentMonth || !this.existingRecords) return;

    const newYM = Number(this.paymentYear) * 100 + Number(this.paymentMonth);

    for (const record of this.existingRecords) {
      if (this.selectedRecord?.id === record.id) continue;
      const existYM = Number(record.paymentYear) * 100 + Number(record.paymentMonth);

      if (existYM === newYM) {
        this.errors.push(
          `同月（${record.paymentPeriod}）に複数回賞与が支給された場合は、個別に登録せず既存の支給データを [編集] して合算額を入力してください。`
        );
        break;
      }
    }
  }

  onSaveClick() {
    if (!this.validate()) {
      this.cdr.detectChanges();
      return;
    }

    // ユーザーが入力した値を優先し、未入力なら計算値を使用
    const healthStandardAmount = this.healthStandardBonusAmount !== null && this.healthStandardBonusAmount !== undefined
      ? Number(this.healthStandardBonusAmount)
      : (this.calculatedHealthStandardAmount || 0);
    const pensionStandardAmount = this.pensionStandardBonusAmount !== null && this.pensionStandardBonusAmount !== undefined
      ? Number(this.pensionStandardBonusAmount)
      : (this.calculatedPensionStandardAmount || 0);

    const record: BonusHistory = {
      id: this.selectedRecord?.id || '',
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
    this.errors = [];
    this.onClose.emit();
  }
}