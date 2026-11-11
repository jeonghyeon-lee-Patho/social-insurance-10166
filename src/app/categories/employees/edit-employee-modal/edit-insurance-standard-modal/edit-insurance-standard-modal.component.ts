import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InsuranceStandard, InsuranceExceptionType, ForeignAgreementSettings } from '../../../../models/insurance-standard.model';
import { InsuranceRateMaster } from '../../../../models/insurance-rate.model';

@Component({
  selector: 'app-edit-insurance-standard-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './edit-insurance-standard-modal.component.html',
  styleUrl: './edit-insurance-standard-modal.component.css'
})
export class EditInsuranceStandardModalComponent implements OnInit {
  @Input() selectedRecord: InsuranceStandard | null = null;
  @Input() isFirstRecord: boolean = false;
  @Input() hireDate: string = '';           // 親コンポーネントから入社日
  @Input() retirementDate: string = '';     // 親コンポーネントから退職日
  @Input() insuranceRateMasters: InsuranceRateMaster[] = [];
  @Input() existingRecords: InsuranceStandard[] = [];

  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<InsuranceStandard>();

  form: FormGroup;
  isSaving = false;

  // 特例種別の列挙型
  exceptionTypes = InsuranceExceptionType;

  // 年月選択用
  applicableYears: number[] = [];
  months = Array.from({ length: 12 }, (_, i) => i + 1);

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.form = this.fb.group({
      effectiveStartYear: ['', [Validators.required]],
      effectiveStartMonth: ['', [Validators.required]],
      insuranceRateMasterId: ['', [Validators.required]],
      exceptionType: [InsuranceExceptionType.NORMAL, [Validators.required]],
      // 外国人協定免除設定
      pensionExempt: [false],
      healthExempt: [false],
      careExempt: [false]
    });
  }

  ngOnInit() {
    this.generateApplicableYears();

    if (this.selectedRecord) {
      this.loadExistingRecord();
    } else {
      this.resetForm();
    }

    this.updateStartMonthLock();
  }

  private generateApplicableYears() {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear - 10;
    if (this.hireDate) {
      const [hY] = this.hireDate.split('-').map(Number);
      if (hY) minYear = Math.min(minYear, hY);
    }

    let maxYear = currentYear + 5;
    if (this.retirementDate) {
      const [rY] = this.retirementDate.split('-').map(Number);
      if (rY) maxYear = Math.max(maxYear, rY);
    }

    this.applicableYears = [];
    for (let y = maxYear; y >= minYear; y--) {
      this.applicableYears.push(y);
    }
  }

  get isForeignAgreementSelected(): boolean {
    const val = this.form.get('exceptionType')?.value;
    return (
      val === this.exceptionTypes.FOREIGN_AGREEMENT_PENSION ||
      val === this.exceptionTypes.FOREIGN_AGREEMENT_HEALTH ||
      val === this.exceptionTypes.FOREIGN_AGREEMENT_BOTH
    );
  }

  /**
   * 既存レコードを読み込む
   */
  private loadExistingRecord() {
    if (!this.selectedRecord) return;

    const isForeign = (
      this.selectedRecord.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION ||
      this.selectedRecord.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH ||
      this.selectedRecord.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH
    );

    this.form.patchValue({
      effectiveStartYear: this.selectedRecord.effectiveStartYear,
      effectiveStartMonth: this.selectedRecord.effectiveStartMonth,
      insuranceRateMasterId: this.selectedRecord.insuranceRateMasterId,
      exceptionType: isForeign ? InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION : this.selectedRecord.exceptionType
    });

    // 外国人協定免除設定
    if (this.selectedRecord.foreignAgreementSettings) {
      this.form.patchValue({
        pensionExempt: !!this.selectedRecord.foreignAgreementSettings.pensionExempt,
        healthExempt: !!this.selectedRecord.foreignAgreementSettings.healthExempt,
        careExempt: !!this.selectedRecord.foreignAgreementSettings.careExempt
      });
    } else if (isForeign) {
      this.form.patchValue({
        pensionExempt: this.selectedRecord.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH,
        healthExempt: this.selectedRecord.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION,
        careExempt: false
      });
    }

    this.onExceptionTypeChange();
    this.updateStartMonthLock();
    this.cdr.detectChanges();
  }

  /**
   * フォームをリセット
   */
  private resetForm() {
    // 入社日から開始年月をセット
    if (this.hireDate) {
      const [y, m] = this.hireDate.split('-').map(Number);
      this.form.patchValue({
        effectiveStartYear: y,
        effectiveStartMonth: m,
        insuranceRateMasterId: '',
        exceptionType: InsuranceExceptionType.NORMAL,
        pensionExempt: false,
        healthExempt: false,
        careExempt: false
      });
    } else {
      this.form.reset({
        exceptionType: InsuranceExceptionType.NORMAL,
        pensionExempt: false,
        healthExempt: false,
        careExempt: false
      });
    }

    this.updateStartMonthLock();
    this.cdr.detectChanges();
  }

  /**
   * 開始月のロック状態を更新
   * （編集時で最初のレコード = 入社月の場合のみロック）
   */
  private updateStartMonthLock() {
    const startMonthCtrl = this.form.get('effectiveStartMonth');
    const startYearCtrl = this.form.get('effectiveStartYear');

    if (this.selectedRecord && this.isFirstRecord) {
      startYearCtrl?.disable();
      startMonthCtrl?.disable();
    } else {
      startYearCtrl?.enable();
      startMonthCtrl?.enable();
    }
  }

  /**
   * 特例タイプが変更されたときのハンドラ
   */
  onExceptionTypeChange() {
    const pensionCtrl = this.form.get('pensionExempt');
    const healthCtrl = this.form.get('healthExempt');
    const careCtrl = this.form.get('careExempt');

    if (this.isForeignAgreementSelected) {
      pensionCtrl?.enable();
      healthCtrl?.enable();
      careCtrl?.enable();

      if (!pensionCtrl?.value && !healthCtrl?.value) {
        pensionCtrl?.setValue(true);
      }
    } else {
      pensionCtrl?.disable();
      healthCtrl?.disable();
      careCtrl?.disable();
      pensionCtrl?.setValue(false);
      healthCtrl?.setValue(false);
      careCtrl?.setValue(false);
    }

    this.cdr.detectChanges();
  }

  /**
   * 保存してモーダルを閉じる
   */
  async save() {
    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach(key => {
        this.form.get(key)?.markAsTouched();
      });
      alert('入力内容に誤りがあります。確認してください。');
      return;
    }

    const formValue = this.form.getRawValue();

    if (this.isForeignAgreementSelected && !formValue.pensionExempt && !formValue.healthExempt) {
      alert('外国人協定免除を選択した場合は、厚生年金免除または健康保険免除のいずれか（または両方）を選択してください。');
      return;
    }

    if (!this.validateStartDate()) {
      return;
    }

    this.isSaving = true;
    try {
      let actualExceptionType = formValue.exceptionType;
      let foreignAgreementSettings: ForeignAgreementSettings | undefined;

      if (this.isForeignAgreementSelected) {
        foreignAgreementSettings = {
          pensionExempt: !!formValue.pensionExempt,
          healthExempt: !!formValue.healthExempt,
          careExempt: !!formValue.healthExempt
        };

        if (formValue.pensionExempt && formValue.healthExempt) {
          actualExceptionType = InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH;
        } else if (formValue.pensionExempt) {
          actualExceptionType = InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION;
        } else if (formValue.healthExempt) {
          actualExceptionType = InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH;
        }
      }

      const insuranceStandard: InsuranceStandard = {
        id: this.selectedRecord?.id || '',
        employeeId: this.selectedRecord?.employeeId || '',
        effectiveStartYear: Number(formValue.effectiveStartYear),
        effectiveStartMonth: Number(formValue.effectiveStartMonth),
        effectiveEndYear: this.selectedRecord?.effectiveEndYear,
        effectiveEndMonth: this.selectedRecord?.effectiveEndMonth,
        insuranceRateMasterId: formValue.insuranceRateMasterId,
        insuranceRateMasterName: this.getInsuranceRateMasterName(formValue.insuranceRateMasterId),
        exceptionType: actualExceptionType,
        foreignAgreementSettings,
        createdAt: this.selectedRecord?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: this.selectedRecord?.createdBy || '',
        organizationId: this.selectedRecord?.organizationId || '',
        isActive: true
      };

      this.onSave.emit(insuranceStandard);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * 開始日付の妥当性をチェック
   */
  private validateStartDate(): boolean {
    const rawVal = this.form.getRawValue();
    const year = Number(rawVal.effectiveStartYear);
    const month = Number(rawVal.effectiveStartMonth);

    if (!year || !month) {
      alert('適用開始年月を選択してください。');
      return false;
    }

    const startYM = year * 100 + month;

    if (this.hireDate) {
      const [hireY, hireM] = this.hireDate.split('-').map(Number);
      const hireYM = hireY * 100 + hireM;
      if (startYM < hireYM) {
        alert(`適用開始年月は入社年月（${hireY}/${String(hireM).padStart(2, '0')}）以降の日付を指定してください。`);
        return false;
      }
    }

    if (this.retirementDate) {
      const [rY, rM, rD] = this.retirementDate.split('-').map(Number);
      const lastDay = new Date(rY, rM, 0).getDate();
      let limitY = rY;
      let limitM = rM;
      if (rD !== lastDay) {
        limitM = rM - 1;
        if (limitM === 0) {
          limitM = 12;
          limitY -= 1;
        }
      }
      const limitYM = limitY * 100 + limitM;
      if (startYM > limitYM) {
        alert(`適用開始年月は社会保険の資格喪失前月（${limitY}/${String(limitM).padStart(2, '0')}）以前の日付を指定してください。`);
        return false;
      }
    }

    if (this.selectedRecord && this.existingRecords && this.existingRecords.length > 0) {
      const sorted = [...this.existingRecords].sort((a, b) => {
        const aYM = Number(a.effectiveStartYear) * 100 + Number(a.effectiveStartMonth);
        const bYM = Number(b.effectiveStartYear) * 100 + Number(b.effectiveStartMonth);
        return aYM - bYM;
      });

      const currentIndex = sorted.findIndex(r => r.id === this.selectedRecord?.id);

      if (currentIndex !== -1) {
        if (currentIndex > 0) {
          const prev = sorted[currentIndex - 1];
          const prevYM = Number(prev.effectiveStartYear) * 100 + Number(prev.effectiveStartMonth);
          if (startYM <= prevYM) {
            const prevM = String(prev.effectiveStartMonth).padStart(2, '0');
            alert(`適用開始年月は前の履歴の開始年月（${prev.effectiveStartYear}/${prevM}）より後の年月を指定してください。`);
            return false;
          }
        }

        if (currentIndex < sorted.length - 1) {
          const next = sorted[currentIndex + 1];
          const nextYM = Number(next.effectiveStartYear) * 100 + Number(next.effectiveStartMonth);
          if (startYM >= nextYM) {
            const nextM = String(next.effectiveStartMonth).padStart(2, '0');
            alert(`適用開始年月は次の履歴の開始年月（${next.effectiveStartYear}/${nextM}）より前の年月を指定してください。`);
            return false;
          }
        }
      }
    } else {
      const isDuplicate = this.existingRecords.some(
        record => record.effectiveStartYear === year && record.effectiveStartMonth === month
      );
      if (isDuplicate) {
        alert(`指定された適用開始年月（${year}/${String(month).padStart(2, '0')}）の履歴はすでに登録されています。`);
        return false;
      }
    }

    return true;
  }

  /**
   * 保険基準マスタ名を取得
   */
  private getInsuranceRateMasterName(masterId: string): string {
    if (masterId === 'N/A') {
      return '対象外';
    }
    const master = this.insuranceRateMasters.find(m => m.id === masterId);
    return master?.name || '';
  }

  /**
   * 特例タイプの日本語ラベルを取得
   */
  getExceptionTypeLabel(type: InsuranceExceptionType): string {
    const labels: Record<InsuranceExceptionType, string> = {
      [InsuranceExceptionType.NORMAL]: '通常',
      [InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION]: '外国人社会保障協定免除（年金）',
      [InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH]: '外国人社会保障協定免除（医療）',
      [InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH]: '外国人社会保障協定免除（年金・医療）',
      [InsuranceExceptionType.CHILDCARE_LEAVE_EXEMPTION]: '育児・産前産後休業免除'
    };
    return labels[type] || '不明';
  }

  cancel() {
    this.onClose.emit();
  }
}
