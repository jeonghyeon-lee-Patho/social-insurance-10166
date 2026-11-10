import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { User } from '@angular/fire/auth';
import { Firestore, collection, doc, setDoc, deleteField } from '@angular/fire/firestore';
import { InsuranceRateMaster, InsuranceType, InsuranceRegion } from '../../../models/insurance-rate.model';
import {
  KYOKAI_CONSTANTS,
  INSURANCE_CONSTANTS,
  REGION_PREFECTURE_MAP,
  getKyokaiRateByPrefecture,
  REGION_DISPLAY_MAP,
} from '../../../data/insurance-rates.data';

@Component({
  selector: 'app-edit-insurance-rate-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './edit-insurance-rate-modal.component.html',
  styleUrl: './edit-insurance-rate-modal.component.css'
})
export class EditInsuranceRateModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() selectedRate: InsuranceRateMaster | null = null;
  @Input() currentUser: User | null = null;
  @Input() existingRates: InsuranceRateMaster[] = [];
  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<void>();

  form: FormGroup;
  isSaving = false;

  InsuranceType = InsuranceType;
  InsuranceRegion = InsuranceRegion;
  REGION_DISPLAY_MAP = REGION_DISPLAY_MAP;
  regions: { value: InsuranceRegion; label: string }[] = [];
  prefectures: string[] = [];

  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(20)]],
      type: [InsuranceType.KYOKAI, Validators.required],
      region: [''],
      prefecture: [{ value: '', disabled: true }],
      healthInsuranceRate: [{ value: 0, disabled: true }, [Validators.required, Validators.min(3.0), Validators.max(13.0), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      careInsuranceRate: [{ value: KYOKAI_CONSTANTS.careInsuranceRate, disabled: true }, [Validators.required, Validators.min(0), Validators.max(5.0), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      pensionInsuranceRate: [{ value: INSURANCE_CONSTANTS.pensionInsuranceRate, disabled: true }],

      // 健康保険の労使割合
      employeePercentage: [50, [Validators.required, Validators.min(0), Validators.max(50), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      employerPercentage: [{ value: 50, disabled: true }],

      // 介護保険の労使割合
      careEmployeePercentage: [50, [Validators.required, Validators.min(0), Validators.max(50), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      careEmployerPercentage: [{ value: 50, disabled: true }]
    });

    this.initializeRegions();
  }

  ngOnInit() {
    this.setupFormListeners();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.isOpen) {
      if (changes['isOpen']?.currentValue || changes['selectedRate']) {
        if (this.selectedRate) {
          this.loadExistingRate();
        } else {
          this.resetForm();
        }
      }
    }
  }

  private initializeRegions() {
    this.regions = Object.entries(REGION_DISPLAY_MAP).map(([value, label]) => ({
      value: value as InsuranceRegion,
      label
    }));
  }

  private setupFormListeners() {
    this.form.get('type')?.valueChanges.subscribe(type => {
      this.onInsuranceTypeChange(type);
      this.cdr.detectChanges();
    });

    this.form.get('region')?.valueChanges.subscribe(region => {
      this.onRegionChange(region);
      this.cdr.detectChanges();
    });

    this.form.get('prefecture')?.valueChanges.subscribe(prefecture => {
      this.onPrefectureChange(prefecture);
      this.cdr.detectChanges();
    });

    // 健康保険割合連動
    this.form.get('employeePercentage')?.valueChanges.subscribe(value => {
      const numericVal = Number(value) || 0;
      const employerPercentage = Math.round((100 - numericVal) * 100) / 100;
      this.form.patchValue({ employerPercentage }, { emitEvent: false });
      this.cdr.detectChanges();
    });

    // 介護保険割合連動
    this.form.get('careEmployeePercentage')?.valueChanges.subscribe(value => {
      const numericVal = Number(value) || 0;
      const careEmployerPercentage = Math.round((100 - numericVal) * 100) / 100;
      this.form.patchValue({ careEmployerPercentage }, { emitEvent: false });
      this.cdr.detectChanges();
    });
  }

  private loadExistingRate() {
    if (!this.selectedRate) return;

    let targetRegion = this.selectedRate.region;

    if (targetRegion) {
      this.prefectures = REGION_PREFECTURE_MAP[targetRegion] || [];
      this.form.get('prefecture')?.enable({ emitEvent: false });
    } else {
      this.prefectures = [];
      this.form.get('prefecture')?.disable({ emitEvent: false });
    }

    this.onInsuranceTypeChange(this.selectedRate.type, false);

    // 新たにモデルに追加されるであろう burdenRatioCare の考慮 (互換性確保)
    const careEmpRatio = (this.selectedRate as any).burdenRatioCare?.employee ?? 50;
    const careEmplrRatio = (this.selectedRate as any).burdenRatioCare?.employer ?? 50;

    this.form.patchValue({
      name: this.selectedRate.name,
      type: this.selectedRate.type,
      region: targetRegion || '',
      prefecture: this.selectedRate.prefecture || '',
      healthInsuranceRate: this.selectedRate.rates.healthInsurance,
      careInsuranceRate: this.selectedRate.rates.careInsurance,
      pensionInsuranceRate: this.selectedRate.rates.pensionInsurance,
      employeePercentage: this.selectedRate.burdenRatio.employee,
      employerPercentage: this.selectedRate.burdenRatio.employer,
      careEmployeePercentage: careEmpRatio,
      careEmployerPercentage: careEmplrRatio
    }, { emitEvent: false });

    this.cdr.detectChanges();
  }

  private resetForm() {
    this.prefectures = [];
    this.form.reset({
      name: '',
      type: InsuranceType.KYOKAI,
      region: '',
      prefecture: '',
      healthInsuranceRate: 0,
      careInsuranceRate: KYOKAI_CONSTANTS.careInsuranceRate,
      pensionInsuranceRate: INSURANCE_CONSTANTS.pensionInsuranceRate,
      employeePercentage: 50,
      employerPercentage: 50,
      careEmployeePercentage: 50,
      careEmployerPercentage: 50
    });

    this.onInsuranceTypeChange(InsuranceType.KYOKAI);
  }

  private onInsuranceTypeChange(type: InsuranceType, resetDefaults = true) {
    if (type === InsuranceType.KYOKAI) {
      this.form.get('region')?.enable();
      this.form.get('healthInsuranceRate')?.disable();
      this.form.get('careInsuranceRate')?.disable();
      this.form.get('employeePercentage')?.disable();
      this.form.get('careEmployeePercentage')?.disable(); 

      if (resetDefaults) {
        this.form.get('prefecture')?.disable();
        this.form.patchValue({
          healthInsuranceRate: 0,
          careInsuranceRate: KYOKAI_CONSTANTS.careInsuranceRate,
          pensionInsuranceRate: INSURANCE_CONSTANTS.pensionInsuranceRate,
          employeePercentage: 50,
          employerPercentage: 50,
          careEmployeePercentage: 50,
          careEmployerPercentage: 50
        }, { emitEvent: false });
      }
    } else {
      this.form.get('region')?.disable();
      this.form.get('prefecture')?.disable();
      this.form.get('healthInsuranceRate')?.enable();
      this.form.get('careInsuranceRate')?.enable();
      this.form.get('employeePercentage')?.enable();
      this.form.get('careEmployeePercentage')?.enable();

      if (resetDefaults) {
        this.form.patchValue({
          region: '',
          prefecture: '',
          healthInsuranceRate: '',
          careInsuranceRate: '',
          pensionInsuranceRate: INSURANCE_CONSTANTS.pensionInsuranceRate,
          employeePercentage: 50,
          employerPercentage: 50,
          careEmployeePercentage: 50,
          careEmployerPercentage: 50
        }, { emitEvent: false });
        this.prefectures = [];
      }
    }
  }

  private onRegionChange(region: InsuranceRegion | '') {
    if (region) {
      this.prefectures = REGION_PREFECTURE_MAP[region] || [];
      this.form.get('prefecture')?.enable();
    } else {
      this.prefectures = [];
      this.form.get('prefecture')?.disable();
    }
    this.form.patchValue({ prefecture: '', healthInsuranceRate: 0 }, { emitEvent: false });
  }

  private onPrefectureChange(prefecture: string) {
    if (prefecture) {
      const rateData = getKyokaiRateByPrefecture(prefecture);
      if (rateData) {
        this.form.patchValue({
          healthInsuranceRate: rateData.healthInsuranceRate,
          careInsuranceRate: rateData.careInsuranceRate,
          pensionInsuranceRate: rateData.pensionInsuranceRate,
          employeePercentage: rateData.employeeBurden,
          employerPercentage: rateData.employerBurden
        }, { emitEvent: false });
      }
    } else {
      this.form.patchValue({ healthInsuranceRate: 0 }, { emitEvent: false });
    }
  }

  /**
   * 小数点入力制限
   */
  onNumberInput(controlName: string, event: Event, maxDecimals: number) {
    const input = event.target as HTMLInputElement;
    let val = input.value;

    if (val.includes('.')) {
      const [integer, decimal] = val.split('.');
      if (decimal && decimal.length > maxDecimals) {
        val = maxDecimals === 0 ? integer : `${integer}.${decimal.substring(0, maxDecimals)}`;
        input.value = val;
        this.form.get(controlName)?.setValue(val, { emitEvent: false });
      }
    }
  }

  async submitForm() {
    if (!this.form.valid || !this.currentUser || !this.isSaveButtonEnabled) {
      return;
    }

    const formValue = this.form.getRawValue();
    const inputName = formValue.name.trim();
    const normalize = (str: string) => str.replace(/\s+/g, '').toLowerCase();
    const targetNormalized = normalize(inputName);

    const isDuplicate = this.existingRates.some(rate => {
      if (this.selectedRate && rate.id === this.selectedRate.id) {
        return false;
      }
      return normalize(rate.name) === targetNormalized;
    });

    if (isDuplicate) {
      alert(`基準名称「${inputName}」は既に登録されているか、類似した名称が存在します。（大文字・小文字・空白は区別されません）`);
      return;
    }

    this.isSaving = true;
    try {
      const docData: Record<string, any> = {
        name: inputName,
        type: formValue.type,
        rates: {
          healthInsurance: Number(formValue.healthInsuranceRate) || 0,
          careInsurance: Number(formValue.careInsuranceRate) || 0,
          pensionInsurance: Number(formValue.pensionInsuranceRate) || 0
        },
        burdenRatio: {
          employee: Number(formValue.employeePercentage) || 0,
          employer: Number(formValue.employerPercentage) || 0
        },
        burdenRatioCare: {
          employee: Number(formValue.careEmployeePercentage) || 0,
          employer: Number(formValue.careEmployerPercentage) || 0
        },
        isActive: true,
        organizationId: this.currentUser.uid,
        updatedAt: new Date().toISOString()
      };

      if (formValue.type === InsuranceType.KYOKAI) {
        docData['region'] = formValue.region;
        docData['prefecture'] = formValue.prefecture;
      } 

      if (this.selectedRate) {
        if (formValue.type !== InsuranceType.KYOKAI) {
          docData['region'] = deleteField();
          docData['prefecture'] = deleteField();
        }
        const docRef = doc(this.firestore, 'insurance_rates', this.selectedRate.id);
        await setDoc(docRef, docData, { merge: true });
      } else {
        docData['applicableEmployeeCount'] = 0;
        docData['createdAt'] = new Date().toISOString();
        docData['createdBy'] = this.currentUser.uid;

        const collectionRef = collection(this.firestore, 'insurance_rates');
        const newDocRef = doc(collectionRef);
        await setDoc(newDocRef, docData);
      }

      this.onSave.emit();
    } catch (error) {
      console.error('保険基準の保存に失敗しました:', error);
      alert('保険基準の保存に失敗しました。');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  closeModal() {
    this.onClose.emit();
  }

  get isSaveButtonEnabled(): boolean {
    if (!this.form.valid || this.isSaving) {
      return false;
    }

    const type = this.form.get('type')?.value;

    if (type === InsuranceType.KYOKAI) {
      return !!this.form.get('prefecture')?.value;
    } else {
      const health = this.form.get('healthInsuranceRate')?.value;
      const care = this.form.get('careInsuranceRate')?.value;
      const empRatio = this.form.get('employeePercentage')?.value;
      const careEmpRatio = this.form.get('careEmployeePercentage')?.value;

      return (
        health !== null && health !== '' && !isNaN(Number(health)) &&
        care !== null && care !== '' && !isNaN(Number(care)) &&
        empRatio !== null && empRatio !== '' && !isNaN(Number(empRatio)) &&
        careEmpRatio !== null && careEmpRatio !== '' && !isNaN(Number(careEmpRatio))
      );
    }
  }
}

