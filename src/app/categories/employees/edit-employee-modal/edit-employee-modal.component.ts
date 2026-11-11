import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { User } from '@angular/fire/auth';
import { Dependent, DependentRelationship, EmployeeView } from '../../../models/employee.model';
import { InsuranceStandardView } from '../../../models/insurance-standard.model';
import { SalaryStandardView } from '../../../models/salary-standard.model';
import { BonusHistoryView } from '../../../models/bonus-history.model';
import { InsuranceRateMaster } from '../../../models/insurance-rate.model';
import {
  calculateAge, checkDependentEligibility, checkSalaryHistoryGaps, getDaysList, getTodayString, getRelationshipLabel,
  katakanaValidator, kanjiValidator, romajiValidator, resolveDateParts, employmentInsuranceValidator
} from '../../../utils/employee.util';
import { EditEmployeeStep2Component } from './edit-employee-step2/edit-employee-step2.component';
import { calculateInsuranceEndYearMonth } from '../../../utils/insurance-calculator.util';
import { EditEmployeeModalService } from './employee-modal.service';

@Component({
  selector: 'app-edit-employee-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, EditEmployeeStep2Component],
  templateUrl: './edit-employee-modal.component.html',
  styleUrl: './edit-employee-modal.component.css'
})
export class EditEmployeeModalComponent implements OnInit {
  @Input() selectedEmployee: EmployeeView | null = null;
  @Input() currentUser: User | null = null;
  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<EmployeeView>();

  currentStep: 1 | 2 = 1;
  form: FormGroup;
  isSaving = false;
  hasLeftStep1 = false;

  currentYear = new Date().getFullYear();
  years: number[] = [];
  hireYears: number[] = [];
  months = Array.from({ length: 12 }, (_, i) => i + 1);

  birthDays: number[] = [];
  hireDays: number[] = [];
  retireDays: number[] = [];
  selectedBirthYear: number | '' = '';
  selectedBirthMonth: number | '' = '';
  selectedBirthDay: number | '' = '';
  selectedHireYear: number | '' = '';
  selectedHireMonth: number | '' = '';
  selectedHireDay: number | '' = '';
  selectedRetireYear: number | '' = '';
  selectedRetireMonth: number | '' = '';
  selectedRetireDay: number | '' = '';

  // 扶養家族情報
  employeeAnnualIncome: number = 0;
  dependents: Dependent[] = [];
  isEditingDependent = false;
  editingIndex = -1;
  editingDependent: Dependent | null = null;

  // 扶養家族の生年月日 3連セレクト用
  selectedDepBirthYear: number | '' = '';
  selectedDepBirthMonth: number | '' = '';
  selectedDepBirthDay: number | '' = '';
  depBirthDays: number[] = [];

  // ステップ2: 保険・報酬・賞与履歴 データ
  insuranceStandardList: InsuranceStandardView[] = [];
  salaryStandardList: SalaryStandardView[] = [];
  bonusHistoryList: BonusHistoryView[] = [];
  insuranceRateMasters: InsuranceRateMaster[] = [];
  hasPreviousInsurance = false;
  previousInsuranceAmount: number = 0;
  isLoadingHistories = false;

  private modalService = inject(EditEmployeeModalService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    for (let y = this.currentYear; y >= 1940; y--) {
      this.years.push(y);
    }

    for (let y = this.currentYear + 1; y >= 1960; y--) {
      this.hireYears.push(y);
    }

    //31日までの日付リスト生成
    this.birthDays = getDaysList(this.currentYear, 1);
    this.hireDays = getDaysList(this.currentYear, 1);
    this.retireDays = getDaysList(this.currentYear, 1);

    this.form = this.fb.group({
      employeeNumber: ['', [Validators.required]],
      nameKanji: ['', [kanjiValidator]],
      nameKana: ['', [Validators.required, katakanaValidator]],
      nameRomaji: ['', [romajiValidator]],
      gender: ['male', [Validators.required]],
      employmentType: ['regular', [Validators.required]],
      department: [''],
      position: [''],
      employmentInsuranceNumber: ['', [employmentInsuranceValidator]],
      dateOfBirth: ['', [Validators.required]],
      hireDate: ['', [Validators.required]],
      retirementDate: [''],
    }, { validators: this.dateOrderValidator() });
  }

  ngOnInit() {
    this.loadInsuranceRateMasters();
    if (this.selectedEmployee) {
      this.currentStep = 2;
      this.loadExistingEmployee();
    } else {
      this.currentStep = 1;
      this.resetForm();
    }
  }

  get isHireDateLocked(): boolean {
    return !!this.selectedEmployee || this.hasLeftStep1;
  }

  /**
   * フォームコントロールへの日付値反映・バリデーション更新
   */
  private updateFormControlDate(controlName: string, dateString: string) {
    const control = this.form.get(controlName);
    control?.setValue(dateString);
    control?.markAsDirty();
    control?.markAsTouched();

    this.form.updateValueAndValidity();
    this.cdr.detectChanges();
  }

  onBirthDatePartChange() {
    const { days, correctedDay, dateString } = resolveDateParts(
      this.selectedBirthYear, this.selectedBirthMonth, this.selectedBirthDay
    );
    this.birthDays = days;
    this.selectedBirthDay = correctedDay;
    this.updateFormControlDate('dateOfBirth', dateString);
  }

  onHireDatePartChange() {
    const { days, correctedDay, dateString } = resolveDateParts(
      this.selectedHireYear, this.selectedHireMonth, this.selectedHireDay
    );
    this.hireDays = days;
    this.selectedHireDay = correctedDay;
    this.updateFormControlDate('hireDate', dateString);
  }

  onRetireDatePartChange() {
    const { days, correctedDay, dateString } = resolveDateParts(
      this.selectedRetireYear, this.selectedRetireMonth, this.selectedRetireDay
    );
    this.retireDays = days;
    this.selectedRetireDay = correctedDay;
    this.updateFormControlDate('retirementDate', dateString);
  }

  /**
   * 日付順序バリデータ（生年月日 < 入社年月日 < 退職年月日）
   */
  private dateOrderValidator() {
    return (group: AbstractControl): ValidationErrors | null => {
      const dateOfBirth = group.get('dateOfBirth')?.value;
      const hireDate = group.get('hireDate')?.value;
      const retirementDate = group.get('retirementDate')?.value;

      const todayStr = getTodayString();
      const errors: ValidationErrors = {};

      if (dateOfBirth && dateOfBirth > todayStr) {
        errors['birthDateInFuture'] = true;
      }

      if (dateOfBirth && hireDate && dateOfBirth >= hireDate) {
        errors['hireDateBeforeBirth'] = true;
      }

      if (hireDate && retirementDate && hireDate > retirementDate) {
        errors['retirementDateBeforeHire'] = true;
      }

      if (retirementDate) {
        let maxHistoryYM = 0;
        for (const std of this.insuranceStandardList) {
          const ym = std.effectiveStartYear * 100 + std.effectiveStartMonth;
          if (ym > maxHistoryYM) maxHistoryYM = ym;
        }

        for (const sal of (this.salaryStandardList || [])) {
          const endYM = sal.effectiveEndYear && sal.effectiveEndMonth
            ? sal.effectiveEndYear * 100 + sal.effectiveEndMonth
            : (sal.effectiveStartYear && sal.effectiveStartMonth ? sal.effectiveStartYear * 100 + sal.effectiveStartMonth : 0);
          if (endYM > maxHistoryYM) maxHistoryYM = endYM;
        }

        for (const b of (this.bonusHistoryList || [])) {
          const bonusYM = (b.paymentYear && b.paymentMonth) ? (b.paymentYear * 100 + b.paymentMonth) : 0;
          if (bonusYM > maxHistoryYM) maxHistoryYM = bonusYM;
        }

        const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);
        if (endYM && maxHistoryYM > 0) {
          const endVal = endYM.year * 100 + endYM.month;
          if (endVal < maxHistoryYM) {
            errors['retirementBeforeHistory'] = true;
          }
        }
      }

      return Object.keys(errors).length > 0 ? errors : null;
    };
  }

  /**
   * 既存の社員情報を読み込む
   */
  private async loadExistingEmployee() {
    if (!this.selectedEmployee || !this.currentUser) return;
    this.hasLeftStep1 = true;
    this.isLoadingHistories = true;

    this.form.patchValue({
      employeeNumber: this.selectedEmployee.employeeNumber,
      nameKanji: this.selectedEmployee.nameKanji || '',
      nameKana: this.selectedEmployee.nameKana || '',
      nameRomaji: this.selectedEmployee.nameRomaji || '',
      gender: this.selectedEmployee.gender || 'male',
      employmentType: this.selectedEmployee.employmentType || 'regular',
      department: this.selectedEmployee.department || '',
      position: this.selectedEmployee.position || '',
      employmentInsuranceNumber: this.selectedEmployee.employmentInsuranceNumber || '',
      dateOfBirth: this.selectedEmployee.dateOfBirth || '',
      hireDate: this.selectedEmployee.hireDate || '',
      retirementDate: this.selectedEmployee.retirementDate || '',
    });

    if (this.selectedEmployee.dateOfBirth) {
      const [y, m, d] = this.selectedEmployee.dateOfBirth.split('-').map(Number);
      this.selectedBirthYear = y || '';
      this.selectedBirthMonth = m || '';
      this.selectedBirthDay = d || '';
      this.birthDays = getDaysList(y, m);
    } else {
      this.selectedBirthYear = this.selectedBirthMonth = this.selectedBirthDay = '';
    }

    if (this.selectedEmployee.hireDate) {
      const [y, m, d] = this.selectedEmployee.hireDate.split('-').map(Number);
      this.selectedHireYear = y || '';
      this.selectedHireMonth = m || '';
      this.selectedHireDay = d || '';
      this.hireDays = getDaysList(y, m);
    } else {
      this.selectedHireYear = this.selectedHireMonth = this.selectedHireDay = '';
    }

    if (this.selectedEmployee.retirementDate) {
      const [y, m, d] = this.selectedEmployee.retirementDate.split('-').map(Number);
      this.selectedRetireYear = y || '';
      this.selectedRetireMonth = m || '';
      this.selectedRetireDay = d || '';
      this.retireDays = getDaysList(y, m);
    } else {
      this.selectedRetireYear = this.selectedRetireMonth = this.selectedRetireDay = '';
    }

    // 前職通算データの復元
    this.hasPreviousInsurance = this.selectedEmployee.hasPreviousInsurance ?? false;
    this.previousInsuranceAmount = this.selectedEmployee.previousInsuranceAmount ?? 0;
    this.employeeAnnualIncome = this.selectedEmployee.employeeAnnualIncome ?? 0;
    this.dependents = this.selectedEmployee.dependents ? [...this.selectedEmployee.dependents] : [];
    this.cancelEditDependent();

    const empId = this.selectedEmployee.id;
    const orgId = this.currentUser.uid;

    try {
      const [standards, salaries, bonuses] = await Promise.all([
        this.modalService.loadInsuranceStandards(empId, orgId),
        this.modalService.loadSalaryStandards(empId, orgId),
        this.modalService.loadBonusHistories(empId, orgId)
      ]);

      this.insuranceStandardList = standards.length > 0 ? standards : [
        this.modalService.generateDefaultInsuranceStandard(
          this.form.get('hireDate')?.value,
          this.form.get('retirementDate')?.value,
          empId,
          orgId
        )
      ];

      this.salaryStandardList = salaries;
      this.bonusHistoryList = bonuses;
    } catch (e) {
      console.error('履歴読み込みエラー:', e);
    } finally {
      this.isLoadingHistories = false;
      this.form.updateValueAndValidity();
      this.cdr.detectChanges();
    }
  }

  /**
   * フォームをリセット
   */
  private resetForm() {
    this.form.reset({
      employeeNumber: '',
      nameKanji: '',
      nameKana: '',
      nameRomaji: '',
      gender: 'male',
      employmentType: 'regular',
      department: '',
      position: '',
      employmentInsuranceNumber: '',
      dateOfBirth: '',
      hireDate: '',
      retirementDate: '',
    });

    this.selectedBirthYear = this.selectedBirthMonth = this.selectedBirthDay = '';
    this.selectedHireYear = this.selectedHireMonth = this.selectedHireDay = '';
    this.selectedRetireYear = this.selectedRetireMonth = this.selectedRetireDay = '';

    this.hasLeftStep1 = false;
    this.insuranceStandardList = [];
    this.salaryStandardList = [];
    this.bonusHistoryList = [];
    this.hasPreviousInsurance = false;
    this.previousInsuranceAmount = 0;
    this.employeeAnnualIncome = 0;
    this.dependents = [];
    this.cancelEditDependent();
    this.form.get('employeeNumber')?.enable();
    this.cdr.detectChanges();
  }

  /**
   * Step 1が有効か判定するゲッター
   */
  get isStep1Valid(): boolean {
    const step1Controls = [
      'employeeNumber', 'nameKanji', 'nameKana', 'nameRomaji',
      'gender', 'employmentType', 'employmentInsuranceNumber',
      'dateOfBirth', 'hireDate', 'retirementDate'
    ];

    const areControlsValid = step1Controls.every(name => {
      const c = this.form.get(name);
      return c ? c.valid : true;
    });

    if (!areControlsValid) return false;
    if (
      this.form.hasError('birthDateInFuture') ||
      this.form.hasError('hireDateBeforeBirth') ||
      this.form.hasError('retirementDateBeforeHire') ||
      this.form.hasError('retirementBeforeHistory')
    ) {
      return false;
    }

    return true;
  }

  sanitizeEmployeeIncome() {
    this.employeeAnnualIncome = Math.max(0, Math.floor(Number(this.employeeAnnualIncome) || 0));
  }

  sanitizeDepNumber(field: 'expectedAnnualIncome' | 'remittanceAmount') {
    if (this.editingDependent) {
      this.editingDependent[field] = Math.max(0, Math.floor(Number(this.editingDependent[field]) || 0));
    }
  }

  onDepBirthDatePartChange() {
    const { days, correctedDay, dateString } = resolveDateParts(
      this.selectedDepBirthYear, this.selectedDepBirthMonth, this.selectedDepBirthDay
    );
    this.depBirthDays = days;
    this.selectedDepBirthDay = correctedDay;
    if (this.editingDependent) {
      this.editingDependent.dateOfBirth = dateString;
    }
  }

  startAddDependent() {
    this.editingIndex = -1;
    this.editingDependent = {
      id: `dep_${Date.now()}`,
      name: '',
      relationship: 'spouse' as DependentRelationship,
      dateOfBirth: '',
      isLivingTogether: true,
      expectedAnnualIncome: 0,
      remittanceAmount: 0,
      isDisability: false,
    };
    this.selectedDepBirthYear = '';
    this.selectedDepBirthMonth = '';
    this.selectedDepBirthDay = '';
    this.depBirthDays = getDaysList(this.currentYear, 1);
    this.isEditingDependent = true;
    this.cdr.detectChanges();
  }

  startEditDependent(dep: Dependent, index: number) {
    if (this.isEditingDependent && this.editingIndex === index) {
      this.cancelEditDependent();
      return;
    }

    this.editingIndex = index;
    this.editingDependent = { ...dep };

    if (dep.dateOfBirth) {
      const [y, m, d] = dep.dateOfBirth.split('-').map(Number);
      this.selectedDepBirthYear = y || '';
      this.selectedDepBirthMonth = m || '';
      this.selectedDepBirthDay = d || '';
      this.depBirthDays = getDaysList(y, m);
    } else {
      this.selectedDepBirthYear = '';
      this.selectedDepBirthMonth = '';
      this.selectedDepBirthDay = '';
      this.depBirthDays = getDaysList(this.currentYear, 1);
    }

    this.isEditingDependent = true;
    this.cdr.detectChanges();
  }

  cancelEditDependent() {
    this.isEditingDependent = false;
    this.editingIndex = -1;
    this.editingDependent = null;
    this.selectedDepBirthYear = '';
    this.selectedDepBirthMonth = '';
    this.selectedDepBirthDay = '';
    this.cdr.detectChanges();
  }

  saveDependent() {
    if (!this.editingDependent) return;

    const name = this.editingDependent.name ? this.editingDependent.name.trim() : '';
    if (!name) {
      alert('氏名を入力してください。');
      return;
    }

    if (!this.selectedDepBirthYear || !this.selectedDepBirthMonth || !this.selectedDepBirthDay) {
      alert('生年月日（年・月・日）をすべて選択してください。');
      return;
    }

    const y = this.selectedDepBirthYear;
    const m = String(this.selectedDepBirthMonth).padStart(2, '0');
    const d = String(this.selectedDepBirthDay).padStart(2, '0');
    const birthDateStr = `${y}-${m}-${d}`;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (birthDateStr > todayStr) {
      alert('生年月日に本日より未来の日付は指定できません。');
      return;
    }

    this.editingDependent.name = name;
    this.editingDependent.dateOfBirth = birthDateStr;
    this.editingDependent.expectedAnnualIncome = Math.max(0, Number(this.editingDependent.expectedAnnualIncome) || 0);

    if (this.editingDependent.isLivingTogether) {
      this.editingDependent.remittanceAmount = 0;
    } else {
      this.editingDependent.remittanceAmount = Math.max(0, Number(this.editingDependent.remittanceAmount) || 0);
    }

    if (this.editingIndex === -1) {
      this.dependents.push({ ...this.editingDependent });
    } else {
      this.dependents[this.editingIndex] = { ...this.editingDependent };
    }

    this.cancelEditDependent();
    this.cdr.detectChanges();
  }

  deleteDependent(index: number, event: Event) {
    event.stopPropagation();

    const target = this.dependents[index];
    const targetName = target?.name ? `「${target.name}」` : 'この扶養家族';
    if (!confirm(`${targetName}を削除してもよろしいですか？`)) {
      return;
    }

    this.dependents.splice(index, 1);
    if (this.editingIndex === index) {
      this.cancelEditDependent();
    }
    this.cdr.detectChanges();
  }

  getDependentStatusClass(dep: Dependent): string {
    const res = checkDependentEligibility(dep, this.employeeAnnualIncome);
    if (!res.isHealthEligible) {
      return 'ineligible-health';
    }
    return '';
  }

  getDependentStatusBadgeText(dep: Dependent): string {
    const res = checkDependentEligibility(dep, this.employeeAnnualIncome);
    const age = calculateAge(dep.dateOfBirth);

    if (!res.isHealthEligible) {
      return '❌ 健保対象外';
    }
    if (res.isPension3Eligible) {
      return '健保: ◯ / 3号: ◯';
    }
    if (dep.relationship === 'spouse' && (age >= 60 || age < 20)) {
      return '健保: ◯ / 3号: ✕';
    }

    return '健保: ◯';
  }

  getDependentAge(dateOfBirth: string): number {
    return dateOfBirth ? calculateAge(dateOfBirth) : 0;
  }

  getRelationshipText(rel: DependentRelationship): string {
    return getRelationshipLabel(rel);
  }

  private async loadInsuranceRateMasters() {
    if (!this.currentUser) return;
    try {
      this.insuranceRateMasters = await this.modalService.loadInsuranceRateMasters(this.currentUser.uid);
      this.cdr.detectChanges();
    } catch (error) {
      console.error(error);
    }
  }

  private generateDefaultInsuranceStandard() {
    if (this.insuranceStandardList.length > 0 || !this.currentUser) return;
    const hireDate = this.form.get('hireDate')?.value;
    if (!hireDate) return;

    this.insuranceStandardList = [
      this.modalService.generateDefaultInsuranceStandard(
        hireDate,
        this.form.get('retirementDate')?.value,
        this.selectedEmployee?.id || '',
        this.currentUser.uid
      )
    ];
  }

  private syncInsuranceStandardsWithDates() {
    if (this.insuranceStandardList.length === 0) return;

    const hireDate = this.form.get('hireDate')?.value;
    const retirementDate = this.form.get('retirementDate')?.value;
    const lastIndex = this.insuranceStandardList.length - 1;

    if (hireDate) {
      const [hireY, hireM] = hireDate.split('-').map(Number);
      this.insuranceStandardList[lastIndex].effectiveStartYear = hireY;
      this.insuranceStandardList[lastIndex].effectiveStartMonth = hireM;
    }

    const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);
    if (endYM) {
      this.insuranceStandardList[0].effectiveEndYear = endYM.year;
      this.insuranceStandardList[0].effectiveEndMonth = endYM.month;
    } else {
      this.insuranceStandardList[0].effectiveEndYear = undefined;
      this.insuranceStandardList[0].effectiveEndMonth = undefined;
    }

    this.insuranceStandardList = this.insuranceStandardList.map(item => {
      let effectivePeriod = `${item.effectiveStartYear}/${String(item.effectiveStartMonth).padStart(2, '0')}`;
      if (item.effectiveEndYear && item.effectiveEndMonth) {
        effectivePeriod += ` ~ ${item.effectiveEndYear}/${String(item.effectiveEndMonth).padStart(2, '0')}`;
      } else {
        effectivePeriod += ' ~';
      }
      return { ...item, effectivePeriod };
    });
  }

  /**
   * 新規社員登録時、報酬月額のデフォルトレコードを自動生成
   * 期間：入社年月 〜 入社年8月（入社月が6月以降なら翌年8月）
   * デフォルト報酬月額：0円（第1級）
   */
  private generateDefaultSalaryStandard() {
    if (this.salaryStandardList.length > 0 || !this.currentUser) return;
    const hireDate = this.form.get('hireDate')?.value;
    if (!hireDate) return;

    this.salaryStandardList = [
      this.modalService.generateDefaultSalaryStandard(
        hireDate,
        this.form.get('retirementDate')?.value,
        this.selectedEmployee?.id || '',
        this.currentUser.uid
      )
    ];
  }

  goToPreviousStep() {
    if (this.currentStep > 1) {
      this.currentStep = (this.currentStep - 1) as 1 | 2;
      this.cdr.detectChanges();
    }
  }

  goToNextStep() {
    if (this.currentStep < 2) {
      this.hasLeftStep1 = true;

      if (!this.selectedEmployee && this.insuranceStandardList.length === 0) {
        this.generateDefaultInsuranceStandard();
      } else {
        this.syncInsuranceStandardsWithDates();
      }

      if (!this.selectedEmployee && this.salaryStandardList.length === 0) {
        this.generateDefaultSalaryStandard();
      }

      this.currentStep = (this.currentStep + 1) as 1 | 2;
      this.cdr.detectChanges();
    }
  }

  /**
   * 保存してモーダルを閉じる
   */
  async saveAndClose() {
    if (this.isLoadingHistories) {
      alert('履歴データを読み込み中です。完了するまでお待ちください。');
      return;
    }

    if (!this.isStep1Valid) {
      Object.keys(this.form.controls).forEach(key => this.form.get(key)?.markAsTouched());
      alert('基本情報に入力エラーがあります。確認してください。');
      this.currentStep = 1;
      this.cdr.detectChanges();
      return;
    }

    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach(key => this.form.get(key)?.markAsTouched());
      alert('入力内容に誤りがあります。確認してください。');
      return;
    }

    if (!this.currentUser) return;

    this.isSaving = true;
    try {
      const formValue = this.form.getRawValue();

      const hasMissingHistory = checkSalaryHistoryGaps(
        formValue.hireDate,
        formValue.retirementDate,
        this.salaryStandardList
      );

      const hasIneligibleDependent = this.dependents.some(dep => {
        return !checkDependentEligibility(dep, this.employeeAnnualIncome).isHealthEligible;
      });

      const isNumberChanged = !this.selectedEmployee || this.selectedEmployee.employeeNumber !== formValue.employeeNumber;
      if (isNumberChanged) {
        const isDuplicate = await this.modalService.isEmployeeNumberDuplicate(
          formValue.employeeNumber,
          this.currentUser.uid,
          this.selectedEmployee?.id
        );
        if (isDuplicate) {
          this.isSaving = false;
          this.currentStep = 1;
          this.cdr.detectChanges();
          alert('この社員番号は既に使用されています。');
          return;
        }
      }

      const savedEmployee = await this.modalService.saveEmployeeAll({
        selectedEmployee: this.selectedEmployee,
        currentUserUid: this.currentUser.uid,
        formValue,
        hasMissingHistory,
        hasIneligibleDependent,
        employeeAnnualIncome: Number(this.employeeAnnualIncome) || 0,
        dependents: this.dependents,
        hasPreviousInsurance: this.hasPreviousInsurance,
        previousInsuranceAmount: this.previousInsuranceAmount,
        insuranceStandardList: this.insuranceStandardList,
        salaryStandardList: this.salaryStandardList,
        bonusHistoryList: this.bonusHistoryList
      });

      this.onSave.emit(savedEmployee);
      this.onClose.emit();
    } catch (error) {
      console.error('社員情報の保存に失敗しました:', error);
      alert('保存に失敗しました。');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  /* キャンセル */
  cancel() {
    if (confirm('編集内容を破棄してもよろしいですか？')) {
      this.onClose.emit();
    }
  }

  /* エラーメッセージを取得 */
  getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    const groupErrors = this.form.errors;

    if (control && control.errors) {
      if (control.errors['required']) return '必須項目です';
      if (control.errors['invalidKana']) return 'カタカナで入力してください';
      if (control.errors['invalidKanji']) return '日本語文字（漢字・ひらがな・カタカナ）で入力してください';
      if (control.errors['invalidRomaji']) return '半角英字とスペースのみ使用可能です';
      if (control.errors['invalidEmploymentInsurance']) {
        return '雇用保険番号は4桁-6桁-1桁（例: 1234-567890-1）または11桁で入力してください';
      }
    }

    if (groupErrors) {
      if (controlName === 'dateOfBirth' && groupErrors['birthDateInFuture']) {
        return '生年月日は本日以前の日付を指定してください';
      }
      if (controlName === 'hireDate' && groupErrors['hireDateBeforeBirth']) {
        return '入社年月日は生年月日より後の日付にしてください';
      }
      if (controlName === 'retirementDate') {
        if (groupErrors['retirementDateBeforeHire']) {
          return '退職年月日は入社年月日以降の日付にしてください';
        }
        if (groupErrors['retirementBeforeHistory']) {
          return '退職年月日は既存の履歴（保険・給与・賞与）の最新年月以降にしてください';
        }
      }
    }
    return control?.invalid ? '入力値が無効です' : '';
  }

  getDisplayNameForModal(): string {
    const nameKanji = this.form.get('nameKanji')?.value;
    const nameRomaji = this.form.get('nameRomaji')?.value;
    const nameKana = this.form.get('nameKana')?.value;
    return nameKanji || nameRomaji || nameKana || '名前未設定';
  }

  /**
   * Step 2から適用基準データの更新を受け取る
   */
  onInsuranceStandardsChange(updatedList: InsuranceStandardView[]) {
    this.insuranceStandardList = updatedList;
    this.cdr.detectChanges();
  }

  onSalaryStandardsChange(updatedList: SalaryStandardView[]) {
    this.salaryStandardList = updatedList;
    this.cdr.detectChanges();
  }

  onBonusHistoryChange(updatedList: BonusHistoryView[]) {
    this.bonusHistoryList = updatedList;
    this.cdr.detectChanges();
  }

  onPreviousInsuranceChange(event: { hasPreviousInsurance: boolean; previousInsuranceAmount: number }) {
    this.hasPreviousInsurance = event.hasPreviousInsurance;
    this.previousInsuranceAmount = event.previousInsuranceAmount;
    this.cdr.detectChanges();
  }
}
